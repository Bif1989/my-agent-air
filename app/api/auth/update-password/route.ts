import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { checkPasswordExposure, newPasswordValidationMessage } from "@/lib/server/password-security";

export const runtime = "nodejs";
export const maxDuration = 20;

const MAX_BODY_BYTES = 4 * 1024;
const AUTH_TIMEOUT_MS = 12_000;
const RECOVERY_MAX_AGE_SECONDS = 60 * 60;

type Body = { password?: unknown };
type JwtClaims = { sub?: unknown; exp?: unknown; amr?: unknown };

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
}

function crossSite(request: NextRequest) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host !== request.nextUrl.host; } catch { return true; }
}

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

async function readBody(request: NextRequest): Promise<Body | null> {
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) return null;
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Body : null;
  } catch { return null; }
}

function decodeClaims(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as JwtClaims;
  } catch { return null; }
}

function recentRecovery(claims: JwtClaims | null) {
  if (!claims || typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp <= Math.floor(Date.now() / 1000)) return false;
  if (!Array.isArray(claims.amr)) return false;
  const now = Math.floor(Date.now() / 1000);
  return claims.amr.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const method = (entry as { method?: unknown }).method;
    const timestamp = (entry as { timestamp?: unknown }).timestamp;
    return method === "recovery" && typeof timestamp === "number" && timestamp <= now + 60 && timestamp >= now - RECOVERY_MAX_AGE_SECONDS;
  });
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return json({ code: "FORBIDDEN", message: "Parolni yangilash so‘rovi qabul qilinmadi." }, 403);
  const token = bearer(request);
  if (!token) return json({ code: "RECOVERY_REQUIRED", message: "Tiklash havolasi eskirgan. Yangi havola so‘rang." }, 401);

  const input = await readBody(request);
  const password = typeof input?.password === "string" ? input.password : "";
  const validation = newPasswordValidationMessage(password);
  if (validation) return json({ code: "WEAK_PASSWORD", message: validation }, 422);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal,
    });
    const user = await userResponse.json().catch(() => ({})) as { id?: string };
    const claims = decodeClaims(token);
    if (!userResponse.ok || !user.id || !claims || claims.sub !== user.id || !recentRecovery(claims)) {
      return json({ code: "RECOVERY_REQUIRED", message: "Tiklash havolasi eskirgan. Yangi havola so‘rang." }, 401);
    }

    const exposure = await checkPasswordExposure(password);
    if (exposure.status === "leaked") {
      return json({ code: "PASSWORD_COMPROMISED", message: "Bu parol avval ma’lumot sizishlarida uchragan. Boshqa, noyob parol tanlang." }, 422);
    }
    if (exposure.status === "unavailable") console.warn("Pwned-password check unavailable during recovery", exposure.reason);

    const updateResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (updateResponse.ok) return json({ ok: true });
    if ([400, 401, 403, 422].includes(updateResponse.status)) {
      return json({ code: "PASSWORD_UPDATE_REJECTED", message: "Parolni yangilab bo‘lmadi. Boshqa parol tanlang yoki yangi tiklash havolasini so‘rang." }, 422);
    }
    return json({ code: "AUTH_UNAVAILABLE", message: "Parolni yangilash xizmati vaqtincha ishlamayapti." }, 503);
  } catch {
    if (controller.signal.aborted) return json({ code: "AUTH_TIMEOUT", message: "Parolni yangilash xizmatidan javob kelmadi." }, 504);
    return json({ code: "AUTH_UNAVAILABLE", message: "Parolni yangilash xizmati vaqtincha ishlamayapti." }, 503);
  } finally {
    clearTimeout(timeout);
  }
}
