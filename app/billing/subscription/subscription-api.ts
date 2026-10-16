import { dedupeInFlight } from "@/lib/inflight-dedupe";
import {
  authenticatedSupabaseFetch,
  getStoredSession,
  refreshSession,
  sessionNeedsRefresh,
} from "@/lib/supabase-auth";

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

export type ClickPaymentStart = {
  paymentUrl: string;
  orderRef: string;
  expiresAt: string;
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

async function paymentSession() {
  let session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  if (sessionNeedsRefresh(session)) {
    session = await refreshSession();
    if (!session) throw new Error("AUTH_SESSION_EXPIRED");
  }
  return session;
}

export async function startClickSubscriptionPayment(planCode = "monthly_unlimited") {
  let session = await paymentSession();
  const request = (accessToken: string) => fetch("/api/payments/click/start", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ planCode }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });

  let response = await request(session.access_token);
  if (response.status === 401) {
    session = await refreshSession();
    if (!session) throw new Error("AUTH_SESSION_EXPIRED");
    response = await request(session.access_token);
  }
  const data = await response.json().catch(() => ({})) as Partial<ClickPaymentStart> & { error?: string };
  if (!response.ok || !data.paymentUrl || !data.orderRef) {
    const known: Record<string, string> = {
      CLICK_DISABLED: "CLICK_PAYMENT_DISABLED",
      CLICK_NOT_CONFIGURED: "CLICK_PAYMENT_UNAVAILABLE",
      PLAN_UNAVAILABLE: "CLICK_PLAN_UNAVAILABLE",
      ORDER_CREATE_FAILED: "CLICK_PAYMENT_UNAVAILABLE",
      PAYMENT_TEMPORARILY_UNAVAILABLE: "CLICK_PAYMENT_UNAVAILABLE",
    };
    throw new Error(known[data.error || ""] || "CLICK_PAYMENT_UNAVAILABLE");
  }
  return data as ClickPaymentStart;
}
