import { readBoundedJson } from "@/lib/server/bounded-json";
import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { checkPasswordExposure, newPasswordValidationMessage } from "@/lib/server/password-security";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BODY_BYTES = 8 * 1024;
const UPSTREAM_TIMEOUT_MS = 15_000;

type SignupBody = {
  email?: unknown;
  password?: unknown;
  captcha_token?: unknown;
};
type Quota = { allowed?: boolean; retry_after?: number };

function json(body: Record<string, unknown>, status = 200, retryAfter?: number) {
  const response = NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  if (retryAfter && retryAfter > 0) response.headers.set("Retry-After", String(Math.ceil(retryAfter)));
  return response;
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

function hash(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return json({ code: "FORBIDDEN", message: "Ro‘yxatdan o‘tish so‘rovi qabul qilinmadi." }, 403);

  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("Signup abuse protection unavailable: missing SUPABASE_SECRET_KEY");
    return json({ code: "AUTH_UNAVAILABLE", message: "Ro‘yxatdan o‘tish xizmati vaqtincha ishlamayapti." }, 503);
  }

  const input = await readBoundedJson<SignupBody>(request, MAX_BODY_BYTES);
  const email = clean(input?.email, 320).toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  const captchaToken = clean(input?.captcha_token, 4096);
  const passwordMessage = newPasswordValidationMessage(password);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || passwordMessage) {
    return json({ code: "INVALID_INPUT", message: passwordMessage || "Email manzilini tekshirib qayta kiriting." }, 422);
  }

  const ip = clientIp(request);
  const captcha = await verifyTurnstile({ token: captchaToken, action: "signup", remoteIp: ip, hostname: request.nextUrl.hostname });
  if (!captcha.ok) return json({ code: captcha.code, message: captcha.message }, captcha.status);

  const admin = createClient(SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const quotas = [
    { scope: hash(secret, `signup-pair:${ip}\u0000${email}`), limit: 3, window: 1800 },
    { scope: hash(secret, `signup-ip:${ip}`), limit: 20, window: 3600 },
  ];
  for (const item of quotas) {
    const { data, error } = await admin.rpc("consume_auth_action_quota", { p_scope_hash: item.scope, p_limit: item.limit, p_window_seconds: item.window });
    if (error) {
      console.error("Signup quota check failed", error.code || "unknown");
      return json({ code: "AUTH_UNAVAILABLE", message: "Ro‘yxatdan o‘tish xizmati vaqtincha ishlamayapti." }, 503);
    }
    const quota = (data || {}) as Quota;
    if (quota.allowed !== true) {
      const retryAfter = Math.max(1, Number(quota.retry_after) || 60);
      return json({ code: "TOO_MANY_ATTEMPTS", message: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring." }, 429, retryAfter);
    }
  }

  const exposure = await checkPasswordExposure(password);
  if (exposure.status === "leaked") {
    return json({ code: "PASSWORD_COMPROMISED", message: "Bu parol xavfsiz emas. Boshqa, noyob parol tanlang." }, 422);
  }
  if (exposure.status === "unavailable") console.warn("Pwned-password check unavailable during signup", exposure.reason);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, data: { auth_source: "email" } }),
      cache: "no-store",
      signal: controller.signal,
    });
    const result = await upstream.json().catch(() => ({})) as Record<string, unknown>;
    if (upstream.ok) return json(result);
    if (upstream.status === 429) return json({ code: "TOO_MANY_ATTEMPTS", message: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring." }, 429, Number(upstream.headers.get("retry-after") || 60));
    if ([400, 422].includes(upstream.status)) return json({ code: "INVALID_INPUT", message: "Email yoki parol talabga mos kelmadi. Tekshirib qayta kiriting." }, 422);
    return json({ code: "AUTH_UNAVAILABLE", message: "Ro‘yxatdan o‘tish xizmati vaqtincha ishlamayapti." }, 503);
  } catch (error) {
    if (controller.signal.aborted) return json({ code: "AUTH_TIMEOUT", message: "Ro‘yxatdan o‘tish xizmatidan javob kelmadi." }, 504);
    console.error("Signup upstream failed", error instanceof Error ? error.name : "unknown");
    return json({ code: "AUTH_UNAVAILABLE", message: "Ro‘yxatdan o‘tish xizmati vaqtincha ishlamayapti." }, 503);
  } finally {
    clearTimeout(timeout);
  }
}
