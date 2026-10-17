import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type AdminReferralOverview = {
  total_referrals: number;
  qualified_referrals: number;
  pending_referrals: number;
  rejected_referrals: number;
  total_bonus: number;
};

export type AdminReferrerRow = {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  agent_type: string | null;
  is_verified: boolean;
  direct_count: number;
  qualified_count: number;
  pending_count: number;
  rejected_count: number;
  level1_count: number;
  level2_count: number;
  level3_count: number;
  total_bonus: number;
  last_referral_at: string | null;
};

export type AdminReferralRow = {
  referred_user_id: string;
  referrer_user_id: string;
  status: "pending" | "qualified" | "rejected";
  created_at: string;
  qualified_at: string | null;
  referrer_name: string | null;
  referrer_company: string | null;
  referred_name: string | null;
  referred_company: string | null;
  referred_phone: string | null;
  referred_agent_type: string | null;
  referred_is_verified: boolean;
  generated_bonus: number;
};

export type AdminReferralReward = {
  id: string;
  referred_user_id: string;
  beneficiary_user_id: string;
  level: 1 | 2 | 3;
  amount: number;
  created_at: string;
  beneficiary_name: string | null;
  beneficiary_company: string | null;
  referred_name: string | null;
  referred_company: string | null;
};

export type AdminReferralDashboard = {
  ok: boolean;
  overview: AdminReferralOverview;
  referrers: AdminReferrerRow[];
  referrals: AdminReferralRow[];
  rewards: AdminReferralReward[];
};

export async function getAdminReferralDashboard() {
  const response = await authenticatedSupabaseFetch("rpc/admin_get_referral_dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`SUPABASE_${response.status}`);
  return response.json() as Promise<AdminReferralDashboard>;
}
