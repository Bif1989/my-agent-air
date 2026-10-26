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

async function readProfileRows(response: Response, operation: "load" | "save") {
  const prefix = operation === "load" ? "PROFILE_LOAD" : "PROFILE_SAVE";
  if (!response.ok) {
    if (response.status === 401) throw new Error("AUTH_SESSION_EXPIRED");
    throw new Error(`${prefix}_FAILED_${response.status}`);
  }
  const body: unknown = await response.json().catch(() => null);
  const nullableStrings = ["full_name", "avatar_url", "company_name", "region", "city", "phone", "agent_type", "role", "updated_at"];
  const validRow = (value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return row.id === currentUserId()
      && nullableStrings.every((key) => row[key] === null || typeof row[key] === "string")
      && (row.services === null || (Array.isArray(row.services) && row.services.every((item) => typeof item === "string")))
      && ["is_verified", "is_active"].every((key) => row[key] === null || typeof row[key] === "boolean")
      && ["pending_email", "incomplete", "active", "suspended"].includes(String(row.registration_status))
      && typeof row.created_at === "string";
  };
  if (!Array.isArray(body) || body.length > 1 || !body.every(validRow)) throw new Error(`${prefix}_INVALID_RESPONSE`);
  return body as ProfileRecord[];
}

export function getCurrentProfile() {
  const userId = currentUserId();
  return dedupeInFlight("profile:current", userId, async () => {
    const response = await authenticatedSupabaseFetch(`profiles?select=${encodeURIComponent(PROFILE_FIELDS)}&id=eq.${encodeURIComponent(userId)}&limit=1`);
    const rows = await readProfileRows(response, "load");
    return rows[0] || null;
  });
}

export async function listUzLocations() {
  const response = await authenticatedSupabaseFetch("uz_locations?select=region,locality,kind,sort_order&order=sort_order.asc");
  if (!response.ok) throw new Error("Lokatsiyalar ro‘yxati yuklanmadi. Qayta urinib ko‘ring.");
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || !rows.length || !rows.every((row) =>
    row && typeof row.region === "string" && typeof row.locality === "string"
    && (row.kind === "city" || row.kind === "district") && typeof row.sort_order === "number"
  )) throw new Error("Lokatsiyalar ro‘yxati noto‘g‘ri formatda. Qayta urinib ko‘ring.");
  return rows as UzLocation[];
}

export async function updateCurrentProfile(profile: EditableProfile) {
  const response = await authenticatedSupabaseFetch(`profiles?id=eq.${encodeURIComponent(currentUserId())}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(profile),
  });
  const rows = await readProfileRows(response, "save");
  if (!rows[0]) throw new Error("Profil saqlanmadi. Qayta urinib ko‘ring.");
  window.dispatchEvent(new Event("my-agent-air:profile-updated"));
  return rows[0] || null;
}
