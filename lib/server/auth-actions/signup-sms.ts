import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { checkPasswordExposure, newPasswordValidationMessage } from "@/lib/server/password-security";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BODY_BYTES = 16 * 1024;
const OTP_TTL_MS = 5 * 60 * 1000;
const ESKIZ_TIMEOUT_MS = 10_000;
const AGENT_TYPES = new Set(["Aviakassa", "Turagent", "Turoperator", "Mehmonxona", "Transport", "Gid", "Boshqa"]);

type Body = Record<string, unknown>;
type Quota = { allowed?: boolean; retry_after?: number };

type EskizLoginPayload = { data?: { token?: unknown } };
type EskizSendPayload = { id?: unknown; message?: unknown; status?: unknown };

function json(body: Record<string, unknown>, status = 200, retryAfter?: number) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  if (retryAfter && retryAfter > 0) response.headers.set("Retry-After", String(Math.ceil(retryAfter)));
  return response;
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function crossSite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host !== request.nextUrl.host; } catch { return true; }
}

function clientIp(request: NextRequest) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown").slice(0, 128);
}

function normalizeUzPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^998\d{9}$/.test(digits)) return digits;
  if (/^\d{9}$/.test(digits)) return `998${digits}`;
  return "";
}

function otpHash(secret: string, challengeId: string, code: string) {
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("hex");
}

function safeEqualHex(a: string, b: string) {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

async function fetchWithTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ESKIZ_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" }); }
  finally { clearTimeout(timeout); }
}

async function sendEskizCode(phone: string, code: string) {
  const email = process.env.ESKIZ_EMAIL?.trim() || "";
  const password = process.env.ESKIZ_PASSWORD?.trim() || "";
  const from = process.env.ESKIZ_FROM?.trim() || "4546";
  if (!email || !password) throw new Error("eskiz_not_configured");

  const loginForm = new FormData();
  loginForm.set("email", email);
  loginForm.set("password", password);
  const login = await fetchWithTimeout("https://notify.eskiz.uz/api/auth/login", { method: "POST", headers: { Accept: "application/json" }, body: loginForm });
  const loginPayload = await login.json().catch(() => ({})) as EskizLoginPayload;
  const token = typeof loginPayload.data?.token === "string" ? loginPayload.data.token.trim() : "";
  if (!login.ok || !token) throw new Error("eskiz_auth_failed");

  const sendForm = new FormData();
  sendForm.set("mobile_phone", phone);
  sendForm.set("message", `My Agent Air ro'yxatdan o'tish kodi: ${code}. Kod 5 daqiqa amal qiladi.`);
  sendForm.set("from", from);
  const sent = await fetchWithTimeout("https://notify.eskiz.uz/api/message/sms/send", {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: sendForm,
  });
  const payload = await sent.json().catch(() => ({})) as EskizSendPayload;
  if (!sent.ok) {
    const message = typeof payload.message === "string" ? payload.message.slice(0, 120) : "";
    throw new Error(`eskiz_send_failed:${sent.status}:${message}`);
  }
}

