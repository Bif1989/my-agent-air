import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_RECIPIENTS = 2000;
const MAX_MESSAGE_LENGTH = 480;
const BATCH_SIZE = 5;
const ESKIZ_TIMEOUT_MS = 6_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOBILE_PREFIXES = new Set(["33", "50", "55", "77", "88", "90", "91", "93", "94", "95", "97", "98", "99"]);

type AdminClient = SupabaseClient;
type AdminContext = { admin: AdminClient; userId: string };
type CampaignRow = {
  id: string;
  created_by: string;
  name: string;
  message: string;
  provider: string;
  status: "draft" | "sending" | "completed" | "cancelled";
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
type RecipientStatus = "pending" | "processing" | "sent" | "failed" | "skipped";
type RecipientRow = {
  id: string;
  campaign_id: string;
  phone: string;
  status: RecipientStatus;
  provider_message_id: string | null;
  failure_reason: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};
type ActionBody = { action?: unknown; name?: unknown; message?: unknown; recipients?: unknown; campaign_id?: unknown };
type EskizLoginPayload = { data?: { token?: unknown }; message?: unknown };
type EskizSendPayload = { id?: unknown; message?: unknown; status?: unknown };
type SendResult = { response: Response; payload: EskizSendPayload };

let cachedEskizToken = "";
let cachedEskizTokenAt = 0;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
}

function requestIsCrossSite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host !== request.nextUrl.host; } catch { return true; }
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (authorization.length > 4096) return "";
  return authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
}

async function resolveAdmin(request: NextRequest): Promise<{ ok: true; value: AdminContext } | { ok: false; response: NextResponse }> {
  if (requestIsCrossSite(request)) return { ok: false, response: json({ code: "FORBIDDEN", message: "So‘rov qabul qilinmadi." }, 403) };
  const accessToken = bearerToken(request);
  if (!accessToken) return { ok: false, response: json({ code: "NOT_AUTHENTICATED", message: "Qayta kiring." }, 401) };

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) return { ok: false, response: json({ code: "SERVICE_UNAVAILABLE", message: "Admin SMS xizmati sozlanmagan." }, 503) };

  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);
  if (userError || !userData.user?.id) return { ok: false, response: json({ code: "NOT_AUTHENTICATED", message: "Qayta kiring." }, 401) };

  const admin = createClient(SUPABASE_URL, secretKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: profile, error: profileError } = await admin.from("profiles").select("id,role,is_active,registration_status").eq("id", userData.user.id).maybeSingle();
  if (profileError || !profile || profile.role !== "admin" || profile.is_active !== true || profile.registration_status !== "active") {
    return { ok: false, response: json({ code: "ADMIN_REQUIRED", message: "Faqat faol administrator foydalanishi mumkin." }, 403) };
  }
  return { ok: true, value: { admin, userId: userData.user.id } };
}

function normalizeUzMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  let local = "";
  if (/^998\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^\d{9}$/.test(digits)) local = digits;
  else return "";
  if (!MOBILE_PREFIXES.has(local.slice(0, 2))) return "";
  return `998${local}`;
}

function normalizeRecipients(input: unknown) {
  const raw = Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : typeof input === "string" ? [input] : [];
  const phones = new Set<string>();
  let rejected = 0;
  let tooMany = false;
  for (const block of raw) {
    for (const token of block.split(/[\s,;|]+/).filter(Boolean)) {
      const phone = normalizeUzMobile(token);
      if (phone) phones.add(phone);
      else if (/\d/.test(token)) rejected += 1;
      if (phones.size > MAX_RECIPIENTS) { tooMany = true; break; }
    }
    if (tooMany) break;
  }
  return { phones: [...phones], rejected, tooMany };
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESKIZ_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timeout); }
}

