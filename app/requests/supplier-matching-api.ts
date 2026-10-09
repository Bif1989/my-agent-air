import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type SupplierType = "hotel" | "guide" | "transport" | "restaurant";

export type SupplierMatch = {
  id: string;
  name: string;
  supplier_type: SupplierType;
  region: string | null;
  city: string | null;
  district: string | null;
  status: "registry" | "public_contact" | "contact_verified" | "verified" | "inactive" | string;
  contact_verified: boolean;
  source_type: string;
  source_name: string | null;
  star_rating: number | null;
  capacity: number | null;
  services: string[];
  has_phone: boolean;
  has_email: boolean;
  match_score: number;
};

export type SupplierInviteDraft = {
  invite_id: string;
  token: string;
  supplier_name: string;
  channel: "sms" | "telegram" | "email" | "whatsapp" | "manual";
  recipient_hint: string;
  status: "queued";
  expires_at: string;
};

export type SupplierInviteResponse = {
  available?: boolean;
  price?: number | null;
  currency?: string;
  comment?: string | null;
  submitted_at?: string;
};

export type SupplierInviteRow = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  channel: string;
  status: string;
  recipient_hint: string;
  created_at: string;
  expires_at: string;
  opened_at: string | null;
  responded_at: string | null;
  response: SupplierInviteResponse;
};

export type SupplierDeliveryResult = {
  sent: boolean;
  configured: boolean;
  status: string;
  channel: string;
  code?: string;
  message?: string;
};

async function rpc<T>(name: string, body: Record<string, unknown>) {
  const response = await authenticatedSupabaseFetch(`rpc/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = typeof data.message === "string" ? data.message : "SUPPLIER_RPC_FAILED";
    throw new Error(message);
  }
  return data as T;
}

export function matchSuppliersForRequest(requestId: string, supplierType?: SupplierType, limit = 20) {
  return rpc<SupplierMatch[]>("match_suppliers_for_request", {
    p_request_id: requestId,
    p_supplier_type: supplierType || null,
    p_limit: limit,
  });
}

export function createSupplierInvite(requestId: string, supplierId: string, channel: "auto" | SupplierInviteDraft["channel"] = "auto") {
  return rpc<SupplierInviteDraft>("create_supplier_invite", {
    p_request_id: requestId,
    p_supplier_id: supplierId,
    p_channel: channel,
  });
}

export function listSupplierInvites(requestId: string) {
  return rpc<SupplierInviteRow[]>("list_request_supplier_invites", { p_request_id: requestId });
}

export async function deliverSupplierInviteEmail(inviteId: string, token: string) {
  const session = getStoredSession();
  if (!session?.access_token) throw new Error("AUTH_SESSION_MISSING");

  const response = await fetch("/api/supplier-outreach/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invite_id: inviteId, token }),
    cache: "no-store",
    referrerPolicy: "no-referrer",
  });

  const data = await response.json().catch(() => ({})) as SupplierDeliveryResult;
  if (!response.ok) {
    const error = new Error(data.code || "SUPPLIER_DELIVERY_FAILED");
    Object.assign(error, { delivery: data });
    throw error;
  }
  return data;
}
