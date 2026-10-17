import { dedupeInFlight } from "@/lib/inflight-dedupe";
import { authenticatedSupabaseFetch, getStoredSession, refreshSession, sessionNeedsRefresh } from "@/lib/supabase-auth";
import { billingRoleOption, normalizeBillingRole, rolesFromServiceText, type BillingRole, type BillingRoleOption } from "@/lib/billing-roles";

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

export type BillingWalletStatus = {
  wallet_mode_enabled: boolean;
  balance: number;
  currency: "UZS";
  low_balance_warning: number;
  topup_min: number;
  topup_max: number;
  free_limit: number;
  completed_count: number;
  free_remaining: number;
  subscription_active: boolean;
};

export type WalletLedgerKind = "click_topup" | "deal_charge" | "refund" | "admin_credit" | "admin_debit";
export type BillingWalletLedgerRecord = {
  id: string;
  user_id: string;
  kind: WalletLedgerKind;
  amount_delta: number;
  balance_after: number;
  currency: "UZS";
  payment_order_id: string | null;
  deal_fee_id: string | null;
  note: string | null;
  created_at: string;
};

export type DealFeeStatus = "free" | "pending" | "paid" | "waived";
export type DealFeeBillingSource = "free_quota" | "per_deal" | "subscription" | "wallet";

export type DealFeeRecord = {
  id: string;
  deal_id: string;
  user_id: string;
  role_snapshot: string;
  fee_amount: number;
  currency: "UZS";
  monthly_sequence: number;
  lifetime_sequence: number;
  status: DealFeeStatus;
  billing_source: DealFeeBillingSource;
  period_start: string;
  deal_completed_at: string;
  created_at: string;
  paid_at: string | null;
  deal: {
    id: string;
    request_id: string;
    request: { id: string; category: string; origin: string | null; destination: string | null; travel_date: string | null } | null;
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
  items: Array<{ id: string; fee_id: string; amount: number }> | null;
};

type ProfileBillingFields = { agent_type: string | null; services: string[] | null };
type CapabilityBillingFields = { capability_type: string };
type ClickStartResponse = { paymentUrl?: string; orderRef?: string; expiresAt?: string; purpose?: string; amount?: number; error?: string; minAmount?: number; maxAmount?: number };

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

async function freshSession() {
  let session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  if (sessionNeedsRefresh(session)) session = await refreshSession();
  if (!session) throw new Error("AUTH_SESSION_EXPIRED");
  return session;
}

export async function startClickWalletTopup(amount: number) {
  const session = await freshSession();
  const response = await fetch("/api/payments/click/start", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ purpose: "wallet_topup", amount }),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({})) as ClickStartResponse;
  if (!response.ok || !data.paymentUrl) {
    if (data.error === "INVALID_TOPUP_AMOUNT") throw new Error(`TOPUP_RANGE:${data.minAmount || 0}:${data.maxAmount || 0}`);
    if (data.error === "WALLET_MODE_DISABLED") throw new Error("WALLET_MODE_DISABLED");
    if (data.error === "CLICK_DISABLED" || data.error === "CLICK_NOT_CONFIGURED") throw new Error("CLICK_UNAVAILABLE");
    if (response.status === 401) throw new Error("AUTH_SESSION_EXPIRED");
    throw new Error("TOPUP_START_FAILED");
  }
  return data as Required<Pick<ClickStartResponse, "paymentUrl">> & ClickStartResponse;
}

export function getBillingSummary() {
  const userId = currentUserId();
  return dedupeInFlight("billing:summary", userId, async () => {
    const response = await authenticatedSupabaseFetch("rpc/get_billing_summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const rows = await readJson<BillingSummary[]>(response);
    return rows[0] || null;
  });
}

export function getBillingWalletStatus() {
  const userId = currentUserId();
  return dedupeInFlight("billing:wallet-status", userId, async () => {
    const response = await authenticatedSupabaseFetch("rpc/get_billing_wallet_status", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const rows = await readJson<BillingWalletStatus[]>(response);
    return rows[0] || null;
  });
}

export function listMyWalletLedger(limit = 50) {
  const userId = currentUserId();
  const safeLimit = Math.min(100, Math.max(1, limit));
  return dedupeInFlight("billing:wallet-ledger", `${userId}:${safeLimit}`, async () => {
    const params = new URLSearchParams({ select: "id,user_id,kind,amount_delta,balance_after,currency,payment_order_id,deal_fee_id,note,created_at", user_id: `eq.${userId}`, order: "created_at.desc,id.desc", limit: String(safeLimit) });
    const response = await authenticatedSupabaseFetch(`billing_wallet_ledger?${params}`);
    return readJson<BillingWalletLedgerRecord[]>(response);
  });
}

export function getMyBillingRoles() {
  const userId = currentUserId();
  return dedupeInFlight("billing:roles", userId, async () => {
    const [profileResponse, capabilityResponse] = await Promise.all([
      authenticatedSupabaseFetch(`profiles?select=agent_type,services&id=eq.${encodeURIComponent(userId)}&limit=1`),
      authenticatedSupabaseFetch(`supplier_capabilities?select=capability_type&profile_id=eq.${encodeURIComponent(userId)}&is_active=eq.true`),
    ]);
    const profiles = await readJson<ProfileBillingFields[]>(profileResponse);
    const capabilities = await readJson<CapabilityBillingFields[]>(capabilityResponse);
    const primary = normalizeBillingRole(profiles[0]?.agent_type);
    const roles = new Set<BillingRole>([primary]);
    for (const capability of capabilities) roles.add(normalizeBillingRole(capability.capability_type));
    for (const service of profiles[0]?.services || []) for (const role of rolesFromServiceText(service)) roles.add(role);
    return [...roles].map((role): BillingRoleOption => billingRoleOption(role, role === primary)).sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || a.uz.localeCompare(b.uz));
  });
}

export function listMyDealFees(limit = 50) {
  const userId = currentUserId();
  const safeLimit = Math.min(100, Math.max(1, limit));
  return dedupeInFlight("billing:fees", `${userId}:${safeLimit}`, async () => {
    const select = "id,deal_id,user_id,role_snapshot,fee_amount,currency,monthly_sequence,lifetime_sequence,status,billing_source,period_start,deal_completed_at,created_at,paid_at,deal:deals!deal_fees_deal_id_fkey(id,request_id,request:requests!deals_request_id_fkey(id,category,origin,destination,travel_date))";
    const params = new URLSearchParams({ select, user_id: `eq.${userId}`, order: "deal_completed_at.desc,id.desc", limit: String(safeLimit) });
    const response = await authenticatedSupabaseFetch(`deal_fees?${params}`);
    return readJson<DealFeeRecord[]>(response);
  });
}

export function listMyBillingSettlements(limit = 50) {
  const userId = currentUserId();
  const safeLimit = Math.min(100, Math.max(1, limit));
  return dedupeInFlight("billing:settlements", `${userId}:${safeLimit}`, async () => {
    const select = "id,user_id,kind,amount,currency,method,reference,note,recorded_by,created_at,items:billing_settlement_items(id,fee_id,amount)";
    const params = new URLSearchParams({ select, user_id: `eq.${userId}`, order: "created_at.desc,id.desc", limit: String(safeLimit) });
    const response = await authenticatedSupabaseFetch(`billing_settlements?${params}`);
    return readJson<BillingSettlementRecord[]>(response);
  });
}