async function getEskizToken(email: string, password: string, force = false) {
  if (!force && cachedEskizToken && Date.now() - cachedEskizTokenAt < 20 * 60 * 1000) return cachedEskizToken;
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  const response = await fetchWithTimeout("https://notify.eskiz.uz/api/auth/login", { method: "POST", headers: { Accept: "application/json" }, body: form });
  const payload = await response.json().catch(() => ({})) as EskizLoginPayload;
  const token = typeof payload.data?.token === "string" ? payload.data.token.trim() : "";
  if (!response.ok || !token) throw new Error("eskiz_auth_failed");
  cachedEskizToken = token;
  cachedEskizTokenAt = Date.now();
  return token;
}

async function sendEskizSms(token: string, phone: string, message: string, from: string): Promise<SendResult> {
  const form = new FormData();
  form.set("mobile_phone", phone);
  form.set("message", message);
  form.set("from", from);
  const response = await fetchWithTimeout("https://notify.eskiz.uz/api/message/sms/send", {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: form,
  });
  return { response, payload: await response.json().catch(() => ({})) as EskizSendPayload };
}

async function countRecipients(admin: AdminClient, campaignId: string, status: RecipientStatus) {
  const { count, error } = await admin.from("admin_sms_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId).eq("status", status);
  if (error) throw error;
  return count || 0;
}

async function syncCampaign(admin: AdminClient, campaignId: string) {
  const [sentCount, failedCount, pendingCount, processingCount] = await Promise.all([
    countRecipients(admin, campaignId, "sent"), countRecipients(admin, campaignId, "failed"),
    countRecipients(admin, campaignId, "pending"), countRecipients(admin, campaignId, "processing"),
  ]);
  const outstanding = pendingCount + processingCount;
  const finished = outstanding === 0;
  const { data, error } = await admin.from("admin_sms_campaigns").update({
    sent_count: sentCount,
    failed_count: failedCount,
    status: finished ? "completed" : "sending",
    completed_at: finished ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq("id", campaignId).select("id,created_by,name,message,provider,status,recipient_count,sent_count,failed_count,started_at,completed_at,created_at,updated_at").single();
  if (error) throw error;
  return { campaign: data as CampaignRow, pending_count: outstanding };
}

async function releaseClaims(admin: AdminClient, ids: string[]) {
  if (!ids.length) return;
  await admin.from("admin_sms_recipients").update({ status: "pending", updated_at: new Date().toISOString() }).in("id", ids).eq("status", "processing");
}

async function markRecipient(admin: AdminClient, row: RecipientRow, result: SendResult | Error) {
  const attempts = Math.max(0, Number(row.attempts || 0)) + 1;
  if (result instanceof Error) {
    await admin.from("admin_sms_recipients").update({ status: "failed", attempts, failure_reason: result.message.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "processing");
    return;
  }
  if (!result.response.ok) {
    const providerStatus = typeof result.payload.status === "string" ? result.payload.status : "unknown";
    const providerMessage = typeof result.payload.message === "string" ? result.payload.message.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const failureReason = `eskiz_send_failed:${result.response.status}:${providerStatus}${providerMessage ? `:${providerMessage}` : ""}`.slice(0, 500);
    await admin.from("admin_sms_recipients").update({ status: "failed", attempts, failure_reason: failureReason, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "processing");
    return;
  }
  const providerId = result.payload.id === undefined || result.payload.id === null ? "" : String(result.payload.id);
  await admin.from("admin_sms_recipients").update({ status: "sent", attempts, provider_message_id: providerId || null, failure_reason: null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "processing");
}

export async function GET(request: NextRequest) {
  const auth = await resolveAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin } = auth.value;
  const campaignId = request.nextUrl.searchParams.get("id")?.trim() || "";
  if (campaignId) {
    if (!UUID_RE.test(campaignId)) return json({ code: "INVALID_CAMPAIGN", message: "Kampaniya ID noto‘g‘ri." }, 400);
    const [{ data: campaign, error: campaignError }, { data: recipients, error: recipientsError }] = await Promise.all([
      admin.from("admin_sms_campaigns").select("id,created_by,name,message,provider,status,recipient_count,sent_count,failed_count,started_at,completed_at,created_at,updated_at").eq("id", campaignId).maybeSingle(),
      admin.from("admin_sms_recipients").select("id,campaign_id,phone,status,provider_message_id,failure_reason,attempts,sent_at,created_at,updated_at").eq("campaign_id", campaignId).order("created_at", { ascending: true }).limit(MAX_RECIPIENTS),
    ]);
    if (campaignError || recipientsError) return json({ code: "LOAD_FAILED", message: "SMS kampaniyasini yuklab bo‘lmadi." }, 500);
    if (!campaign) return json({ code: "NOT_FOUND", message: "Kampaniya topilmadi." }, 404);
    return json({ campaign, recipients: recipients || [] });
  }
  const { data, error } = await admin.from("admin_sms_campaigns").select("id,created_by,name,message,provider,status,recipient_count,sent_count,failed_count,started_at,completed_at,created_at,updated_at").order("created_at", { ascending: false }).limit(50);
  if (error) return json({ code: "LOAD_FAILED", message: "SMS kampaniyalarini yuklab bo‘lmadi." }, 500);
  return json({ campaigns: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await resolveAdmin(request);
  if (!auth.ok) return auth.response;
  const { admin, userId } = auth.value;
  const body = await readBoundedJson<ActionBody>(request, MAX_BODY_BYTES);
  if (!body) return json({ code: "INVALID_REQUEST", message: "So‘rov ma’lumotlari noto‘g‘ri." }, 400);
  const action = typeof body.action === "string" ? body.action : "create";

  if (action === "create") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const normalized = normalizeRecipients(body.recipients);
    if (!name) return json({ code: "NAME_REQUIRED", message: "Kampaniya nomini kiriting." }, 422);
    if (!message || message.length > MAX_MESSAGE_LENGTH) return json({ code: "MESSAGE_INVALID", message: `SMS matni 1-${MAX_MESSAGE_LENGTH} belgi bo‘lishi kerak.` }, 422);
    if (normalized.tooMany) return json({ code: "TOO_MANY_RECIPIENTS", message: `Bitta kampaniyada ko‘pi bilan ${MAX_RECIPIENTS} ta raqam.` }, 422);
    if (!normalized.phones.length) return json({ code: "RECIPIENTS_REQUIRED", message: "Yaroqli mobil raqam topilmadi." }, 422);

    const { data: campaign, error: campaignError } = await admin.from("admin_sms_campaigns").insert({ created_by: userId, name, message, recipient_count: normalized.phones.length }).select("id,created_by,name,message,provider,status,recipient_count,sent_count,failed_count,started_at,completed_at,created_at,updated_at").single();
    if (campaignError || !campaign) return json({ code: "CREATE_FAILED", message: "SMS kampaniyasini yaratib bo‘lmadi." }, 500);
    const { error: recipientsError } = await admin.from("admin_sms_recipients").insert(normalized.phones.map((phone) => ({ campaign_id: campaign.id, phone })));
    if (recipientsError) {
      await admin.from("admin_sms_campaigns").delete().eq("id", campaign.id);
      return json({ code: "CREATE_FAILED", message: "SMS raqamlarini saqlab bo‘lmadi." }, 500);
    }
    return json({ campaign, accepted: normalized.phones.length, rejected: normalized.rejected }, 201);
  }

  const campaignId = typeof body.campaign_id === "string" ? body.campaign_id.trim() : "";
  if (!UUID_RE.test(campaignId)) return json({ code: "INVALID_CAMPAIGN", message: "Kampaniya ID noto‘g‘ri." }, 400);

  if (action === "retry_failed") {
    const { error } = await admin.from("admin_sms_recipients").update({ status: "pending", failure_reason: null, updated_at: new Date().toISOString() }).eq("campaign_id", campaignId).eq("status", "failed");
    if (error) return json({ code: "RETRY_FAILED", message: "Xato SMSlarni qayta navbatga qo‘yib bo‘lmadi." }, 500);
    const synced = await syncCampaign(admin, campaignId).catch(() => null);
    return synced ? json(synced) : json({ code: "RETRY_FAILED", message: "Kampaniya holatini yangilab bo‘lmadi." }, 500);
  }
  if (action !== "send_batch") return json({ code: "INVALID_ACTION", message: "Noma’lum amal." }, 400);

  const { data: campaign, error: campaignError } = await admin.from("admin_sms_campaigns").select("id,created_by,name,message,provider,status,recipient_count,sent_count,failed_count,started_at,completed_at,created_at,updated_at").eq("id", campaignId).maybeSingle();
  if (campaignError || !campaign) return json({ code: "NOT_FOUND", message: "Kampaniya topilmadi." }, 404);
  if (campaign.status === "cancelled") return json({ code: "CAMPAIGN_CANCELLED", message: "Kampaniya bekor qilingan." }, 409);

  const eskizEmail = process.env.ESKIZ_EMAIL?.trim() || "";
  const eskizPassword = process.env.ESKIZ_PASSWORD?.trim() || "";
  const eskizFrom = process.env.ESKIZ_FROM?.trim() || "4546";
  if (!eskizEmail || !eskizPassword) return json({ code: "SMS_NOT_CONFIGURED", message: "ESKIZ sozlamalari topilmadi." }, 503);

  const { data: claimed, error: claimError } = await admin.rpc("claim_admin_sms_batch", { p_campaign_id: campaignId, p_limit: BATCH_SIZE });
  if (claimError) return json({ code: "LOAD_FAILED", message: "SMS navbatini xavfsiz band qilib bo‘lmadi." }, 500);
  const recipients = (claimed || []) as RecipientRow[];
  if (!recipients.length) {
    const synced = await syncCampaign(admin, campaignId).catch(() => null);
    return synced ? json({ ...synced, batch_processed: 0 }) : json({ code: "STATUS_UPDATE_FAILED", message: "Kampaniya holatini yangilab bo‘lmadi." }, 500);
  }

  if (campaign.status === "draft") {
    await admin.from("admin_sms_campaigns").update({ status: "sending", started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", campaignId);
  }

  let eskizToken: string;
  try { eskizToken = await getEskizToken(eskizEmail, eskizPassword); }
  catch (error) {
    await releaseClaims(admin, recipients.map((row) => row.id));
    console.error("Admin bulk SMS Eskiz auth failed", { campaignId, reason: error instanceof Error ? error.message : "unknown" });
    return json({ code: "SMS_AUTH_FAILED", message: "ESKIZ bilan ulanishda xatolik." }, 502);
  }

  const firstPass = await Promise.all(recipients.map(async (row) => {
    try { return { row, result: await sendEskizSms(eskizToken, row.phone, campaign.message, eskizFrom) as SendResult | Error }; }
    catch (error) { return { row, result: error instanceof Error ? error : new Error("sms_send_failed") }; }
  }));

  const unauthorized = firstPass.filter((item) => !(item.result instanceof Error) && item.result.response.status === 401);
  const completed = firstPass.filter((item) => !unauthorized.includes(item));
  await Promise.all(completed.map(({ row, result }) => markRecipient(admin, row, result)));

  if (unauthorized.length) {
    cachedEskizToken = "";
    cachedEskizTokenAt = 0;
    try {
      eskizToken = await getEskizToken(eskizEmail, eskizPassword, true);
      const retries = await Promise.all(unauthorized.map(async ({ row }) => {
        try { return { row, result: await sendEskizSms(eskizToken, row.phone, campaign.message, eskizFrom) as SendResult | Error }; }
        catch (error) { return { row, result: error instanceof Error ? error : new Error("sms_send_failed") }; }
      }));
      await Promise.all(retries.map(({ row, result }) => markRecipient(admin, row, result)));
    } catch (error) {
      await releaseClaims(admin, unauthorized.map(({ row }) => row.id));
      console.error("Admin bulk SMS Eskiz token refresh failed", { campaignId, reason: error instanceof Error ? error.message : "unknown" });
    }
  }

  const synced = await syncCampaign(admin, campaignId).catch(() => null);
  if (!synced) return json({ code: "STATUS_UPDATE_FAILED", message: "SMSlar yuborildi, lekin kampaniya holatini yangilab bo‘lmadi." }, 500);
  return json({ ...synced, batch_processed: recipients.length, batch_size: BATCH_SIZE });
}
