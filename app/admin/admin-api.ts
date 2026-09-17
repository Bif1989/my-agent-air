import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";
import { PROFILE_FIELDS, type ProfileRecord } from "@/app/profile/profile-api";

export type AdminStats = { activeAgents: number; verifiedAgents: number; unverifiedAgents: number; openRequests: number; activeDeals: number };
export type AdminAgent = ProfileRecord;
export type AgentCounts = { requests: number; offers: number; buyerDeals: number; sellerDeals: number };

async function countRows(path: string) {
  const response = await authenticatedSupabaseFetch(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const contentRange = response.headers.get("content-range") || "*/0";
  return Number(contentRange.split("/")[1]) || 0;
}

async function readJson<T>(path: string) {
  const response = await authenticatedSupabaseFetch(path);
  return response.json() as Promise<T>;
}

export async function loadAdminStats(): Promise<AdminStats> {
  const [activeAgents, verifiedAgents, unverifiedAgents, openRequests, activeDeals] = await Promise.all([
    countRows("profiles?select=id&is_active=eq.true&role=eq.agent"),
    countRows("profiles?select=id&is_verified=eq.true&role=eq.agent"),
    countRows("profiles?select=id&is_verified=eq.false&role=eq.agent"),
    countRows("requests?select=id&status=eq.open"),
    countRows("deals?select=id&status=in.(accepted,processing,issued)"),
  ]);
  return { activeAgents, verifiedAgents, unverifiedAgents, openRequests, activeDeals };
}

export function listAdminAgents() {
  return readJson<AdminAgent[]>(`profiles?select=${encodeURIComponent(PROFILE_FIELDS)}&role=eq.agent&order=created_at.desc`);
}

export async function getAdminAgent(id: string) {
  const [rows, requests, offers, buyerDeals, sellerDeals] = await Promise.all([
    readJson<AdminAgent[]>(`profiles?select=${encodeURIComponent(PROFILE_FIELDS)}&id=eq.${encodeURIComponent(id)}&limit=1`),
    countRows(`requests?select=id&created_by=eq.${encodeURIComponent(id)}`),
    countRows(`offers?select=id&agent_id=eq.${encodeURIComponent(id)}`),
    countRows(`deals?select=id&buyer_id=eq.${encodeURIComponent(id)}`),
    countRows(`deals?select=id&seller_id=eq.${encodeURIComponent(id)}`),
  ]);
  return { agent: rows[0] || null, counts: { requests, offers, buyerDeals, sellerDeals } satisfies AgentCounts };
}