import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type AdminSubscriptionPlan = {
  plan_code: string;
  plan_name: string;
  price_amount: number | null;
  currency: "UZS";
  duration_days: number;
  is_active: boolean;
  updated_at: string;
};

export type AdminSubscriptionUser = {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  agent_type: string | null;
  current_ends_at: string | null;
  subscription_count: number;
};

export type AdminSubscriptionRecord = {
  subscription_id: string;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  plan_code: string;
  amount: number;
  currency: "UZS";
  starts_at: string;
  ends_at: string;
  method: "cash" | "bank_transfer" | "click" | "payme" | "other";
  reference: string | null;
  note: string | null;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
};

async function rpc<T>(name: string, body: Record<string, unknown> = {}) {
  const response = await authenticatedSupabaseFetch(`rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

export async function getAdminSubscriptionPlan() {
  const rows = await rpc<AdminSubscriptionPlan[]>("admin_get_billing_subscription_plan");
  return rows[0] || null;
}

export function setAdminSubscriptionPlan(input: { priceAmount: number; durationDays: number; isActive: boolean }) {
  return rpc("admin_set_billing_subscription_plan", {
    p_price_amount: input.priceAmount,
    p_duration_days: input.durationDays,
    p_is_active: input.isActive,
  });
}

export function listAdminSubscriptionUsers() {
  return rpc<AdminSubscriptionUser[]>("admin_list_subscription_users");
}

export function listAdminSubscriptions(userId?: string | null) {
  return rpc<AdminSubscriptionRecord[]>("admin_list_billing_subscriptions", { p_user_id: userId || null });
}

export function activateAdminSubscription(input: {
  userId: string;
  method: "cash" | "bank_transfer" | "click" | "payme" | "other";
  reference?: string;
  note?: string;
}) {
  return rpc("admin_activate_billing_subscription", {
    p_user_id: input.userId,
    p_method: input.method,
    p_reference: input.reference || null,
    p_note: input.note || null,
  });
}
