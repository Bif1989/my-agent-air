import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase-config";

export const SESSION_STORAGE_KEY = "my_agent_air_session";
// Kept only so older installations can clean up the legacy duplicate token key.
export const ACCESS_TOKEN_STORAGE_KEY = "my_agent_air_access_token";
export const AUTH_SESSION_CHANGED_EVENT = "my-agent-air:session-changed";

const AUTH_REQUEST_TIMEOUT_MS = 15_000;

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  user: { id: string; email?: string };
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: Partial<AuthSession["user"]>;
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
  code?: string;
  error_code?: string;
};

type SupabaseUser = { id: string; email?: string };
let refreshInFlight: Promise<AuthSession | null> | null = null;

export class SupabaseRequestError extends Error {
  constructor(message: string, public status: number, public code = "") {
    super(message);
    this.name = "SupabaseRequestError";
  }
}

function isBrowser() {
  return typeof window !== "undefined";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    if (response.status === 429) throw new SupabaseRequestError("Qayta urinish uchun biroz kuting.", response.status, data.error_code);
    if (path === "verify" && (response.status === 400 || response.status === 401)) {
      throw new SupabaseRequestError("Kiritilgan kod noto‘g‘ri yoki eskirgan.", response.status, data.error_code);
    }
    if ([400, 401, 403].includes(response.status)) throw new SupabaseRequestError("Email yoki parol noto‘g‘ri.", response.status, data.error_code);
    if (response.status === 422) throw new SupabaseRequestError("Ma’lumotlar talabga mos kelmadi. Tekshirib qayta kiriting.", response.status, data.error_code);
    throw new SupabaseRequestError("Kirish xizmatida vaqtinchalik xatolik. Qayta urinib ko‘ring.", response.status, data.error_code);
  }
  return data;
}

export function signUp(body: {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
  phone: string;
  city: string;
  agent_type: string;
}) {
  return authRequest("signup", {
    email: normalizeEmail(body.email),
    password: body.password,
    data: {
      full_name: body.full_name.trim(),
      company_name: body.company_name.trim(),
      phone: body.phone.trim(),
      city: body.city.trim(),
      agent_type: body.agent_type.trim(),
    },
  });
}

export function verifySignupOtp(email: string, token: string) {
  return authRequest("verify", {
    email: normalizeEmail(email),
    token: token.trim(),
    type: "email",
  });
}

export function resendSignupOtp(email: string) {
  return authRequest("resend", {
    email: normalizeEmail(email),
    type: "signup",
  });
}

export function signIn(email: string, password: string) {
  return authRequest("token?grant_type=password", { email: normalizeEmail(email), password });
}

export function saveSession(data: AuthResponse) {
  if (!data.access_token || !data.refresh_token || !data.user?.id) {
    throw new Error("Session yaratilmadi. Emailingizni tasdiqlash talab qilinishi mumkin.");
  }
  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: { id: data.user.id, email: data.user.email },
  };
  if (!isBrowser()) return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  // Older builds duplicated the access token under a second localStorage key.
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export function clearSession() {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
}

export function getStoredSession(): AuthSession | null {
  if (!isBrowser()) return null;
  // Always remove the legacy duplicate token if a user upgrades from an older build.
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!storedSession) return null;
  try {
    const session = JSON.parse(storedSession) as Partial<AuthSession> & { user?: Partial<SupabaseUser> };
    if (!session.access_token || !session.refresh_token || !session.user?.id) return null;
    return {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user: { id: session.user.id, email: session.user.email },
    };
  } catch {
    clearSession();
    return null;
  }
}

async function performRefresh(): Promise<AuthSession | null> {
  const session = getStoredSession();
  if (!session) return null;
  try {
    const data = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    // A logout, account switch or refresh in another tab must win over an older response.
    const current = getStoredSession();
    if (!current || current.refresh_token !== session.refresh_token) return current;
    saveSession({ ...data, user: data.user || session.user });
    return getStoredSession();
  } catch (error) {
    const current = getStoredSession();
    if (!current || current.refresh_token !== session.refresh_token) return current;
    if (error instanceof SupabaseRequestError && [400, 401, 403].includes(error.status)) {
      clearSession();
      return null;
    }
    // Keep the session during network outages and server errors so a retry can recover.
    throw new Error("Ulanish vaqtincha uzildi. Internetni tekshirib, qayta urinib ko‘ring.");
  }
}

