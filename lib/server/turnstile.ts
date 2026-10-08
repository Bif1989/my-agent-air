const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 8_000;

export type TurnstileResult =
  | { ok: true; configured: false }
  | { ok: true; configured: true }
  | { ok: false; status: 400 | 403 | 503; code: string; message: string };

type SiteVerifyResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export function turnstileServerConfigured() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() || "";
  if (!siteKey && !secret) return "disabled" as const;
  if (!siteKey || !secret) return "misconfigured" as const;
  return "enabled" as const;
}

export async function verifyTurnstile(input: {
  token: string;
  action: string;
  remoteIp?: string;
  hostname?: string;
}): Promise<TurnstileResult> {
  const mode = turnstileServerConfigured();
  if (mode === "disabled") return { ok: true, configured: false };
  if (mode === "misconfigured") {
    console.error("Turnstile configuration incomplete");
    return { ok: false, status: 503, code: "CAPTCHA_UNAVAILABLE", message: "Xavfsizlik tekshiruvi vaqtincha ishlamayapti." };
  }
  if (!input.token || input.token.length > 4096) {
    return { ok: false, status: 400, code: "CAPTCHA_REQUIRED", message: "Xavfsizlik tekshiruvini yakunlang." };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY!.trim();
  const body = new URLSearchParams({ secret, response: input.token });
  if (input.remoteIp && input.remoteIp !== "unknown") body.set("remoteip", input.remoteIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error("Turnstile verification upstream status", response.status);
      return { ok: false, status: 503, code: "CAPTCHA_UNAVAILABLE", message: "Xavfsizlik tekshiruvi vaqtincha ishlamayapti." };
    }
    const data = await response.json().catch(() => ({})) as SiteVerifyResponse;
    if (data.success !== true) {
      console.warn("Turnstile rejected challenge", (data["error-codes"] || []).slice(0, 4));
      return { ok: false, status: 403, code: "CAPTCHA_FAILED", message: "Xavfsizlik tekshiruvi muvaffaqiyatsiz. Qayta urinib ko‘ring." };
    }
    if (data.action !== input.action) {
      console.warn("Turnstile action mismatch");
      return { ok: false, status: 403, code: "CAPTCHA_FAILED", message: "Xavfsizlik tekshiruvi muvaffaqiyatsiz. Qayta urinib ko‘ring." };
    }
    if (input.hostname && data.hostname && data.hostname.toLowerCase() !== input.hostname.toLowerCase()) {
      console.warn("Turnstile hostname mismatch");
      return { ok: false, status: 403, code: "CAPTCHA_FAILED", message: "Xavfsizlik tekshiruvi muvaffaqiyatsiz. Qayta urinib ko‘ring." };
    }
    return { ok: true, configured: true };
  } catch {
    console.error("Turnstile verification failed", controller.signal.aborted ? "timeout" : "network");
    return { ok: false, status: 503, code: "CAPTCHA_UNAVAILABLE", message: "Xavfsizlik tekshiruvi vaqtincha ishlamayapti." };
  } finally {
    clearTimeout(timeout);
  }
}
