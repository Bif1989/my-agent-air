const SUPABASE_URL = "https://fsemjqlreuzvpyvbmxzt.supabase.co";
const SUPABASE_KEY = "sb_publishable_-GDTmDKA2vl2O2msBTSUBw_RIJ62pQS";

export const SESSION_STORAGE_KEY = "my_agent_air_session";
export const ACCESS_TOKEN_STORAGE_KEY = "my_agent_air_access_token";

export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  user?: { email?: string };
};

type AuthResponse = {
  access_token?: string;
  refresh_token?: string;
  user?: AuthSession["user"];
  error?: string;
  error_description?: string;
  msg?: string;
  message?: string;
};

async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as AuthResponse;
  if (!response.ok) {
    throw new Error(data.error_description || data.message || data.msg || data.error || "So‘rovni bajarib bo‘lmadi.");
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
  if (!data.access_token) {
    throw new Error("Session yaratilmadi. Emailingizni tasdiqlash talab qilinishi mumkin.");
  }
  const session: AuthSession = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user,
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, data.access_token);
}

export function clearSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
}