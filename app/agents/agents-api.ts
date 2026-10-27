import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

const AGENT_FIELDS = "id,full_name,avatar_url,company_name,city,phone,agent_type,services,is_verified,is_active,registration_status,created_at";
const COMPLETE_AGENT_FILTER = "(company_name.not.is.null,city.not.is.null,phone.not.is.null,agent_type.not.is.null,agent_type.neq.agent)";

export type AgentRecord = {
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
  registration_status: "pending_email" | "incomplete" | "active" | "suspended";
  created_at: string;
  trust_score?: number | null;
  rating_average?: number | null;
  review_count?: number | null;
  completed_deals?: number | null;
};

export type AgentFilterOptions = {
  cities: string[];
  agentTypes: string[];
  services: string[];
};

export type AgentSort = "trust_desc" | "newest" | "oldest" | "name_asc" | "name_desc";
export type AgentDirectoryFilters = { search?: string; city?: string; agentType?: string; service?: string; verifiedOnly?: boolean };

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

function directoryFilterPayload(options: AgentDirectoryFilters) {
  return {
    p_search: options.search?.trim().slice(0, 100) || null,
    p_city: options.city || null,
    p_agent_type: options.agentType || null,
    p_service: options.service || null,
    p_verified_only: Boolean(options.verifiedOnly),
  };
}

export async function listAgents(options: AgentDirectoryFilters & { sort?: AgentSort; limit?: number; offset?: number } = {}) {
  const safeLimit = Math.max(1, Math.min(100, options.limit || 24));
  const safeOffset = Math.max(0, options.offset || 0);
  const response = await authenticatedSupabaseFetch("rpc/list_agents_with_trust", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...directoryFilterPayload(options),
      p_sort: options.sort || "trust_desc",
      p_limit: safeLimit,
      p_offset: safeOffset,
    }),
  });
  return readJson<AgentRecord[]>(response);
}

export async function countAgents(options: AgentDirectoryFilters = {}) {
  const response = await authenticatedSupabaseFetch("rpc/count_agents_directory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(directoryFilterPayload(options)),
  });
  const value = await readJson<number | string>(response);
  return Number(value) || 0;
}

export async function getAgentFilterOptions() {
  const response = await authenticatedSupabaseFetch("rpc/list_agent_filter_options", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  return readJson<AgentFilterOptions>(response);
}

export function getAgent(id: string) {
  const userId = currentUserId();
  return dedupeInFlight("agents:get", `${userId}:${id}`, async () => {
    const params = new URLSearchParams({
      select: AGENT_FIELDS,
      id: `eq.${id}`,
      role: "eq.agent",
      is_active: "eq.true",
      registration_status: "eq.active",
      and: COMPLETE_AGENT_FILTER,
      limit: "1",
    });
    const response = await authenticatedSupabaseFetch(`profiles?${params}`);
    const rows = await readJson<AgentRecord[]>(response);
    return rows[0] || null;
  });
}

export function loadAgentFilterOptions(agents: AgentRecord[]): AgentFilterOptions {
  const unique = (values: (string | null | undefined)[]) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "uz"));
  return {
    cities: unique(agents.map((agent) => agent.city)),
    agentTypes: unique(agents.map((agent) => agent.agent_type)),
    services: unique(agents.flatMap((agent) => agent.services || [])),
  };
}
