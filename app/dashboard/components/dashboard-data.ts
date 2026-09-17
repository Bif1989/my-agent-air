import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type Profile = {
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  phone: string | null;
  agent_type: string | null;
  is_verified: boolean | null;
};

export type RequestItem = {
  id: string;
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
  adults: number | null;
  children: number | null;
  infants: number | null;
  category: string | null;
  status: string | null;
  created_at: string;
};

async function readJson<T>(path: string) {
  const response = await authenticatedSupabaseFetch(path);
  return response.json() as Promise<T>;
}

async function countRows(path: string) {
  const response = await authenticatedSupabaseFetch(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const contentRange = response.headers.get("content-range") || "*/0";
  return Number(contentRange.split("/")[1]) || 0;
}

export async function loadDashboardData(userId: string) {
  const [profileRows, requests, openRequests, offers, deals, agents] = await Promise.all([
    readJson<Profile[]>(`profiles?select=full_name,company_name,city,phone,agent_type,is_verified&id=eq.${encodeURIComponent(userId)}&limit=1`),
    readJson<RequestItem[]>("requests?select=id,origin,destination,travel_date,adults,children,infants,category,status,created_at&order=created_at.desc&limit=5"),
    countRows("requests?select=id&status=eq.open"),
    countRows(`offers?select=id&agent_id=eq.${encodeURIComponent(userId)}`),
    countRows("deals?select=id&status=in.(accepted,processing,issued)"),
    countRows("profiles?select=id&is_active=eq.true"),
  ]);
  return { profile: profileRows[0] || null, requests, stats: { openRequests, offers, deals, agents } };
}
