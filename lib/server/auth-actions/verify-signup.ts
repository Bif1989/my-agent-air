import { readBoundedJson } from "@/lib/server/bounded-json";
import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4 * 1024;
const UPSTREAM_TIMEOUT_MS = 12_000;

type VerifyBody = { email?: unknown; token?: unknown };
type Quota = { allowed?: boolean; retry_after?: number };
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
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
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

async function readBody(request: NextRequest): Promise<VerifyBody | null> {
  return readBoundedJson<VerifyBody>(request, MAX_BODY_BYTES);
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return json({ code: "FORBIDDEN", message: "Tasdiqlash so‘rovi qabul qilinmadi." }, 403);

  const input = await readBody(request);
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase().slice(0, 320) : "";
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(token)) {
    return json({ code: "INVALID_OTP", message: "Kiritilgan kod noto‘g‘ri yoki eskirgan." }, 400);
  }

  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("OTP verification protection unavailable: missing SUPABASE_SECRET_KEY");
    return json({ code: "AUTH_UNAVAILABLE", message: "Tasdiqlash xizmati vaqtincha ishlamayapti." }, 503);
  }

  const ip = clientIp(request);
  const admin = createClient(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const quotas = [
    { scope: hash(secret, `otp-verify-pair:${ip}\u0000${email}`), limit: 5, window: 900 },
    { scope: hash(secret, `otp-verify-ip:${ip}`), limit: 30, window: 3600 },
  ];

  for (const item of quotas) {
    const { data, error } = await admin.rpc("consume_auth_action_quota", {
      p_scope_hash: item.scope,
      p_limit: item.limit,
      p_window_seconds: item.window,
    });
    if (error) {
      console.error("OTP verification quota check failed", error.code || "unknown");
      return json({ code: "AUTH_UNAVAILABLE", message: "Tasdiqlash xizmati vaqtincha ishlamayapti." }, 503);
    }
    const quota = (data || {}) as Quota;
    if (quota.allowed !== true) {
      const retryAfter = Math.max(1, Number(quota.retry_after) || 60);
      return json({ code: "TOO_MANY_ATTEMPTS", message: "Kod juda ko‘p marta tekshirildi. Birozdan keyin qayta urinib ko‘ring." }, 429, retryAfter);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, token, type: "email" }),
      cache: "no-store",
      signal: controller.signal,
    });
    const data = await upstream.json().catch(() => ({})) as AuthSuccess;
    if (upstream.ok && data.access_token && data.refresh_token && data.user?.id) {
      return json({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        user: data.user,
      });
    }
    if (upstream.status === 429) {
      return json({ code: "TOO_MANY_ATTEMPTS", message: "Kod juda ko‘p marta tekshirildi. Birozdan keyin qayta urinib ko‘ring." }, 429, Number(upstream.headers.get("retry-after") || 60));
    }
    if ([400, 401, 403, 422].includes(upstream.status)) {
      return json({ code: "INVALID_OTP", message: "Kiritilgan kod noto‘g‘ri yoki eskirgan." }, 400);
    }
    return json({ code: "AUTH_UNAVAILABLE", message: "Tasdiqlash xizmati vaqtincha ishlamayapti." }, 503);
  } catch (error) {
    if (controller.signal.aborted) return json({ code: "AUTH_TIMEOUT", message: "Tasdiqlash xizmatidan javob kelmadi." }, 504);
    console.error("OTP verification upstream failed", error instanceof Error ? error.name : "unknown");
    return json({ code: "AUTH_UNAVAILABLE", message: "Tasdiqlash xizmati vaqtincha ishlamayapti." }, 503);
  } finally { clearTimeout(timeout); }
}
