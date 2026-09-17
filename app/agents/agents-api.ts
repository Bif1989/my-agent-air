import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

const AGENT_FIELDS = "id,full_name,avatar_url,company_name,city,phone,agent_type,services,is_verified,is_active,created_at";

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
  created_at: string;
};

export type AgentFilterOptions = {
  cities: string[];
  agentTypes: string[];
  services: string[];
};

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export async function listAgents() {
  const response = await authenticatedSupabaseFetch(`profiles?select=${encodeURIComponent(AGENT_FIELDS)}&is_active=eq.true&order=full_name.asc,created_at.desc`);
  return readJson<AgentRecord[]>(response);
}

export async function getAgent(id: string) {
  const response = await authenticatedSupabaseFetch(`profiles?select=${encodeURIComponent(AGENT_FIELDS)}&id=eq.${encodeURIComponent(id)}&is_active=eq.true&limit=1`);
  const rows = await readJson<AgentRecord[]>(response);
  return rows[0] || null;
}

export function loadAgentFilterOptions(agents: AgentRecord[]): AgentFilterOptions {
  const unique = (values: (string | null | undefined)[]) => [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((left, right) => left.localeCompare(right, "uz"));
  return {
    cities: unique(agents.map((agent) => agent.city)),
    agentTypes: unique(agents.map((agent) => agent.agent_type)),
    services: unique(agents.flatMap((agent) => agent.services || [])),
  };
}
