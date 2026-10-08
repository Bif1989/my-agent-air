import { readBoundedJson } from "@/lib/server/bounded-json";
import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 15;

const MAX_BODY_BYTES = 4 * 1024;
const UPSTREAM_TIMEOUT_MS = 12_000;

type ResendBody = { email?: unknown };
type Quota = { allowed?: boolean; retry_after?: number };

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

async function readBody(request: NextRequest): Promise<ResendBody | null> {
  return readBoundedJson<ResendBody>(request, MAX_BODY_BYTES);
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return json({ code: "FORBIDDEN", message: "So‘rov qabul qilinmadi." }, 403);

  const input = await readBody(request);
  const email = typeof input?.email === "string" ? input.email.trim().toLowerCase().slice(0, 320) : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ code: "INVALID_INPUT", message: "Email manzilini tekshiring." }, 422);
  }

  const secret = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!secret) {
    console.error("OTP resend protection unavailable: missing SUPABASE_SECRET_KEY");
    return json({ code: "AUTH_UNAVAILABLE", message: "Kod yuborish xizmati vaqtincha ishlamayapti." }, 503);
  }

  const ip = clientIp(request);
  const admin = createClient(SUPABASE_URL, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const quotas = [
    { scope: hash(secret, `otp-resend-pair:${ip}\u0000${email}`), limit: 3, window: 1800 },
    { scope: hash(secret, `otp-resend-ip:${ip}`), limit: 20, window: 3600 },
  ];

  for (const item of quotas) {
    const { data, error } = await admin.rpc("consume_auth_action_quota", {
      p_scope_hash: item.scope,
      p_limit: item.limit,
      p_window_seconds: item.window,
    });
    if (error) {
      console.error("OTP resend quota check failed", error.code || "unknown");
      return json({ code: "AUTH_UNAVAILABLE", message: "Kod yuborish xizmati vaqtincha ishlamayapti." }, 503);
    }
    const quota = (data || {}) as Quota;
    if (quota.allowed !== true) {
      const retryAfter = Math.max(1, Number(quota.retry_after) || 60);
      return json({ code: "TOO_MANY_ATTEMPTS", message: "Kod juda ko‘p marta so‘raldi. Birozdan keyin qayta urinib ko‘ring." }, 429, retryAfter);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${SUPABASE_URL}/auth/v1/resend`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, type: "signup" }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (upstream.ok) return json({ ok: true, message: "Tasdiqlash kodi qayta yuborildi." });
    if (upstream.status === 429) {
      return json({ code: "TOO_MANY_ATTEMPTS", message: "Kod juda ko‘p marta so‘raldi. Birozdan keyin qayta urinib ko‘ring." }, 429, Number(upstream.headers.get("retry-after") || 60));
    }
    if ([400, 401, 403, 422].includes(upstream.status)) {
      // Do not expose account/confirmation state through the resend endpoint.
      return json({ ok: true, message: "Agar tasdiqlash kutilayotgan bo‘lsa, yangi kod yuborildi." });
    }
    return json({ code: "AUTH_UNAVAILABLE", message: "Kod yuborish xizmati vaqtincha ishlamayapti." }, 503);
  } catch (error) {
    if (controller.signal.aborted) return json({ code: "AUTH_TIMEOUT", message: "Kod yuborish xizmatidan javob kelmadi." }, 504);
    console.error("OTP resend upstream failed", error instanceof Error ? error.name : "unknown");
    return json({ code: "AUTH_UNAVAILABLE", message: "Kod yuborish xizmati vaqtincha ishlamayapti." }, 503);
  } finally { clearTimeout(timeout); }
}
