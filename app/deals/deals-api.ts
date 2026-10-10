import type { RequestRecord } from "@/app/requests/requests-api";
import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export const DEAL_STATUSES = ["accepted", "processing", "issued", "completed", "cancelled"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

const PROFILE_FIELDS = "id,full_name,company_name,city,phone,agent_type,is_verified";
const REQUEST_FIELDS = "id,origin,destination,category,travel_date,description,adults,children,infants,baggage,budget,currency,service_details,form_version";
const OFFER_FIELDS = "id,airline,baggage,comment,price,currency,status,created_at";
const DEAL_FIELDS = `id,request_id,offer_id,buyer_id,seller_id,agreed_price,currency,status,created_at,updated_at,request:requests!deals_request_id_fkey(${REQUEST_FIELDS}),offer:offers!deals_offer_id_fkey(${OFFER_FIELDS}),buyer:profiles!deals_buyer_id_fkey(${PROFILE_FIELDS}),seller:profiles!deals_seller_id_fkey(${PROFILE_FIELDS})`;

export type DealProfile = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  phone: string | null;
  agent_type: string | null;
  is_verified: boolean | null;
};

export type DealRequest = Pick<RequestRecord, "id" | "origin" | "destination" | "category" | "travel_date" | "description" | "adults" | "children" | "infants" | "baggage" | "budget" | "currency" | "service_details" | "form_version">;

export type DealOffer = {
  id: string;
  airline: string | null;
  baggage: string | null;
  comment: string | null;
  price: number | null;
  currency: string | null;
  status: string | null;
  created_at: string;
};

export type DealRecord = {
  id: string;
  request_id: string;
  offer_id: string;
  buyer_id: string;
  seller_id: string;
  agreed_price: number | null;
  currency: string;
  status: DealStatus;
  created_at: string;
  updated_at: string;
  request: DealRequest | null;
  offer: DealOffer | null;
  buyer: DealProfile | null;
  seller: DealProfile | null;
};

export type DealActivity = {
  id: string;
  event_type: "offer_accepted" | "deal_status_changed" | string;
  created_at: string;
  actor_id: string | null;
  event_data: Record<string, unknown> | null;
  actor: DealProfile | null;
};

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

function listByRole(role: "buyer_id" | "seller_id") {
  const userId = currentUserId();
  return dedupeInFlight("deals:list-role", `${userId}:${role}`, async () => {
    const response = await authenticatedSupabaseFetch(`deals?select=${encode(DEAL_FIELDS)}&${role}=eq.${encode(userId)}&order=created_at.desc`);
    return readJson<DealRecord[]>(response);
  });
}

export function listDeals() {
  const userId = currentUserId();
  return dedupeInFlight("deals:list", userId, async () => {
    const encodedUserId = encode(userId);
    const response = await authenticatedSupabaseFetch(`deals?select=${encode(DEAL_FIELDS)}&or=(buyer_id.eq.${encodedUserId},seller_id.eq.${encodedUserId})&order=created_at.desc`);
    return readJson<DealRecord[]>(response);
  });
}

export function listBuyerDeals() {
  return listByRole("buyer_id");
}

export function listSellerDeals() {
  return listByRole("seller_id");
}

export function getDeal(id: string) {
  const userId = currentUserId();
  return dedupeInFlight("deals:get", `${userId}:${id}`, async () => {
    const response = await authenticatedSupabaseFetch(`deals?select=${encode(DEAL_FIELDS)}&id=eq.${encode(id)}&limit=1`);
    const rows = await readJson<DealRecord[]>(response);
    return rows[0] || null;
  });
}

export function listDealActivity(dealId: string) {
  const userId = currentUserId();
  return dedupeInFlight("deals:activity", `${userId}:${dealId}`, async () => {
    const activityFields = "id,event_type,created_at,actor_id,event_data,actor:profiles!activity_log_actor_id_fkey(" + PROFILE_FIELDS + ")";
    const response = await authenticatedSupabaseFetch(`activity_log?select=${encode(activityFields)}&deal_id=eq.${encode(dealId)}&order=created_at.desc`);
    return readJson<DealActivity[]>(response);
  });
}

export async function updateDealStatus(id: string, status: DealStatus) {
  const response = await authenticatedSupabaseFetch("rpc/update_deal_status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_deal_id: id, p_status: status }),
  });
  return response.json() as Promise<DealRecord | DealRecord[]>;
}

// Keep the request-to-deal handoff scoped to the signed-in participant and RLS.
export function getDealForRequest(requestId: string) {
  const userId = currentUserId();
  return dedupeInFlight("deals:request", `${userId}:${requestId}`, async () => {
    const params = new URLSearchParams({
      select: "id",
      request_id: `eq.${requestId}`,
      or: `(buyer_id.eq.${userId},seller_id.eq.${userId})`,
      order: "created_at.desc",
      limit: "1",
    });
    const response = await authenticatedSupabaseFetch(`deals?${params}`);
    const rows = await readJson<{ id: string }[]>(response);
    return rows[0] || null;
  });
}
