import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4 * 1024;
const ESKIZ_TIMEOUT_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/i;

type SendBody = { invite_id?: unknown; token?: unknown };
type InviteRow = {
  id: string;
  request_id: string;
  supplier_id: string;
  created_by: string;
  channel: string;
  recipient: string | null;
  token_hash: string;
  status: string;
  expires_at: string;
};
type RequestRow = {
  id: string;
  status: string;
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
};
type SupplierRow = { id: string; contact_count: number | null };
type EskizLoginPayload = { data?: { token?: unknown }; message?: unknown };
type EskizSendPayload = { id?: unknown; message?: unknown; status?: unknown };

let cachedEskizToken = "";
let cachedEskizTokenAt = 0;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

function requestIsCrossSite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function safeTokenMatch(token: string, expectedHash: string) {
  if (!TOKEN_RE.test(token) || !/^[0-9a-f]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeUzPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^998\d{9}$/.test(digits)) return digits;
  if (/^\d{9}$/.test(digits)) return `998${digits}`;
  return "";
}

function requestRoute(record: RequestRow) {
  const origin = record.origin?.trim() || "";
  const destination = record.destination?.trim() || "";
  if (origin && destination) return `${origin} - ${destination}`;
  return destination || origin || "Ko'rsatilmagan";
}

