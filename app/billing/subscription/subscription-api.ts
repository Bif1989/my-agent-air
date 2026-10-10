import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type BillingSubscriptionStatus = {
  plan_code: string;
  plan_name: string;
  plan_price_amount: number | null;
  currency: "UZS";
  duration_days: number;
  plan_is_active: boolean;
  subscription_active: boolean;
  subscription_starts_at: string | null;
  subscription_ends_at: string | null;
  days_remaining: number;
};

export type BillingSubscriptionRecord = {
  id: string;
  user_id: string;
  plan_code: string;
  amount: number;
  currency: "UZS";
  starts_at: string;
  ends_at: string;
  method: "cash" | "bank_transfer" | "click" | "payme" | "other";
  reference: string | null;
  note: string | null;
  created_at: string;
  cancelled_at: string | null;
};

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

export function getBillingSubscriptionStatus() {
  const userId = currentUserId();
  return dedupeInFlight("billing:subscription-status", userId, async () => {
    const response = await authenticatedSupabaseFetch("rpc/get_billing_subscription_status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const rows = await readJson<BillingSubscriptionStatus[]>(response);
    return rows[0] || null;
  });
}

export function listMyBillingSubscriptions(limit = 50) {
  const userId = currentUserId();
  const safeLimit = Math.min(100, Math.max(1, limit));
  return dedupeInFlight("billing:subscriptions", `${userId}:${safeLimit}`, async () => {
    const params = new URLSearchParams({
      select: "id,user_id,plan_code,amount,currency,starts_at,ends_at,method,reference,note,created_at,cancelled_at",
      user_id: `eq.${userId}`,
      order: "created_at.desc,id.desc",
      limit: String(safeLimit),
    });
    const response = await authenticatedSupabaseFetch(`billing_subscriptions?${params}`);
    return readJson<BillingSubscriptionRecord[]>(response);
  });
}
