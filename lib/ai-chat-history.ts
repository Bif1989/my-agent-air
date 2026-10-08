import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import type { AuthSession } from "@/lib/supabase-auth";

export type AiHistoryAction = { label: string; href: string };
export type AiConversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};
export type AiHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: AiHistoryAction[];
  created_at: string;
};

function headers(session: AuthSession) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function listAiConversations(session: AuthSession, limit = 50): Promise<AiConversation[]> {
  const params = new URLSearchParams({
    select: "id,title,created_at,updated_at",
    user_id: `eq.${session.user.id}`,
    order: "updated_at.desc",
    limit: String(limit),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    headers: headers(session),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI chatlar ro‘yxati yuklanmadi.");
  return (await response.json()) as AiConversation[];
}

export async function createAiConversation(session: AuthSession, title = "Yangi chat"): Promise<AiConversation> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_conversations`, {
    method: "POST",
    headers: { ...headers(session), Prefer: "return=representation" },
    body: JSON.stringify({ user_id: session.user.id, title: title.slice(0, 120) || "Yangi chat" }),
  });
  if (!response.ok) throw new Error("Yangi AI chat yaratilmadi.");
  const rows = (await response.json()) as AiConversation[];
  if (!rows[0]) throw new Error("Yangi AI chat yaratilmadi.");
  return rows[0];
}

export async function renameAiConversation(session: AuthSession, conversationId: string, title: string) {
  const params = new URLSearchParams({ id: `eq.${conversationId}`, user_id: `eq.${session.user.id}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    method: "PATCH",
    headers: { ...headers(session), Prefer: "return=minimal" },
    body: JSON.stringify({ title: title.slice(0, 120), updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("AI chat nomi saqlanmadi.");
}

/** Database ownership policies apply; messages cascade with their conversation. */
export async function deleteAiConversations(session: AuthSession, conversationId?: string) {
  if (conversationId !== undefined && !conversationId.trim()) throw new Error("Chat tanlanmagan.");
  const params = new URLSearchParams({ user_id: `eq.${session.user.id}`, select: "id" });
  if (conversationId !== undefined) params.set("id", `eq.${conversationId}`);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    method: "DELETE",
    headers: { ...headers(session), Prefer: "return=representation" },
  });
  if (!response.ok) throw new Error("AI chatni o‘chirib bo‘lmadi.");
  const rows = await response.json() as { id: string }[];
  if (conversationId && !rows.some((row) => row.id === conversationId)) throw new Error("Chat topilmadi yoki o‘chirishga ruxsat yo‘q.");
}

export async function listAiChatHistory(session: AuthSession, conversationId: string, limit = 80): Promise<AiHistoryMessage[]> {
  const params = new URLSearchParams({
    select: "id,role,content,actions,created_at",
    user_id: `eq.${session.user.id}`,
    conversation_id: `eq.${conversationId}`,
    order: "created_at.desc",
    limit: String(limit),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_messages?${params.toString()}`, {
    headers: headers(session),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI tarixi yuklanmadi.");
  const rows = (await response.json()) as AiHistoryMessage[];
  return rows.reverse().map((row) => ({ ...row, actions: Array.isArray(row.actions) ? row.actions : [] }));
}

export async function saveAiChatMessage(
  session: AuthSession,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  actions: AiHistoryAction[] = [],
) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_messages`, {
    method: "POST",
    headers: { ...headers(session), Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: session.user.id,
      conversation_id: conversationId,
      role,
      content: content.slice(0, 8000),
      actions,
    }),
  });
  if (!response.ok) throw new Error("AI tarixi saqlanmadi.");

  const params = new URLSearchParams({ id: `eq.${conversationId}`, user_id: `eq.${session.user.id}` });
  void fetch(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    method: "PATCH",
    headers: { ...headers(session), Prefer: "return=minimal" },
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  }).catch(() => undefined);
}
