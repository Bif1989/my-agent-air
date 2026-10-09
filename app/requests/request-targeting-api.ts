import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type RequestTargetStatus = "matched" | "notified" | "viewed" | "responded" | "declined";

export type RequestTargetRecord = {
  request_id: string;
  profile_id: string;
  capability_id: string | null;
  match_score: number;
  distance_km: number | null;
  match_reason: {
    capability_type?: string;
    onboarding_status?: string;
    verified?: boolean;
    capacity?: number | null;
    pax?: number;
    destination?: string | null;
    city?: string | null;
  };
  status: RequestTargetStatus;
  created_at: string;
  updated_at: string;
};

const SELECT_FIELDS = "request_id,profile_id,capability_id,match_score,distance_km,match_reason,status,created_at,updated_at";

export async function listRequestTargets(requestId: string) {
  const params = new URLSearchParams({
    select: SELECT_FIELDS,
    request_id: `eq.${requestId}`,
    order: "match_score.desc,profile_id.asc",
  });
  const response = await authenticatedSupabaseFetch(`request_targets?${params}`);
  return response.json() as Promise<RequestTargetRecord[]>;
}

export async function markOwnRequestTargetViewed(requestId: string) {
  const response = await authenticatedSupabaseFetch("rpc/mark_request_target_viewed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
  });
  return response.json() as Promise<boolean>;
}

export async function declineOwnRequestTarget(requestId: string) {
  const response = await authenticatedSupabaseFetch("rpc/decline_request_target", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_request_id: requestId }),
  });
  return response.json() as Promise<boolean>;
}

export async function getOwnRequestTarget(requestId: string) {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  const params = new URLSearchParams({
    select: SELECT_FIELDS,
    request_id: `eq.${requestId}`,
    profile_id: `eq.${session.user.id}`,
    limit: "1",
  });
  const response = await authenticatedSupabaseFetch(`request_targets?${params}`);
  const rows = await response.json() as RequestTargetRecord[];
  return rows[0] || null;
}
