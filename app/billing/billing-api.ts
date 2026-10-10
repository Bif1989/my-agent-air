import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type BillingSummary = {
  agent_type: string;
  period_start: string;
  free_limit: number;
  completed_count: number;
  free_used: number;
  free_remaining: number;
  chargeable_count: number;
  outstanding_amount: number;
  paid_amount: number;
  currency: "UZS";
  role_fee_amount: number;
  next_fee_amount: number;
};

export type DealFeeStatus = "free" | "pending" | "paid" | "waived";
export type DealFeeBillingSource = "free_quota" | "per_deal" | "subscription";

export type DealFeeRecord = {
  id: string;
  deal_id: string;
  user_id: string;
  role_snapshot: string;
  fee_amount: number;
  currency: "UZS";
  monthly_sequence: number;
  status: DealFeeStatus;
  billing_source: DealFeeBillingSource;
  period_start: string;
  deal_completed_at: string;
  created_at: string;
  paid_at: string | null;
  deal: {
    id: string;
    request_id: string;
    request: {
      id: string;
      category: string;
      origin: string | null;
      destination: string | null;
      travel_date: string | null;
    } | null;
  } | null;
};

export type BillingSettlementRecord = {
  id: string;
  user_id: string;
  kind: "payment" | "waiver";
  amount: number;
  currency: "UZS";
  method: "cash" | "bank_transfer" | "click" | "payme" | "other" | "waiver";
  reference: string | null;
  note: string | null;
  recorded_by: string;
  created_at: string;
  items: Array<{
    id: string;
    fee_id: string;
    amount: number;
  }> | null;
};

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

export function getBillingSummary() {
  const userId = currentUserId();
  return dedupeInFlight("billing:summary", userId, async () => {
    const response = await authenticatedSupabaseFetch("rpc/get_billing_summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const rows = await readJson<BillingSummary[]>(response);
    return rows[0] || null;
  });
}

export function listMyDealFees(limit = 50) {
  const userId = currentUserId();
  const safeLimit = Math.min(100, Math.max(1, limit));
  return dedupeInFlight("billing:fees", `${userId}:${safeLimit}`, async () => {
    const select = "id,deal_id,user_id,role_snapshot,fee_amount,currency,monthly_sequence,status,billing_source,period_start,deal_completed_at,created_at,paid_at,deal:deals!deal_fees_deal_id_fkey(id,request_id,request:requests!deals_request_id_fkey(id,category,origin,destination,travel_date))";
    const params = new URLSearchParams({
      select,
      user_id: `eq.${userId}`,
      order: "deal_completed_at.desc,id.desc",
      limit: String(safeLimit),
    });
    const response = await authenticatedSupabaseFetch(`deal_fees?${params}`);
    return readJson<DealFeeRecord[]>(response);
  });
}

export function listMyBillingSettlements(limit = 50) {
  const userId = currentUserId();
  const safeLimit = Math.min(100, Math.max(1, limit));
  return dedupeInFlight("billing:settlements", `${userId}:${safeLimit}`, async () => {
    const select = "id,user_id,kind,amount,currency,method,reference,note,recorded_by,created_at,items:billing_settlement_items(id,fee_id,amount)";
    const params = new URLSearchParams({
      select,
      user_id: `eq.${userId}`,
      order: "created_at.desc,id.desc",
      limit: String(safeLimit),
    });
    const response = await authenticatedSupabaseFetch(`billing_settlements?${params}`);
    return readJson<BillingSettlementRecord[]>(response);
  });
}
