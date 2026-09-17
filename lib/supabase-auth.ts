const SUPABASE_URL = "https://fsemjqlreuzvpyvbmxzt.supabase.co";
const SUPABASE_KEY = "sb_publishable_-GDTmDKA2vl2O2msBTSUBw_RIJ62pQS";

export const SESSION_STORAGE_KEY = "my_agent_air_session";
export const ACCESS_TOKEN_STORAGE_KEY = "my_agent_air_access_token";

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
};

type SupabaseUser = { id: string; email?: string };

function isBrowser() {
  return typeof window !== "undefined";
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new Error("Email yoki parol noto‘g‘ri.");
    if (response.status === 422) throw new Error("Bu email bilan ro‘yxatdan o‘tib bo‘lmadi. Ma’lumotlarni tekshiring.");
    throw new Error("Auth xizmatida vaqtinchalik xatolik yuz berdi.");
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
    email: body.email,
    password: body.password,
    data: {
      full_name: body.full_name,
      company_name: body.company_name,
      phone: body.phone,
      city: body.city,
      agent_type: body.agent_type,
    },
  });
}

export function signIn(email: string, password: string) {
  return authRequest("token?grant_type=password", { email, password });
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
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, data.access_token);
}

export function clearSession() {
  if (!isBrowser()) return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}

export function getStoredSession(): AuthSession | null {
  if (!isBrowser()) return null;
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

export async function refreshSession(): Promise<AuthSession | null> {
  const session = getStoredSession();
  if (!session) return null;
  try {
    const data = await authRequest("token?grant_type=refresh_token", { refresh_token: session.refresh_token });
    saveSession({ ...data, user: data.user || session.user });
    return getStoredSession();
  } catch {
    clearSession();
    return null;
  }
}

export async function authenticatedSupabaseFetch(path: string, init: RequestInit = {}) {
  let session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");

  const request = (accessToken: string) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });

  let response = await request(session.access_token);
  if (response.status === 401) {
    session = await refreshSession();
    if (!session) throw new Error("AUTH_SESSION_EXPIRED");
    response = await request(session.access_token);
  }
  if (!response.ok) {
    throw new Error(`SUPABASE_${response.status}`);
  }
  return response;
}

export async function signOut() {
  const session = getStoredSession();
  try {
    if (session) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.access_token}` },
      });
    }
  } finally {
    clearSession();
  }
}