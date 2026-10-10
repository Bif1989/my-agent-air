import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type DealReview = {
  id: string;
  deal_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type AgentReview = {
  id: string;
  deal_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_company: string | null;
};

export type AgentTrustStats = {
  user_id: string;
  review_count: number;
  rating_average: number | null;
  completed_deals: number;
  trust_score: number;
  updated_at: string;
};

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export async function getMyDealReview(dealId: string) {
  const userId = currentUserId();
  return dedupeInFlight("reviews:deal", `${userId}:${dealId}`, async () => {
    const response = await authenticatedSupabaseFetch("rpc/get_my_deal_review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_deal_id: dealId }),
    });
    const rows = await readJson<DealReview[]>(response);
    return rows[0] || null;
  });
}

export async function submitDealReview(dealId: string, rating: number, comment: string) {
  currentUserId();
  const response = await authenticatedSupabaseFetch("rpc/submit_deal_review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_deal_id: dealId, p_rating: rating, p_comment: comment.trim() || null }),
  });
  return readJson<string>(response);
}

export async function getAgentTrustStats(userId: string) {
  const viewerId = currentUserId();
  return dedupeInFlight("reviews:trust", `${viewerId}:${userId}`, async () => {
    const params = new URLSearchParams({
      select: "user_id,review_count,rating_average,completed_deals,trust_score,updated_at",
      user_id: `eq.${userId}`,
      limit: "1",
    });
    const response = await authenticatedSupabaseFetch(`profile_trust_stats?${params}`);
    const rows = await readJson<AgentTrustStats[]>(response);
    return rows[0] || null;
  });
}

export async function listAgentReviews(userId: string, limit = 10) {
  const viewerId = currentUserId();
  const safeLimit = Math.max(1, Math.min(50, limit));
  return dedupeInFlight("reviews:agent", `${viewerId}:${userId}:${safeLimit}`, async () => {
    const response = await authenticatedSupabaseFetch("rpc/list_agent_reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_user_id: userId, p_limit: safeLimit }),
    });
    return readJson<AgentReview[]>(response);
  });
}
