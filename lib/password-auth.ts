import { SupabaseRequestError } from "@/lib/supabase-auth";

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

type ProtectedAuthResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string };
  message?: string;
  code?: string;
};

export async function signInProtected(email: string, password: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SupabaseRequestError("Kirish xizmatidan javob kelmadi. Qayta urinib ko‘ring.", 408, "AUTH_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({})) as ProtectedAuthResponse;
  if (!response.ok) {
    const code = typeof data.code === "string" ? data.code : "";
    if (response.status === 429) {
      throw new SupabaseRequestError("Juda ko‘p urinish. Birozdan keyin qayta urinib ko‘ring.", 429, code);
    }
    if ([400, 401, 403].includes(response.status)) {
      throw new SupabaseRequestError("Email yoki parol noto‘g‘ri.", response.status, code);
    }
    throw new SupabaseRequestError("Kirish xizmatida vaqtinchalik xatolik. Qayta urinib ko‘ring.", response.status, code);
  }

  return data;
}
