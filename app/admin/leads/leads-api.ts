import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type MarketingLeadStatus = "new" | "contacted" | "qualified" | "won" | "lost" | "spam";

export type MarketingLead = {
  id: string;
  source: string;
  platform: string;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  form_id: string | null;
  leadgen_id: string | null;
  full_name: string | null;
  phone: string | null;
  preferred_travel: string | null;
  status: MarketingLeadStatus;
  notes: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
};

export async function listMarketingLeads(params: {
  status?: MarketingLeadStatus | "";
  search?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const response = await authenticatedSupabaseFetch("rpc/admin_list_marketing_leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_status: params.status || null,
      p_search: params.search?.trim() || null,
      p_limit: params.limit ?? 100,
      p_offset: params.offset ?? 0,
    }),
  });
  return response.json() as Promise<MarketingLead[]>;
}

export async function updateMarketingLead(id: string, status: MarketingLeadStatus, notes: string) {
  const response = await authenticatedSupabaseFetch("rpc/admin_update_marketing_lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: id, p_status: status, p_notes: notes.trim() || null }),
  });
  const result = await response.json() as Array<Pick<MarketingLead, "id" | "status" | "notes" | "updated_at">>;
  return result[0] || null;
}