function requestDate(value: string | null) {
  if (!value) return "Ko'rsatilmagan";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function supplierSmsText(record: RequestRow, url: string) {
  return `My Agent Air: Yangi B2B so'rov. Yo'nalish: ${requestRoute(record)}. Sana: ${requestDate(record.travel_date)}. Taklif yuborish: ${url}`;
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESKIZ_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

async function getEskizToken(email: string, password: string, force = false) {
  if (!force && cachedEskizToken && Date.now() - cachedEskizTokenAt < 20 * 60 * 1000) {
    return cachedEskizToken;
  }

  const form = new FormData();
  form.set("email", email);
  form.set("password", password);

  const response = await fetchWithTimeout("https://notify.eskiz.uz/api/auth/login", {
    method: "POST",
    headers: { "Accept": "application/json" },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as EskizLoginPayload;
  const token = typeof payload.data?.token === "string" ? payload.data.token.trim() : "";
  if (!response.ok || !token) throw new Error("eskiz_auth_failed");

  cachedEskizToken = token;
  cachedEskizTokenAt = Date.now();
  return token;
}

async function sendEskizSms(token: string, phone: string, message: string, from: string) {
  const form = new FormData();
  form.set("mobile_phone", phone);
  form.set("message", message);
  form.set("from", from);

  const response = await fetchWithTimeout("https://notify.eskiz.uz/api/message/sms/send", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as EskizSendPayload;
  return { response, payload };
}

export async function POST(request: NextRequest, deliveryClaimId?: string) {
  if (requestIsCrossSite(request)) return json({ code: "FORBIDDEN", message: "So‘rov qabul qilinmadi." }, 403);

  const accessToken = bearerToken(request);
  if (!accessToken) return json({ code: "NOT_AUTHENTICATED", message: "Qayta kiring." }, 401);

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("Supplier SMS outreach unavailable: missing SUPABASE_SECRET_KEY");
    return json({ code: "OUTREACH_UNAVAILABLE", message: "Yuborish xizmati vaqtincha ishlamayapti." }, 503);
  }

  const body = await readBoundedJson<SendBody>(request, MAX_BODY_BYTES);
  const inviteId = typeof body?.invite_id === "string" ? body.invite_id.trim() : "";
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!UUID_RE.test(inviteId) || !TOKEN_RE.test(token)) {
    return json({ code: "INVALID_REQUEST", message: "So‘rov ma’lumotlari noto‘g‘ri." }, 400);
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  const user = userData.user;
  if (userError || !user?.id) return json({ code: "NOT_AUTHENTICATED", message: "Qayta kiring." }, 401);

  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  async function markInviteFailed(inviteIdToMark: string, reason: string) {
    await admin
      .from("supplier_invites")
      .update({ status: "failed", failure_reason: reason.slice(0, 500) })
      .eq("id", inviteIdToMark)
      .eq("status", "queued");
  }

  const [{ data: actor, error: actorError }, { data: invite, error: inviteError }] = await Promise.all([
    admin.from("profiles").select("id,role,is_active,registration_status").eq("id", user.id).maybeSingle(),
    admin
      .from("supplier_invites")
      .select("id,request_id,supplier_id,created_by,channel,recipient,token_hash,status,expires_at")
      .eq("id", inviteId)
      .maybeSingle(),
  ]);

  if (actorError || !actor || actor.is_active !== true || actor.registration_status !== "active") {
    return json({ code: "ACCOUNT_INACTIVE", message: "Hisob faol emas." }, 403);
  }
  if (inviteError || !invite) return json({ code: "INVITE_NOT_FOUND", message: "So‘rov topilmadi." }, 404);

  const typedInvite = invite as InviteRow;
  if (typedInvite.created_by !== user.id && actor.role !== "admin") {
    return json({ code: "FORBIDDEN", message: "Bu so‘rovni yuborish huquqi yo‘q." }, 403);
  }
  if (!safeTokenMatch(token, typedInvite.token_hash)) {
    return json({ code: "INVALID_TOKEN", message: "So‘rov havolasi mos emas." }, 403);
  }
  if (new Date(typedInvite.expires_at).getTime() <= Date.now()) {
    return json({ code: "INVITE_EXPIRED", message: "So‘rov havolasi muddati tugagan." }, 410);
  }
  if (["sent", "opened", "responded"].includes(typedInvite.status)) {
    return json({ sent: true, configured: true, status: typedInvite.status, channel: typedInvite.channel });
  }
  if (!["queued", "failed"].includes(typedInvite.status)) {
    return json({ code: "INVITE_NOT_SENDABLE", message: "Bu so‘rovni yuborib bo‘lmaydi." }, 409);
  }
  if (typedInvite.channel !== "sms") {
    return json({ sent: false, configured: true, status: typedInvite.status, channel: typedInvite.channel, code: "CHANNEL_NOT_SMS" });
  }

  const phone = normalizeUzPhone(typedInvite.recipient || "");
  if (!phone) {
    await markInviteFailed(typedInvite.id, "invalid_sms_recipient");
    return json({ code: "INVALID_RECIPIENT", message: "Supplier telefon raqami noto‘g‘ri." }, 422);
  }

  const [{ data: requestRecord, error: requestError }, { data: supplier, error: supplierError }] = await Promise.all([
    admin.from("requests").select("id,status,origin,destination,travel_date").eq("id", typedInvite.request_id).maybeSingle(),
    admin.from("external_suppliers").select("id,contact_count").eq("id", typedInvite.supplier_id).maybeSingle(),
  ]);
  if (requestError || !requestRecord || requestRecord.status !== "open") {
    return json({ code: "REQUEST_NOT_OPEN", message: "Asosiy so‘rov faol emas." }, 409);
  }
  if (supplierError || !supplier) return json({ code: "SUPPLIER_NOT_FOUND", message: "Supplier topilmadi." }, 404);

  const eskizEmail = process.env.ESKIZ_EMAIL?.trim() || "";
  const eskizPassword = process.env.ESKIZ_PASSWORD?.trim() || "";
  const eskizFrom = process.env.ESKIZ_FROM?.trim() || "4546";
  if (!eskizEmail || !eskizPassword) {
    return json({ sent: false, configured: false, status: typedInvite.status, channel: "sms", code: "SMS_NOT_CONFIGURED" });
  }

  if (!deliveryClaimId || !UUID_RE.test(deliveryClaimId)) {
    return json({ code: "OUTREACH_UNAVAILABLE" }, 503);
  }

  const supplierUrl = new URL(`/s/${encodeURIComponent(token)}`, "https://agent.bifavia.uz").toString();
  const message = supplierSmsText(requestRecord as RequestRow, supplierUrl);

  let attemptStarted = false;
  try {
    let eskizToken = await getEskizToken(eskizEmail, eskizPassword);
    // The RPC rechecks the current supplier, request, recipient and token under
    // the invite lock and records a durable pending attempt before any SMS call.
    const { data: begun, error: beginError } = await admin.rpc("begin_supplier_sms_delivery", {
      p_invite_id: typedInvite.id, p_claim_id: deliveryClaimId,
      p_token: token, p_recipient: typedInvite.recipient,
    });
    if (beginError) return json({ code: "OUTREACH_UNAVAILABLE" }, 503);
    if (begun !== true) return json({ code: "INVITE_NOT_SENDABLE" }, 409);
    attemptStarted = true;
    let result = await sendEskizSms(eskizToken, phone, message, eskizFrom);
    if (result.response.status === 401) {
      cachedEskizToken = "";
      cachedEskizTokenAt = 0;
      eskizToken = await getEskizToken(eskizEmail, eskizPassword, true);
      result = await sendEskizSms(eskizToken, phone, message, eskizFrom);
    }

    const providerId = typeof result.payload.id === "string" ? result.payload.id : String(result.payload.id || "");
    if (!result.response.ok) {
      const providerMessage = typeof result.payload.message === "string" ? result.payload.message.slice(0, 200) : "";
      console.error("Supplier SMS provider rejected or failed", { status: result.response.status, providerMessage });
      // A server error may occur after acceptance. Only explicit client-side
      // rejection allows a retry; transport errors retain the durable marker.
      if ([400, 401, 403, 404, 405, 413, 415, 422, 429].includes(result.response.status)) {
        await admin.rpc("finish_supplier_sms_delivery", {
          p_invite_id: typedInvite.id, p_attempt_id: deliveryClaimId,
          p_outcome: "rejected", p_provider_id: null,
        });
        return json({ code: "SMS_SEND_FAILED", message: "SMS provayder tomonidan rad etildi." }, 502);
      }
      return json({ code: "DELIVERY_RECONCILIATION_REQUIRED", message: "SMS natijasi noaniq. Takror yuborish bloklangan." }, 503);
    }
    if (!providerId) {
      return json({ code: "DELIVERY_RECONCILIATION_REQUIRED", message: "SMS natijasi noaniq. Takror yuborish bloklangan." }, 503);
    }
    const { data: completed, error: updateError } = await admin.rpc("finish_supplier_sms_delivery", {
      p_invite_id: typedInvite.id, p_attempt_id: deliveryClaimId,
      p_outcome: "accepted", p_provider_id: providerId,
    });
    if (updateError || completed !== true) {
      return json({ code: "DELIVERY_RECONCILIATION_REQUIRED", message: "SMS qabul qilindi; holati tekshirilmaguncha qayta yuborilmaydi." }, 503);
    }

    const typedSupplier = supplier as SupplierRow;
    await admin
      .from("external_suppliers")
      .update({
        last_contacted_at: new Date().toISOString(),
        contact_count: Math.max(0, Number(typedSupplier.contact_count || 0)) + 1,
      })
      .eq("id", typedInvite.supplier_id);

    return json({ sent: true, configured: true, status: "sent", channel: "sms", provider: "eskiz", provider_message_id: providerId || undefined });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "sms_send_failed";
    if (attemptStarted) {
      return json({ code: "DELIVERY_RECONCILIATION_REQUIRED", message: "SMS natijasi noaniq. Takror yuborish bloklangan." }, 503);
    }
    await markInviteFailed(typedInvite.id, reason);
    console.error("Supplier SMS outreach failed", { inviteId: typedInvite.id, reason });
    return json({ code: "SMS_SEND_FAILED", message: "SMS yuborilmadi." }, 502);
  }
}
