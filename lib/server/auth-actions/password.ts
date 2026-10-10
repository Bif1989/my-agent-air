import { readBoundedJson } from "@/lib/server/bounded-json";
import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { verifyTurnstile } from "@/lib/server/turnstile";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 8 * 1024;
const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 1024;
const UPSTREAM_TIMEOUT_MS = 12_000;

type LoginBody = { email?: unknown; password?: unknown; captcha_token?: unknown };
type LimitStatus = { blocked?: boolean; retry_after?: number };
type AuthSuccess = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: { id?: string; email?: string; [key: string]: unknown };
};

function json(body: Record<string, unknown>, status = 200, retryAfter?: number) {
  const response = NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Pragma": "no-cache",
    },
  });
  if (retryAfter && retryAfter > 0) response.headers.set("Retry-After", String(Math.ceil(retryAfter)));
  return response;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
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

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return (forwarded || real || "unknown").slice(0, 128);
}

function scopeHash(secret: string, scope: string) {
  return createHmac("sha256", secret).update(scope).digest("hex");
}

async function readBody(request: NextRequest): Promise<LoginBody | null> {
  return readBoundedJson<LoginBody>(request, MAX_BODY_BYTES);
}

export async function POST(request: NextRequest) {
  if (requestIsCrossSite(request)) {
    return json({ code: "FORBIDDEN", message: "Kirish so‘rovi qabul qilinmadi." }, 403);
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.error("Password login protection unavailable: missing SUPABASE_SECRET_KEY");
    return json({ code: "AUTH_UNAVAILABLE", message: "Kirish xizmati vaqtincha ishlamayapti." }, 503);
  }

  const body = await readBody(request);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const captchaToken = typeof body?.captcha_token === "string" ? body.captcha_token.trim() : "";
  if (
    !email || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password || password.length > MAX_PASSWORD_LENGTH
  ) {
    return json({ code: "INVALID_CREDENTIALS", message: "Email yoki parol noto‘g‘ri." }, 401);
  }

  const ip = clientIp(request);
  const pairHash = scopeHash(secretKey, `pair:${ip}\u0000${email}`);
  const ipHash = scopeHash(secretKey, `ip:${ip}`);
  const admin = createClient(SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: limitData, error: limitError } = await admin.rpc("auth_login_limit_status", {
    p_pair_hash: pairHash,
    p_ip_hash: ipHash,
  });
  if (limitError) {
    console.error("Password login rate-limit check failed", limitError.code || "unknown");
    return json({ code: "AUTH_UNAVAILABLE", message: "Kirish xizmati vaqtincha ishlamayapti." }, 503);
  }

  const limit = (limitData || {}) as LimitStatus;
  if (limit.blocked === true) {
    const retryAfter = Math.max(1, Number(limit.retry_after) || 60);
    return json({ code: "TOO_MANY_ATTEMPTS", message: "Juda ko‘p noto‘g‘ri urinish. Birozdan keyin qayta urinib ko‘ring." }, 429, retryAfter);
  }

  const captcha = await verifyTurnstile({ token: captchaToken, action: "login", remoteIp: ip, hostname: request.nextUrl.hostname });
  if (!captcha.ok) return json({ code: captcha.code, message: captcha.message }, captcha.status);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  let data: AuthSuccess = {};
  try {
    upstream = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      signal: controller.signal,
    });
    data = await upstream.json().catch(() => ({})) as AuthSuccess;
  } catch (error) {
    if (controller.signal.aborted) {
      return json({ code: "AUTH_TIMEOUT", message: "Kirish xizmatidan javob kelmadi. Qayta urinib ko‘ring." }, 504);
    }
    console.error("Password login upstream failed", error instanceof Error ? error.name : "unknown");
    return json({ code: "AUTH_UNAVAILABLE", message: "Kirish xizmati vaqtincha ishlamayapti." }, 503);
  } finally {
    clearTimeout(timeout);
  }

  const success = upstream.ok && Boolean(data.access_token && data.refresh_token && data.user?.id);
  const { error: recordError } = await admin.rpc("record_auth_login_result", {
    p_pair_hash: pairHash,
    p_ip_hash: ipHash,
    p_success: success,
  });

  if (recordError && !success) {
    console.error("Password login rate-limit recording failed", recordError.code || "unknown");
    return json({ code: "AUTH_UNAVAILABLE", message: "Kirish xizmati vaqtincha ishlamayapti." }, 503);
  }
  if (recordError) console.error("Password login rate-limit cleanup failed", recordError.code || "unknown");

  if (!success) {
    if (upstream.status === 429) {
      const retryAfter = Number(upstream.headers.get("retry-after") || "60");
      return json({ code: "TOO_MANY_ATTEMPTS", message: "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring." }, 429, retryAfter);
    }
    if ([400, 401, 403].includes(upstream.status)) {
      return json({ code: "INVALID_CREDENTIALS", message: "Email yoki parol noto‘g‘ri." }, 401);
    }
    return json({ code: "AUTH_UNAVAILABLE", message: "Kirish xizmati vaqtincha ishlamayapti." }, 503);
  }

  return json({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    token_type: data.token_type,
    expires_in: data.expires_in,
    user: data.user,
  });
}