async function consumeQuota(admin: ReturnType<typeof createClient>, scope: string, limit: number, window: number) {
  const { data, error } = await admin.rpc("consume_auth_action_quota", { p_scope_hash: scope, p_limit: limit, p_window_seconds: window });
  if (error) return { ok: false, retryAfter: 60, unavailable: true };
  const quota = (data || {}) as Quota;
  return quota.allowed === true ? { ok: true, retryAfter: 0, unavailable: false } : { ok: false, retryAfter: Math.max(1, Number(quota.retry_after) || 60), unavailable: false };
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return json({ code: "FORBIDDEN", message: "So‘rov qabul qilinmadi." }, 403);
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) return json({ code: "AUTH_UNAVAILABLE", message: "Ro‘yxatdan o‘tish xizmati vaqtincha ishlamayapti." }, 503);
  const input = await readBoundedJson<Body>(request, MAX_BODY_BYTES);
  const phase = clean(input?.phase, 32);
  const admin = createClient(SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const ip = clientIp(request);

  if (phase === "request") {
    const phone = normalizeUzPhone(clean(input?.phone, 64));
    const captchaToken = clean(input?.captcha_token, 4096);
    if (!phone) return json({ code: "INVALID_PHONE", message: "Telefon raqamini +998 formatida kiriting." }, 422);
    const captcha = await verifyTurnstile({ token: captchaToken, action: "signup", remoteIp: ip, hostname: request.nextUrl.hostname });
    if (!captcha.ok) return json({ code: captcha.code, message: captcha.message }, captcha.status);

    const scope = createHmac("sha256", secret).update(`signup-sms:${ip}\u0000${phone}`).digest("hex");
    const quota = await consumeQuota(admin, scope, 5, 3600);
    if (quota.unavailable) return json({ code: "AUTH_UNAVAILABLE", message: "Xizmat vaqtincha ishlamayapti." }, 503);
    if (!quota.ok) return json({ code: "TOO_MANY_ATTEMPTS", message: "Juda ko‘p SMS so‘rovi. Birozdan keyin qayta urinib ko‘ring." }, 429, quota.retryAfter);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
    const { data: challenge, error } = await admin.from("registration_sms_otps").insert({ phone, code_hash: "pending", expires_at: expiresAt }).select("id").single();
    if (error || !challenge?.id) return json({ code: "AUTH_UNAVAILABLE", message: "SMS tasdiqlashni boshlash imkoni bo‘lmadi." }, 503);
    const codeHash = otpHash(secret, challenge.id, code);
    await admin.from("registration_sms_otps").update({ code_hash: codeHash }).eq("id", challenge.id);
    try { await sendEskizCode(phone, code); }
    catch (error) {
      console.error("Signup SMS send failed", error instanceof Error ? error.message : "unknown");
      await admin.from("registration_sms_otps").delete().eq("id", challenge.id);
      return json({ code: "SMS_SEND_FAILED", message: "SMS yuborilmadi. Keyinroq qayta urinib ko‘ring." }, 502);
    }
    return json({ ok: true, challenge_id: challenge.id, phone });
  }

  const challengeId = clean(input?.challenge_id, 64);
  const phone = normalizeUzPhone(clean(input?.phone, 64));
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !phone) return json({ code: "INVALID_REQUEST", message: "Tasdiqlash ma’lumotlari noto‘g‘ri." }, 422);
  const { data: challenge, error: challengeError } = await admin.from("registration_sms_otps").select("id,phone,code_hash,expires_at,verified_at,consumed_at,attempts,resend_count,last_sent_at").eq("id", challengeId).maybeSingle();
  if (challengeError || !challenge || challenge.phone !== phone) return json({ code: "INVALID_REQUEST", message: "Tasdiqlash so‘rovi topilmadi." }, 404);
  if (challenge.consumed_at) return json({ code: "ALREADY_USED", message: "Bu kod allaqachon ishlatilgan." }, 409);
  if (new Date(challenge.expires_at).getTime() <= Date.now()) return json({ code: "OTP_EXPIRED", message: "Kod muddati tugagan. Yangi kod oling." }, 410);

  if (phase === "verify") {
    const token = clean(input?.token, 6);
    if (!/^\d{6}$/.test(token)) return json({ code: "INVALID_OTP", message: "6 xonali kodni kiriting." }, 422);
    if (Number(challenge.attempts || 0) >= 5) return json({ code: "TOO_MANY_ATTEMPTS", message: "Kod juda ko‘p marta noto‘g‘ri kiritildi. Yangi kod oling." }, 429, 300);
    const expected = otpHash(secret, challengeId, token);
    if (!safeEqualHex(expected, challenge.code_hash)) {
      await admin.from("registration_sms_otps").update({ attempts: Number(challenge.attempts || 0) + 1 }).eq("id", challengeId);
      return json({ code: "INVALID_OTP", message: "Tasdiqlash kodi noto‘g‘ri." }, 422);
    }
    await admin.from("registration_sms_otps").update({ verified_at: new Date().toISOString() }).eq("id", challengeId);
    return json({ ok: true });
  }

  if (phase === "resend") {
    const lastSent = new Date(challenge.last_sent_at).getTime();
    const wait = Math.ceil((60_000 - (Date.now() - lastSent)) / 1000);
    if (wait > 0) return json({ code: "TOO_MANY_ATTEMPTS", message: `Kodni ${wait} soniyadan keyin qayta yuboring.` }, 429, wait);
    if (Number(challenge.resend_count || 0) >= 3) return json({ code: "TOO_MANY_ATTEMPTS", message: "Qayta yuborish limiti tugadi. Ro‘yxatdan o‘tishni boshidan boshlang." }, 429, 300);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    try { await sendEskizCode(phone, code); }
    catch (error) {
      console.error("Signup SMS resend failed", error instanceof Error ? error.message : "unknown");
      return json({ code: "SMS_SEND_FAILED", message: "SMS yuborilmadi." }, 502);
    }
    await admin.from("registration_sms_otps").update({ code_hash: otpHash(secret, challengeId, code), expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(), attempts: 0, verified_at: null, resend_count: Number(challenge.resend_count || 0) + 1, last_sent_at: new Date().toISOString() }).eq("id", challengeId);
    return json({ ok: true });
  }

  if (phase === "complete") {
    if (!challenge.verified_at) return json({ code: "PHONE_NOT_VERIFIED", message: "Avval telefon raqamini SMS kod bilan tasdiqlang." }, 403);
    const email = clean(input?.email, 320).toLowerCase();
    const password = typeof input?.password === "string" ? input.password : "";
    const fullName = clean(input?.full_name, 160);
    const company = clean(input?.company_name, 200);
    const city = clean(input?.city, 120);
    const agentType = clean(input?.agent_type, 60);
    const passwordMessage = newPasswordValidationMessage(password);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || passwordMessage || !fullName || !company || !city || !AGENT_TYPES.has(agentType)) {
      return json({ code: "INVALID_INPUT", message: passwordMessage || "Ma’lumotlarni tekshirib qayta kiriting." }, 422);
    }
    const exposure = await checkPasswordExposure(password);
    if (exposure.status === "leaked") return json({ code: "PASSWORD_COMPROMISED", message: "Bu parol avval ma’lumot sizishlarida uchragan. Boshqa parol tanlang." }, 422);

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, company_name: company, phone: `+${phone}`, city, agent_type: agentType, phone_verified: true },
    });
    if (createError || !created.user?.id) {
      const duplicate = /already|registered|exists/i.test(createError?.message || "");
      return json({ code: duplicate ? "ACCOUNT_EXISTS" : "AUTH_UNAVAILABLE", message: duplicate ? "Bu email bilan akkaunt mavjud. Kirish sahifasidan foydalaning." : "Akkaunt yaratib bo‘lmadi." }, duplicate ? 409 : 503);
    }
    await admin.from("registration_sms_otps").update({ consumed_at: new Date().toISOString() }).eq("id", challengeId);

    const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    const session = await signIn.json().catch(() => ({})) as Record<string, unknown>;
    if (!signIn.ok) return json({ ok: true, user: { id: created.user.id, email }, code: "LOGIN_REQUIRED", message: "Akkaunt yaratildi. Endi kirish sahifasidan kiring." });
    return json(session);
  }

  return json({ code: "INVALID_PHASE", message: "Noto‘g‘ri so‘rov." }, 400);
}
