import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export type PublicSupplierInvite = {
  invite_id: string;
  supplier_name: string;
  request_category: string;
  destination: string | null;
  travel_date: string | null;
  adults: number;
  children: number;
  infants: number;
  budget: number | null;
  currency: string;
  description: string | null;
  service_details: Record<string, string>;
  requester_company: string | null;
  expires_at: string;
  status: "opened" | "responded";
};

async function publicRpc<T>(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string };
    const reason = data.message || "";
    if (reason.includes("invite_expired")) throw new Error("Bu so‘rov havolasining muddati tugagan.");
    if (reason.includes("invite_not_found") || reason.includes("invalid_token")) throw new Error("So‘rov havolasi noto‘g‘ri yoki topilmadi.");
    throw new Error("So‘rovni ochib bo‘lmadi. Keyinroq qayta urinib ko‘ring.");
  }
  return response.json() as Promise<T>;
}

export function getPublicSupplierInvite(token: string) {
  return publicRpc<PublicSupplierInvite>("get_supplier_invite_public", { p_token: token });
}

export function submitPublicSupplierResponse(token: string, payload: { available: boolean; price?: number | null; currency: string; comment?: string | null }) {
  return publicRpc<{ ok: boolean; invite_id: string }>("submit_supplier_invite_response", {
    p_token: token,
    p_available: payload.available,
    p_price: payload.available ? payload.price ?? null : null,
    p_currency: payload.currency,
    p_comment: payload.comment || null,
  });
}

export function optOutPublicSupplier(token: string) {
  return publicRpc<{ ok: boolean }>("opt_out_supplier_invite", { p_token: token });
}
