import { getStoredSession, refreshSession, sessionNeedsRefresh } from "@/lib/supabase-auth";

export type AdminSmsCampaign = {
  id: string;
  created_by: string;
  name: string;
  message: string;
  provider: string;
  status: "draft" | "sending" | "completed" | "cancelled";
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminSmsRecipient = {
  id: string;
  campaign_id: string;
  phone: string;
  status: "pending" | "sent" | "failed" | "skipped";
  provider_message_id: string | null;
  failure_reason: string | null;
  attempts: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignListResponse = { campaigns: AdminSmsCampaign[] };
type CampaignDetailResponse = { campaign: AdminSmsCampaign; recipients: AdminSmsRecipient[] };
type CampaignMutationResponse = {
  campaign: AdminSmsCampaign;
  accepted?: number;
  rejected?: number;
  pending_count?: number;
  batch_processed?: number;
  batch_size?: number;
};

type ApiError = { message?: string; code?: string };

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let session = getStoredSession();
  if (!session) throw new Error("Qayta kiring.");
  if (sessionNeedsRefresh(session)) {
    session = await refreshSession();
    if (!session) throw new Error("Sessiya tugagan. Qayta kiring.");
  }

  const run = (token: string) => fetch(path, {
    ...init,
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });

  let response = await run(session.access_token);
  if (response.status === 401) {
    session = await refreshSession();
    if (!session) throw new Error("Sessiya tugagan. Qayta kiring.");
    response = await run(session.access_token);
  }

  const data = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(data.message || "SMS kampaniyasi amalida xatolik yuz berdi.");
  return data;
}

export function listSmsCampaigns() {
  return apiFetch<CampaignListResponse>("/api/admin/sms-campaigns");
}

export function getSmsCampaign(id: string) {
  return apiFetch<CampaignDetailResponse>(`/api/admin/sms-campaigns?id=${encodeURIComponent(id)}`);
}

export function createSmsCampaign(input: { name: string; message: string; recipients: string[] }) {
  return apiFetch<CampaignMutationResponse>("/api/admin/sms-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", ...input }),
  });
}

export function sendSmsCampaignBatch(campaignId: string) {
  return apiFetch<CampaignMutationResponse>("/api/admin/sms-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "send_batch", campaign_id: campaignId }),
  });
}

export function retryFailedSms(campaignId: string) {
  return apiFetch<CampaignMutationResponse>("/api/admin/sms-campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "retry_failed", campaign_id: campaignId }),
  });
}
