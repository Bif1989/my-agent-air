import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export const REQUEST_SELECT = "id,created_by,category,origin,destination,travel_date,adults,children,infants,baggage,budget,currency,description,status,created_at,updated_at,creator:profiles!requests_created_by_fkey(id,full_name,company_name,city,phone,agent_type,is_verified)";

export type RequestStatus = "open" | "accepted" | "closed" | "cancelled";

export type RequestCreator = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  phone: string | null;
  agent_type: string | null;
  is_verified: boolean | null;
};

export type RequestRecord = {
  id: string;
  created_by: string;
  category: string;
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
  adults: number;
  children: number;
  infants: number;
  baggage: string | null;
  budget: number | null;
  currency: string;
  description: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  creator: RequestCreator | null;
};

export type RequestPayload = {
  category: string;
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
  adults: number;
  children: number;
  infants: number;
  baggage: string | null;
  budget: number | null;
  currency: string;
  description: string | null;
};

export type ListRequestOptions = {
  status?: RequestStatus | "all";
  category?: string;
  search?: string;
  createdBy?: string;
};

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function encodeFilter(value: string) {
  return encodeURIComponent(value);
}

function ownerFilter() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return `created_by=eq.${encodeFilter(session.user.id)}`;
}

export async function listRequests(options: ListRequestOptions = {}) {
  const filters = [`select=${encodeURIComponent(REQUEST_SELECT)}`, "order=created_at.desc", "limit=20"];
  if (options.status && options.status !== "all") filters.push(`status=eq.${encodeFilter(options.status)}`);
  if (options.category) filters.push(`category=eq.${encodeFilter(options.category)}`);
  if (options.createdBy) filters.push(`created_by=eq.${encodeFilter(options.createdBy)}`);
  if (options.search?.trim()) {
    const search = encodeFilter(`*${options.search.trim()}*`);
    filters.push(`or=(origin.ilike.${search},destination.ilike.${search})`);
  }
  const response = await authenticatedSupabaseFetch(`requests?${filters.join("&")}`);
  return readJson<RequestRecord[]>(response);
}

export async function getRequest(id: string) {
  const response = await authenticatedSupabaseFetch(`requests?select=${encodeURIComponent(REQUEST_SELECT)}&id=eq.${encodeFilter(id)}&limit=1`);
  const rows = await readJson<RequestRecord[]>(response);
  return rows[0] || null;
}

export async function createRequest(payload: RequestPayload, createdBy: string) {
  const response = await authenticatedSupabaseFetch("requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, created_by: createdBy, status: "open" }),
  });
  const rows = await readJson<RequestRecord[]>(response);
  return rows[0];
}

export async function updateRequest(id: string, payload: RequestPayload) {
  const response = await authenticatedSupabaseFetch(`requests?id=eq.${encodeFilter(id)}&${ownerFilter()}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = await readJson<RequestRecord[]>(response);
  return rows[0] || null;
}

export async function updateRequestStatus(id: string, status: Extract<RequestStatus, "closed" | "cancelled">) {
  const response = await authenticatedSupabaseFetch(`requests?id=eq.${encodeFilter(id)}&${ownerFilter()}&status=eq.open`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status }),
  });
  const rows = await readJson<RequestRecord[]>(response);
  return rows[0] || null;
}

export async function deleteRequest(id: string) {
  await authenticatedSupabaseFetch(`requests?id=eq.${encodeFilter(id)}&${ownerFilter()}`, { method: "DELETE" });
}
