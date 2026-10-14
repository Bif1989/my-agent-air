import { getStoredSession } from "@/lib/supabase-auth";

export type ClickPaymentOrder = {
  ok: true;
  provider: "click";
  order_ref: string;
  amount: number;
  currency: string;
  expires_at: string;
  payment_url: string;
};

export async function createClickSubscriptionPayment(): Promise<ClickPaymentOrder> {
  const session = getStoredSession();
  if (!session?.access_token) throw new Error("AUTH_SESSION_MISSING");

  const response = await fetch("/api/payments/click/order", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.payment_url) {
    throw new Error(typeof data?.message === "string" ? data.message : "CLICK_PAYMENT_FAILED");
  }
  return data as ClickPaymentOrder;
}

export async function redirectToClickSubscriptionPayment() {
  const order = await createClickSubscriptionPayment();
  window.location.assign(order.payment_url);
}
