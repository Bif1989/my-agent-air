import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4 * 1024;
const RESEND_TIMEOUT_MS = 10_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  category: string | null;
  destination: string | null;
  travel_date: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  budget: number | null;
  currency: string | null;
  status: string;
};
type SupplierRow = { id: string; name: string; contact_count: number | null };
type ResendPayload = { id?: unknown; name?: unknown; message?: unknown };

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requestSummary(record: RequestRow) {
  const pax = Math.max(0, Number(record.adults || 0) + Number(record.children || 0) + Number(record.infants || 0));
  return {
    category: record.category || "B2B so‘rov",
    destination: record.destination || "",
    travelDate: record.travel_date || "",
    pax,
    budget: record.budget == null ? "" : `${Number(record.budget).toLocaleString("en-US")} ${record.currency || ""}`.trim(),
  };
}

function emailContent(supplierName: string, record: RequestRow, supplierUrl: string) {
  const summary = requestSummary(record);
  const subject = `Yangi B2B so‘rov — ${summary.category}${summary.destination ? ` · ${summary.destination}` : ""}`;
  const details = [
    `Xizmat / Услуга: ${summary.category}`,
    summary.destination ? `Yo‘nalish / Направление: ${summary.destination}` : "",
    summary.travelDate ? `Sana / Дата: ${summary.travelDate}` : "",
    summary.pax ? `Yo‘lovchi / Гостей: ${summary.pax}` : "",
    summary.budget ? `Budjet / Бюджет: ${summary.budget}` : "",
  ].filter(Boolean);

  const text = [
    `Assalomu alaykum, ${supplierName}.`,
    "",
    "My Agent Air platformasida sizning xizmatingizga mos yangi B2B so‘rov bor.",
    "На платформе My Agent Air появился новый B2B-запрос, подходящий вашей услуге.",
    "",
    ...details,
    "",
    `So‘rovni ko‘rish va taklif yuborish / Открыть запрос и отправить предложение: ${supplierUrl}`,
    "",
    "Agar bunday so‘rovlarni olishni istamasangiz, so‘rov sahifasida rad etish imkoniyati mavjud.",
  ].join("\n");

  const rows = details
    .map((detail) => `<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#334155;padding-top:4px;padding-bottom:4px;">${escapeHtml(detail)}</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;background-color:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1f5f9">
<tr><td align="center" style="padding-top:24px;padding-right:12px;padding-bottom:24px;padding-left:12px;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;">
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:30px;font-weight:700;color:#0b1f3a;padding-top:28px;padding-right:28px;padding-bottom:8px;padding-left:28px;">My Agent Air</td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#475569;padding-top:0;padding-right:28px;padding-bottom:18px;padding-left:28px;">Assalomu alaykum, ${escapeHtml(supplierName)}. Sizning xizmatingizga mos yangi B2B so‘rov bor.<br>Новый B2B-запрос подходит вашей услуге.</td></tr>
<tr><td style="padding-top:0;padding-right:28px;padding-bottom:18px;padding-left:28px;"><table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
<tr><td align="center" style="padding-top:4px;padding-right:28px;padding-bottom:22px;padding-left:28px;"><a href="${escapeHtml(supplierUrl)}" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;background-color:#2563eb;border-radius:10px;padding-top:12px;padding-right:20px;padding-bottom:12px;padding-left:20px;display:inline-block;">Taklif yuborish / Ответить</a></td></tr>
<tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:#94a3b8;padding-top:0;padding-right:28px;padding-bottom:28px;padding-left:28px;">Agar bunday so‘rovlarni olishni istamasangiz, so‘rov sahifasida rad etishingiz mumkin.<br>Если вы не хотите получать такие запросы, можно отказаться на странице запроса.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

async function markFailed(admin: ReturnType<typeof createClient>, inviteId: string, reason: string) {
  await admin
    .from("supplier_invites")
    .update({ status: "failed", failure_reason: reason.slice(0, 500) })
    .eq("id", inviteId)
    .eq("status", "queued");
}

export async function POST(request: NextRequest) {
  if (requestIsCrossSite(request)) return json({ code: "FORBIDDEN", message: "So‘rov qabul qilinmadi." }, 403);

  const accessToken = bearerToken(request);
  if (!accessToken) return json({ code: "NOT_AUTHENTICATED", message: "Qayta kiring." }, 401);

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("Supplier outreach unavailable: missing SUPABASE_SECRET_KEY");
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
  if (typedInvite.channel !== "email") {
    return json({ sent: false, configured: true, status: typedInvite.status, channel: typedInvite.channel, code: "CHANNEL_NOT_AUTOMATED" });
  }

  const recipient = typedInvite.recipient?.trim() || "";
  if (!EMAIL_RE.test(recipient) || recipient.length > 320) {
    await markFailed(admin, typedInvite.id, "invalid_email_recipient");
    return json({ code: "INVALID_RECIPIENT", message: "Supplier email manzili noto‘g‘ri." }, 422);
  }

  const [{ data: requestRecord, error: requestError }, { data: supplier, error: supplierError }] = await Promise.all([
    admin
      .from("requests")
      .select("id,category,destination,travel_date,adults,children,infants,budget,currency,status")
      .eq("id", typedInvite.request_id)
      .maybeSingle(),
    admin
      .from("external_suppliers")
      .select("id,name,contact_count")
      .eq("id", typedInvite.supplier_id)
      .maybeSingle(),
  ]);

  if (requestError || !requestRecord || requestRecord.status !== "open") {
    return json({ code: "REQUEST_NOT_OPEN", message: "Asosiy so‘rov faol emas." }, 409);
  }
  if (supplierError || !supplier) return json({ code: "SUPPLIER_NOT_FOUND", message: "Supplier topilmadi." }, 404);

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (!resendApiKey) {
    return json({
      sent: false,
      configured: false,
      status: typedInvite.status,
      channel: typedInvite.channel,
      code: "EMAIL_NOT_CONFIGURED",
    });
  }

  const supplierUrl = new URL(`/supplier-request/${encodeURIComponent(token)}`, request.nextUrl.origin).toString();
  const content = emailContent((supplier as SupplierRow).name, requestRecord as RequestRow, supplierUrl);
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "My Agent Air <notifications@bifavia.uz>";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);
  let providerResponse: Response;
  let providerData: ResendPayload = {};

  try {
    providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `supplier-invite-${typedInvite.id}-${typedInvite.token_hash.slice(0, 16)}`,
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: content.subject,
        text: content.text,
        html: content.html,
        tags: [
          { name: "source", value: "supplier_outreach" },
          { name: "invite_id", value: typedInvite.id },
        ],
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    providerData = await providerResponse.json().catch(() => ({})) as ResendPayload;
  } catch (error) {
    const reason = controller.signal.aborted ? "resend_timeout" : `resend_network_${error instanceof Error ? error.name : "unknown"}`;
    await markFailed(admin, typedInvite.id, reason);
    return json({ code: "EMAIL_SEND_FAILED", message: "Email yuborilmadi. Havolani qo‘lda yuborish mumkin." }, controller.signal.aborted ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }

  const providerId = typeof providerData.id === "string" ? providerData.id : "";
  if (!providerResponse.ok || !providerId) {
    const providerCode = typeof providerData.name === "string" ? providerData.name : "provider_error";
    await markFailed(admin, typedInvite.id, `resend_${providerResponse.status}_${providerCode}`);
    return json({ code: "EMAIL_SEND_FAILED", message: "Email yuborilmadi. Havolani qo‘lda yuborish mumkin." }, 502);
  }

  const sentAt = new Date().toISOString();
  const { error: sentError } = await admin
    .from("supplier_invites")
    .update({
      status: "sent",
      provider_message_id: providerId,
      sent_at: sentAt,
      failure_reason: null,
    })
    .eq("id", typedInvite.id)
    .in("status", ["queued", "failed"]);

  if (sentError) {
    console.error("Supplier outreach status update failed", sentError.code || "unknown");
    return json({ code: "STATUS_UPDATE_FAILED", message: "Email yuborildi, lekin status yangilanmadi." }, 503);
  }

  const supplierRow = supplier as SupplierRow;
  await admin
    .from("external_suppliers")
    .update({
      last_contacted_at: sentAt,
      contact_count: Math.max(0, Number(supplierRow.contact_count || 0)) + 1,
    })
    .eq("id", supplierRow.id);

  return json({ sent: true, configured: true, status: "sent", channel: "email" });
}
