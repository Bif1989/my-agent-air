import { SupabaseRequestError } from "@/lib/supabase-auth";

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

type PublicAuthResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string };
  challenge_id?: string;
  terms_receipt?: unknown;
  phone?: string;
  code?: string;
  message?: string;
  ok?: boolean;
};

type EmailSignupInput = {
  email: string;
  password: string;
  captcha_token?: string;
  terms_version?: string;
};

type PhoneSignupInput = {
  phone: string;
  password: string;
  terms_receipt?: unknown;
};

async function post(path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new SupabaseRequestError("Xizmatdan javob kelmadi. Qayta urinib ko‘ring.", 408, "AUTH_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({})) as PublicAuthResponse;
  if (!response.ok) {
    const code = typeof data.code === "string" ? data.code : "";
    if (response.status === 429) throw new SupabaseRequestError(data.message || "Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.", 429, code);
    if ([409, 410, 422].includes(response.status)) throw new SupabaseRequestError(data.message || "Ma’lumotlarni tekshirib qayta kiriting.", response.status, code);
    if ([400, 401, 403, 404].includes(response.status)) throw new SupabaseRequestError(data.message || "So‘rov qabul qilinmadi.", response.status, code);
    throw new SupabaseRequestError(data.message || "Xizmat vaqtincha ishlamayapti. Qayta urinib ko‘ring.", response.status, code);
  }
  return data;
}

export function signUpProtected(input: EmailSignupInput) {
  return post("/api/auth/signup", {
    email: input.email.trim().toLowerCase(),
    password: input.password,
    captcha_token: input.captcha_token || "",
    terms_version: input.terms_version,
  });
}

export function requestSignupSmsProtected(phone: string, password: string, captchaToken: string, termsVersion?: string) {
  return post("/api/auth/signup-sms", { phase: "request", phone: phone.trim(), password, captcha_token: captchaToken, terms_version: termsVersion });
}

export function verifySignupSmsProtected(challengeId: string, phone: string, token: string) {
  return post("/api/auth/signup-sms", { phase: "verify", challenge_id: challengeId, phone: phone.trim(), token: token.trim() });
}

export function resendSignupSmsProtected(challengeId: string, phone: string) {
  return post("/api/auth/signup-sms", { phase: "resend", challenge_id: challengeId, phone: phone.trim() });
}

export function completeSignupSmsProtected(input: PhoneSignupInput, challengeId: string) {
  return post("/api/auth/signup-sms", {
    phase: "complete",
    challenge_id: challengeId,
    phone: input.phone.trim(),
    password: input.password,
    terms_receipt: input.terms_receipt,
  });
}

export function verifySignupOtpProtected(email: string, token: string) {
  return post("/api/auth/verify-signup", { email: email.trim().toLowerCase(), token: token.trim() });
}

export function resendSignupOtpProtected(email: string) {
  return post("/api/auth/resend-signup", { email: email.trim().toLowerCase() });
}

export function requestPasswordResetProtected(email: string, captchaToken = "") {
  return post("/api/auth/recover", { email: email.trim().toLowerCase(), captcha_token: captchaToken });
}
