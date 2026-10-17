import { authenticatedSupabaseFetch } from "@/lib/supabase-auth";

export type SupportContact = {
  ok: boolean;
  reason?: string;
  admin_id?: string;
  full_name?: string | null;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type AdminSupportThread = {
  user_id: string;
  room_id: string;
  status: "open" | "closed";
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  agent_type: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number;
};

async function readJson<T>(response: Response) {
  if (!response.ok) throw new Error(`SUPABASE_${response.status}`);
  return response.json() as Promise<T>;
}

export async function getSupportContact() {
  const response = await authenticatedSupabaseFetch("rpc/get_support_contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return readJson<SupportContact>(response);
}

export async function getOrCreateSupportChat() {
  const response = await authenticatedSupabaseFetch("rpc/get_or_create_support_chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return readJson<string>(response);
}

export async function listAdminSupportThreads() {
  const response = await authenticatedSupabaseFetch("rpc/admin_list_support_threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  return readJson<AdminSupportThread[]>(response);
}

export async function setAdminSupportThreadStatus(userId: string, status: "open" | "closed") {
  const response = await authenticatedSupabaseFetch("rpc/admin_set_support_thread_status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_status: status }),
  });
  return readJson<{ ok: boolean; status?: "open" | "closed"; room_id?: string; reason?: string }>(response);
}
