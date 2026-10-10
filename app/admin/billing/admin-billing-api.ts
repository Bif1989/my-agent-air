import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type AdminBillingAccount = {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  agent_type: string | null;
  pending_count: number;
  outstanding_amount: number;
  paid_count: number;
  paid_amount: number;
  waived_count: number;
  waived_amount: number;
  free_count: number;
  latest_fee_at: string | null;
};

export type AdminBillingFee = {
  fee_id: string;
  deal_id: string;
  role_snapshot: string;
  fee_amount: number;
  currency: string;
  monthly_sequence: number;
  fee_status: "free" | "pending" | "paid" | "waived";
  period_start: string;
  deal_completed_at: string;
  category: string | null;
  origin: string | null;
  destination: string | null;
  travel_date: string | null;
};

export type AdminBillingSettlement = {
  settlement_id: string;
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  kind: "payment" | "waiver";
  amount: number;
  currency: string;
  method: "cash" | "bank_transfer" | "click" | "payme" | "other" | "waiver";
  reference: string | null;
  note: string | null;
  recorded_by: string;
  recorded_by_name: string;
  created_at: string;
  fee_count: number;
};

async function rpc<T>(name: string, body: Record<string, unknown> = {}) {
  const response = await authenticatedSupabaseFetch(`rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

export function listAdminBillingAccounts() {
  return rpc<AdminBillingAccount[]>("admin_list_billing_accounts");
}

export function listAdminBillingFees(userId: string) {
  return rpc<AdminBillingFee[]>("admin_list_billing_fees", { p_user_id: userId });
}

export function listAdminBillingSettlements(userId?: string | null) {
  return rpc<AdminBillingSettlement[]>("admin_list_billing_settlements", { p_user_id: userId || null });
}

export function recordAdminBillingSettlement(input: {
  userId: string;
  feeIds: string[];
  kind: "payment" | "waiver";
  method?: "cash" | "bank_transfer" | "click" | "payme" | "other";
  reference?: string;
  note?: string;
}) {
  return rpc("admin_record_billing_settlement", {
    p_user_id: input.userId,
    p_fee_ids: input.feeIds,
    p_kind: input.kind,
    p_method: input.method || "bank_transfer",
    p_reference: input.reference || null,
    p_note: input.note || null,
  });
}
