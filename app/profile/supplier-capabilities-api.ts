import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type SupplierCapabilityType =
  | "aviation"
  | "travel_agent"
  | "tour_operator"
  | "hotel"
  | "transport"
  | "guide"
  | "restaurant"
  | "visa"
  | "other";

export type SupplierPriceBasis =
  | "total"
  | "per_person"
  | "per_room_night"
  | "per_person_night"
  | "per_vehicle"
  | "per_hour"
  | "per_day"
  | "per_unit";

export type SupplierCapabilityRecord = {
  id: string;
  profile_id: string;
  capability_type: SupplierCapabilityType;
  region: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  capacity: number | null;
  min_price: number | null;
  currency: "USD" | "UZS" | "EUR" | "RUB" | null;
  price_basis: SupplierPriceBasis | null;
  details: Record<string, unknown>;
  onboarding_status: "seeded" | "in_progress" | "complete";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type EditableSupplierCapability = {
  id?: string;
  capability_type: SupplierCapabilityType;
  region: string;
  city: string;
  district: string;
  address: string;
  capacity: string;
  min_price: string;
  currency: "USD" | "UZS" | "EUR" | "RUB";
  price_basis: SupplierPriceBasis;
  is_active: boolean;
};

const SELECT_FIELDS = "id,profile_id,capability_type,region,city,district,address,latitude,longitude,capacity,min_price,currency,price_basis,details,onboarding_status,is_active,created_at,updated_at";

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("INVALID_NUMBER");
  return parsed;
}

export async function listOwnSupplierCapabilities() {
  const profileId = currentUserId();
  const params = new URLSearchParams({
    select: SELECT_FIELDS,
    profile_id: `eq.${profileId}`,
    order: "is_active.desc,updated_at.desc,capability_type.asc",
  });
  const response = await authenticatedSupabaseFetch(`supplier_capabilities?${params}`);
  return response.json() as Promise<SupplierCapabilityRecord[]>;
}

export async function saveOwnSupplierCapability(capability: EditableSupplierCapability) {
  const profileId = currentUserId();
  const city = nullableText(capability.city);
  const payload = {
    profile_id: profileId,
    capability_type: capability.capability_type,
    region: nullableText(capability.region),
    city,
    district: nullableText(capability.district),
    address: nullableText(capability.address),
    capacity: nullableNumber(capability.capacity),
    min_price: nullableNumber(capability.min_price),
    currency: capability.currency,
    price_basis: capability.price_basis,
    onboarding_status: city ? "complete" : "in_progress",
    is_active: capability.is_active,
  };

  if (capability.id) {
    const response = await authenticatedSupabaseFetch(
      `supplier_capabilities?id=eq.${encodeURIComponent(capability.id)}&profile_id=eq.${encodeURIComponent(profileId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
    );
    const rows = await response.json() as SupplierCapabilityRecord[];
    if (!rows[0]) throw new Error("CAPABILITY_NOT_SAVED");
    return rows[0];
  }

  const response = await authenticatedSupabaseFetch("supplier_capabilities", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = await response.json() as SupplierCapabilityRecord[];
  if (!rows[0]) throw new Error("CAPABILITY_NOT_SAVED");
  return rows[0];
}
