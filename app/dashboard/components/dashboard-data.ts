import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type Profile = {
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  phone: string | null;
  agent_type: string | null;
  is_verified: boolean | null;
};

type DashboardStats = {
  openRequests: number;
  offers: number;
  deals: number;
  agents: number;
};

type DashboardSummary = {
  profile: Profile | null;
  stats: DashboardStats;
};

export async function loadDashboardData() {
  const response = await authenticatedSupabaseFetch("rpc/get_dashboard_summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const summary = (await response.json()) as DashboardSummary;
  return {
    profile: summary.profile || null,
    stats: {
      openRequests: Number(summary.stats?.openRequests) || 0,
      offers: Number(summary.stats?.offers) || 0,
      deals: Number(summary.stats?.deals) || 0,
      agents: Number(summary.stats?.agents) || 0,
    },
  };
}