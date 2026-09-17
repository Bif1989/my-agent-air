import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export const PROFILE_FIELDS = "id,full_name,avatar_url,company_name,city,phone,agent_type,services,is_verified,is_active,role,created_at,updated_at";

export type ProfileRecord = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
  city: string | null;
  phone: string | null;
  agent_type: string | null;
  services: string[] | null;
  is_verified: boolean | null;
  is_active: boolean | null;
  role: "agent" | "admin" | string | null;
  created_at: string;
  updated_at: string | null;
};

export type EditableProfile = {
  full_name: string;
  avatar_url: string;
  company_name: string;
  city: string;
  phone: string;
  agent_type: string;
  services: string[];
};

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

export async function getCurrentProfile() {
  const response = await authenticatedSupabaseFetch(`profiles?select=${encodeURIComponent(PROFILE_FIELDS)}&id=eq.${encodeURIComponent(currentUserId())}&limit=1`);
  const rows = await response.json() as ProfileRecord[];
  return rows[0] || null;
}

export async function updateCurrentProfile(profile: EditableProfile) {
  const response = await authenticatedSupabaseFetch(`profiles?id=eq.${encodeURIComponent(currentUserId())}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(profile),
  });
  const rows = await response.json() as ProfileRecord[];
  return rows[0] || null;
}