import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";
import { PROFILE_FIELDS, type ProfileRecord } from "@/app/profile/profile-api";
import { requestFreshnessFilter } from "@/lib/request-freshness";

export type AdminStats = {
  totalAgentProfiles: number;
  activeAccounts: number;
  directoryAgents: number;
  incompleteProfiles: number;
  inactiveAgents: number;
  openRequests: number;
  expiredOpenRequests: number;
  totalOpenRequests: number;
  activeDeals: number;
};
export type AdminAgent = ProfileRecord;
export type AgentCounts = { requests: number; offers: number; buyerDeals: number; sellerDeals: number };
export type AdminAuditLog = { id: string; action: "set_verified" | "set_active" | string; admin_id: string; target_profile_id: string; old_value: string; new_value: string; created_at: string; admin_name: string; target_name: string };

async function countRows(path: string) {
  const response = await authenticatedSupabaseFetch(path, { method: "HEAD", headers: { Prefer: "count=exact" } });
  const contentRange = response.headers.get("content-range") || "*/0";
  return Number(contentRange.split("/")[1]) || 0;
}

async function readJson<T>(path: string) {
  const response = await authenticatedSupabaseFetch(path);
  return response.json() as Promise<T>;
}

async function countDirectoryAgents() {
  const response = await authenticatedSupabaseFetch("rpc/count_agents_directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const value = await response.json() as number | string;
  return Number(value) || 0;
}

export async function loadAdminStats(): Promise<AdminStats> {
  const currentRequestFilter = requestFreshnessFilter("current");
  const expiredRequestFilter = requestFreshnessFilter("expired");
  const [totalAgentProfiles, activeAccounts, directoryAgents, openRequests, expiredOpenRequests, totalOpenRequests, activeDeals] = await Promise.all([
    countRows("profiles?select=id&role=eq.agent"),
    countRows("profiles?select=id&is_active=eq.true&role=eq.agent"),
    countDirectoryAgents(),
    countRows(`requests?select=id&status=eq.open&${currentRequestFilter}`),
    countRows(`requests?select=id&status=eq.open&${expiredRequestFilter}`),
    countRows("requests?select=id&status=eq.open"),
    countRows("deals?select=id&status=in.(accepted,processing,issued)"),
  ]);

  return {
    totalAgentProfiles,
    activeAccounts,
    directoryAgents,
    incompleteProfiles: Math.max(0, activeAccounts - directoryAgents),
    inactiveAgents: Math.max(0, totalAgentProfiles - activeAccounts),
    openRequests,
    expiredOpenRequests,
    totalOpenRequests,
    activeDeals,
  };
}

export function listAdminAgents() {
  return readJson<AdminAgent[]>(`profiles?select=${encodeURIComponent(PROFILE_FIELDS)}&role=eq.agent&order=created_at.desc`);
}

export async function setAgentVerified(userId: string, isVerified: boolean) {
  const response = await authenticatedSupabaseFetch("rpc/admin_set_agent_verified", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_user_id: userId, p_is_verified: isVerified }) });
  return response.json() as Promise<AdminAgent | AdminAgent[]>;
}

export async function setAgentActive(userId: string, isActive: boolean) {
  const response = await authenticatedSupabaseFetch("rpc/admin_set_agent_active", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ p_user_id: userId, p_is_active: isActive }) });
  return response.json() as Promise<AdminAgent | AdminAgent[]>;
}

function valueLabel(value: unknown) {
  if (value === true || value === "true") return "Ha";
  if (value === false || value === "false") return "Yo‘q";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object" && value !== null && "value" in value) return valueLabel((value as { value?: unknown }).value);
  return typeof value === "string" ? value : "Qiymat";
}

export async function listAdminAuditLogs() {
  const rows = await readJson<Array<{ id: string; action: AdminAuditLog["action"]; admin_id: string; target_profile_id: string; old_value: unknown; new_value: unknown; created_at: string }>>("admin_audit_log?select=id,action,admin_id,target_profile_id,old_value,new_value,created_at&order=created_at.desc&limit=20");
  const ids = [...new Set(rows.flatMap((row) => [row.admin_id, row.target_profile_id]))];
  if (!ids.length) return [] as AdminAuditLog[];
  const profiles = await readJson<Array<{ id: string; full_name: string | null; company_name: string | null }>>(`profiles?select=id,full_name,company_name&id=in.(${ids.map(encodeURIComponent).join(",")})`);
  const names = new Map(profiles.map((profile) => [profile.id, profile.full_name || profile.company_name || "Foydalanuvchi"]));
  return rows.map((row) => ({ ...row, old_value: valueLabel(row.old_value), new_value: valueLabel(row.new_value), admin_name: names.get(row.admin_id) || "Administrator", target_name: names.get(row.target_profile_id) || "Agent" }));
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
