import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type ReferralDirectItem = {
  company_name: string | null;
  agent_type: string | null;
  status: "pending" | "qualified" | "rejected";
  created_at: string;
  qualified_at: string | null;
};

export type ReferralDashboard = {
  ok: boolean;
  reason?: string;
  code: string;
  direct_count: number;
  qualified_direct_count: number;
  pending_direct_count: number;
  total_bonus: number;
  level1_bonus: number;
  level2_bonus: number;
  level3_bonus: number;
  level1_count: number;
  level2_count: number;
  level3_count: number;
  recent_direct: ReferralDirectItem[];
};

export type ReferralClaimResult = {
  ok: boolean;
  reason?: "profile_not_found" | "claim_window_expired" | "invalid_code" | "self_referral" | "referral_cycle";
  already_claimed?: boolean;
};

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export function getMyReferralDashboard() {
  const userId = currentUserId();
  return dedupeInFlight("referral:dashboard", userId, async () => {
    const response = await authenticatedSupabaseFetch("rpc/get_my_referral_dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    return readJson<ReferralDashboard>(response);
  });
}

export async function claimReferralCode(code: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "invalid_code" } as ReferralClaimResult;
  const response = await authenticatedSupabaseFetch("rpc/claim_referral", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: normalized }),
  });
  return readJson<ReferralClaimResult>(response);
}
