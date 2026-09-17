import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";
import type { RequestRecord } from "@/app/requests/requests-api";

const REQUEST_FIELDS = "id,created_by,origin,destination,travel_date,category,status";
const PROFILE_FIELDS = "id,full_name,company_name,city,is_verified";
const OFFER_FIELDS = `id,request_id,agent_id,price,currency,airline,baggage,comment,status,created_at,agent:profiles!offers_agent_id_fkey(${PROFILE_FIELDS}),request:requests!offers_request_id_fkey!inner(${REQUEST_FIELDS})`;

export type OfferStatus = "pending" | "accepted" | "rejected" | "withdrawn";

export type OfferAgent = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  is_verified: boolean | null;
};

export type OfferRequest = Pick<RequestRecord, "id" | "created_by" | "origin" | "destination" | "travel_date" | "category" | "status">;

export type OfferRecord = {
  id: string;
  request_id: string;
  agent_id: string;
  price: number | null;
  currency: string;
  airline: string | null;
  baggage: string | null;
  comment: string | null;
  status: OfferStatus;
  created_at: string;
  agent: OfferAgent | null;
  request: OfferRequest | null;
};

export type OfferPayload = {
  price: number;
  currency: string;
  airline: string | null;
  baggage: string | null;
  comment: string | null;
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

export async function listMyOffers() {
  const agentId = currentUserId();
  const response = await authenticatedSupabaseFetch(`offers?select=${encode(OFFER_FIELDS)}&agent_id=eq.${encode(agentId)}&order=created_at.desc`);
  return readJson<OfferRecord[]>(response);
}

export async function listIncomingOffers() {
  const userId = currentUserId();
  const response = await authenticatedSupabaseFetch(`offers?select=${encode(OFFER_FIELDS)}&request.created_by=eq.${encode(userId)}&request.created_by=not.is.null&agent_id=neq.${encode(userId)}&order=created_at.desc`);
  return readJson<OfferRecord[]>(response);
}

export async function getOffer(id: string) {
  const response = await authenticatedSupabaseFetch(`offers?select=${encode(OFFER_FIELDS)}&id=eq.${encode(id)}&limit=1`);
  const rows = await readJson<OfferRecord[]>(response);
  return rows[0] || null;
}

export async function getOffersForRequest(requestId: string) {
  const response = await authenticatedSupabaseFetch(`offers?select=${encode(OFFER_FIELDS)}&request_id=eq.${encode(requestId)}&order=created_at.desc`);
  return readJson<OfferRecord[]>(response);
}

export async function getMyOfferForRequest(requestId: string) {
  const agentId = currentUserId();
  const response = await authenticatedSupabaseFetch(`offers?select=${encode(OFFER_FIELDS)}&request_id=eq.${encode(requestId)}&agent_id=eq.${encode(agentId)}&limit=1`);
  const rows = await readJson<OfferRecord[]>(response);
  return rows[0] || null;
}

export async function createOffer(requestId: string, payload: OfferPayload) {
  const response = await authenticatedSupabaseFetch("offers", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, request_id: requestId, agent_id: currentUserId(), status: "pending" }),
  });
  const rows = await readJson<OfferRecord[]>(response);
  return rows[0];
}

export async function updateOffer(id: string, payload: OfferPayload) {
  const response = await authenticatedSupabaseFetch(`offers?id=eq.${encode(id)}&agent_id=eq.${encode(currentUserId())}&status=eq.pending`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = await readJson<OfferRecord[]>(response);
  return rows[0] || null;
}

export async function withdrawOffer(id: string) {
  const response = await authenticatedSupabaseFetch(`offers?id=eq.${encode(id)}&agent_id=eq.${encode(currentUserId())}&status=eq.pending`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "withdrawn" }),
  });
  const rows = await readJson<OfferRecord[]>(response);
  return rows[0] || null;
}

export async function acceptOffer(offerId: string) {
  const response = await authenticatedSupabaseFetch("rpc/accept_offer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_offer_id: offerId }),
  });
  return response.json() as Promise<string>;
}
