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

const CONVERSATION_PAGE_SIZE = 100;
const MESSAGE_PAGE_SIZE = 200;
const SAVE_ATTEMPTS = 3;

function headers(session: AuthSession) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export async function listAiConversations(session: AuthSession): Promise<AiConversation[]> {
  const all: AiConversation[] = [];
  for (let offset = 0; ; offset += CONVERSATION_PAGE_SIZE) {
    const params = new URLSearchParams({
      select: "id,title,created_at,updated_at",
      user_id: `eq.${session.user.id}`,
      order: "updated_at.desc,id.desc",
      limit: String(CONVERSATION_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
      headers: headers(session),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("AI chatlar ro‘yxati yuklanmadi.");
    const rows = (await response.json()) as AiConversation[];
    all.push(...rows);
    if (rows.length < CONVERSATION_PAGE_SIZE) return all;
  }
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

export async function listAiChatHistory(session: AuthSession, conversationId: string): Promise<AiHistoryMessage[]> {
  const all: AiHistoryMessage[] = [];
  for (let offset = 0; ; offset += MESSAGE_PAGE_SIZE) {
    const params = new URLSearchParams({
      select: "id,role,content,actions,created_at",
      user_id: `eq.${session.user.id}`,
      conversation_id: `eq.${conversationId}`,
      order: "created_at.asc,id.asc",
      limit: String(MESSAGE_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_messages?${params.toString()}`, {
      headers: headers(session),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("AI tarixi yuklanmadi.");
    const rows = (await response.json()) as AiHistoryMessage[];
    all.push(...rows.map((row) => ({ ...row, actions: Array.isArray(row.actions) ? row.actions : [] })));
    if (rows.length < MESSAGE_PAGE_SIZE) return all;
  }
}

export async function saveAiChatMessage(
  session: AuthSession,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  actions: AiHistoryAction[] = [],
  id = messageId(),
) {
  const body = JSON.stringify({
    id,
    user_id: session.user.id,
    conversation_id: conversationId,
    role,
    content: content.slice(0, 8000),
    actions,
  });
  const url = `${SUPABASE_URL}/rest/v1/ai_chat_messages?on_conflict=id`;

  for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { ...headers(session), Prefer: "resolution=ignore-duplicates,return=minimal" },
        body,
        keepalive: body.length < 60_000,
      });
      if (response.ok) return id;
      if (response.status < 500 && response.status !== 429) throw new Error("AI tarixi saqlanmadi.");
    } catch (error) {
      if (attempt === SAVE_ATTEMPTS - 1) throw error;
    }
    await wait(250 * (attempt + 1));
  }
  throw new Error("AI tarixi saqlanmadi.");
}