export async function refreshSession(): Promise<AuthSession | null> {
  if (refreshInFlight) return refreshInFlight;
  const previous = getStoredSession();
  const run = () => {
    const current = getStoredSession();
    if (current?.refresh_token !== previous?.refresh_token) return Promise.resolve(current);
    return performRefresh();
  };
  const task = async () => typeof navigator !== "undefined" && navigator.locks
    ? await navigator.locks.request("my-agent-air:refresh-session", run)
    : await run();
  refreshInFlight = task().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export function sessionNeedsRefresh(session: AuthSession, now = Date.now()) {
  try {
    const claims = JSON.parse(atob(session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.exp === "number" && claims.exp * 1000 <= now + 60_000;
  } catch {
    return false;
  }
}

export async function authenticatedSupabaseFetch(path: string, init: RequestInit = {}) {
  let session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");

  const request = (accessToken: string) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });

  let response = await request(session.access_token);
  if (response.status === 401) {
    session = await refreshSession();
    if (!session) throw new Error("AUTH_SESSION_EXPIRED");
    response = await request(session.access_token);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as AuthResponse;
    const reason = data.message || data.error_description || "";
    const messages: Record<string, string> = {
      account_inactive: "Hisobingiz bloklangan. Administrator bilan bog‘laning.",
      counterpart_inactive: "Hamkor hisobi hozir faol emas.",
      request_expired: "So‘rov muddati tugagan. Egasi sanani yangilashi kerak.",
      request_not_open: "Bu so‘rov endi ochiq emas.",
      offer_not_pending: "Bu taklif allaqachon ko‘rib chiqilgan.",
      invalid_status_transition: "Bitim holatini shu bosqichga o‘zgartirib bo‘lmaydi.",
      system_message_forbidden: "Tizim xabarini yuborishga ruxsat yo‘q.",
      profile_incomplete: "Avval kompaniya, shahar va aloqa ma’lumotlarini to‘ldiring.",
    };
    const message = Object.entries(messages).find(([code]) => reason.includes(code))?.[1]
      || (data.code === "23505" ? "Bu yozuv allaqachon mavjud. Sahifani yangilang."
        : data.code === "23514" ? "Kiritilgan qiymatlar talabga mos emas. Narx, sana va valyutani tekshiring."
          : response.status === 403 ? "Bu amal uchun ruxsat yo‘q. Hisob va profil holatini tekshiring."
            : "Ma’lumotlarni saqlash yoki yuklashda xatolik. Qayta urinib ko‘ring.");
    throw new SupabaseRequestError(message, response.status, data.code);
  }
  return response;
}

export function requestPasswordReset(email: string, redirectTo: string) {
  return authRequest(`recover?redirect_to=${encodeURIComponent(redirectTo)}`, { email: normalizeEmail(email) });
}

export async function consumeRecoveryLink(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  if (hash.has("error") || url.searchParams.has("error")) throw new Error("Tiklash havolasi eskirgan. Yangi havola so‘rang.");
  let data: AuthResponse;
  if (url.searchParams.get("type") === "recovery" && url.searchParams.get("token_hash")) {
    data = await authRequest("verify", { type: "recovery", token_hash: url.searchParams.get("token_hash") });
  } else if (hash.get("type") === "recovery" && hash.get("access_token") && hash.get("refresh_token")) {
    const accessToken = hash.get("access_token")!;
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) throw new Error("Tiklash havolasi eskirgan. Yangi havola so‘rang.");
    data = { access_token: accessToken, refresh_token: hash.get("refresh_token")!, user: await response.json() as SupabaseUser };
  } else {
    throw new Error("Emailga kelgan tiklash havolasini oching yoki yangi havola so‘rang.");
  }
  saveSession(data);
  return getStoredSession();
}

export async function updatePassword(password: string) {
  if (password.length < 8) throw new Error("Parol kamida 8 belgidan iborat bo‘lsin.");
  const session = getStoredSession();
  if (!session) throw new Error("Tiklash havolasi eskirgan. Yangi havola so‘rang.");
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(response.status === 401 ? "Tiklash havolasi eskirgan. Yangi havola so‘rang." : "Parolni yangilab bo‘lmadi. Boshqa parol bilan qayta urinib ko‘ring.");
}

export async function signOut() {
  const session = getStoredSession();
  try {
    if (session) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
    }
  } finally {
    clearSession();
  }
}
