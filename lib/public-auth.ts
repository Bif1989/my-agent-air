import { SupabaseRequestError } from "@/lib/supabase-auth";

const AUTH_REQUEST_TIMEOUT_MS = 20_000;

type PublicAuthResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string };
  code?: string;
  message?: string;
  ok?: boolean;
};

type SignupInput = {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
  phone: string;
  city: string;
  agent_type: string;
  captcha_token?: string;
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
    if (response.status === 422) throw new SupabaseRequestError(data.message || "Ma’lumotlarni tekshirib qayta kiriting.", 422, code);
    if ([400, 401, 403].includes(response.status)) throw new SupabaseRequestError(data.message || "So‘rov qabul qilinmadi.", response.status, code);
    throw new SupabaseRequestError(data.message || "Xizmat vaqtincha ishlamayapti. Qayta urinib ko‘ring.", response.status, code);
  }
  return data;
}

export function signUpProtected(input: SignupInput) {
  return post("/api/auth/signup", {
    ...input,
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name.trim(),
    company_name: input.company_name.trim(),
    phone: input.phone.trim(),
    city: input.city.trim(),
    agent_type: input.agent_type.trim(),
    captcha_token: input.captcha_token || "",
  });
}

export function verifySignupOtpProtected(email: string, token: string) {
  return post("/api/auth/verify-signup", {
    email: email.trim().toLowerCase(),
    token: token.trim(),
  });
}

export function resendSignupOtpProtected(email: string) {
  return post("/api/auth/resend-signup", { email: email.trim().toLowerCase() });
}

export function requestPasswordResetProtected(email: string, captchaToken = "") {
  return post("/api/auth/recover", { email: email.trim().toLowerCase(), captcha_token: captchaToken });
}
