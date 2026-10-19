import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export const PROFILE_FIELDS = "id,full_name,avatar_url,company_name,region,city,phone,agent_type,services,is_verified,is_active,registration_status,role,created_at,updated_at";

export type ProfileRecord = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  company_name: string | null;
  region: string | null;
  city: string | null;
  phone: string | null;
  agent_type: string | null;
  services: string[] | null;
  is_verified: boolean | null;
  is_active: boolean | null;
  registration_status: "pending_email" | "incomplete" | "active" | "suspended";
  role: "agent" | "admin" | string | null;
  created_at: string;
  updated_at: string | null;
};

export type EditableProfile = {
  full_name: string;
  avatar_url: string;
  company_name: string;
  region: string;
  city: string;
  phone: string;
  agent_type: string;
  services: string[];
};

export type UzLocation = {
  region: string;
  locality: string;
  kind: "city" | "district";
  sort_order: number;
};

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

export function getCurrentProfile() {
  const userId = currentUserId();
  return dedupeInFlight("profile:current", userId, async () => {
    const response = await authenticatedSupabaseFetch(`profiles?select=${encodeURIComponent(PROFILE_FIELDS)}&id=eq.${encodeURIComponent(userId)}&limit=1`);
    const rows = await response.json() as ProfileRecord[];
    return rows[0] || null;
  });
}

export async function listUzLocations() {
  const response = await authenticatedSupabaseFetch("uz_locations?select=region,locality,kind,sort_order&order=sort_order.asc");
  return response.json() as Promise<UzLocation[]>;
}

export async function updateCurrentProfile(profile: EditableProfile) {
  const response = await authenticatedSupabaseFetch(`profiles?id=eq.${encodeURIComponent(currentUserId())}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(profile),
  });
  const rows = await response.json() as ProfileRecord[];
  if (!rows[0]) throw new Error("Profil saqlanmadi. Qayta urinib ko‘ring.");
  window.dispatchEvent(new Event("my-agent-air:profile-updated"));
  return rows[0] || null;
}
