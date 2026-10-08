import { getStoredSession, SupabaseRequestError } from "@/lib/supabase-auth";

const REQUEST_TIMEOUT_MS = 20_000;

export async function updateRecoveryPassword(password: string) {
  const session = getStoredSession();
  if (!session) throw new SupabaseRequestError("Tiklash havolasi eskirgan. Yangi havola so‘rang.", 401, "RECOVERY_REQUIRED");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch("/api/auth/update-password", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) throw new SupabaseRequestError("Parolni yangilash xizmatidan javob kelmadi.", 408, "AUTH_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({})) as { message?: string; code?: string };
  if (!response.ok) {
    throw new SupabaseRequestError(
      data.message || "Parolni yangilab bo‘lmadi. Qayta urinib ko‘ring.",
      response.status,
      data.code || "PASSWORD_UPDATE_FAILED",
    );
  }
}
