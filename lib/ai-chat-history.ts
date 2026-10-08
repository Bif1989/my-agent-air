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

type PendingAiMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  actions: AiHistoryAction[];
  clientCreatedAt: string;
};

const CONVERSATION_PAGE_SIZE = 100;
const MESSAGE_PAGE_SIZE = 200;
const REQUEST_ATTEMPTS = 3;
const OUTBOX_LIMIT = 100;

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

function stableId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const nibble = char === "x" ? value : ((value & 0x3) | 0x8);
    return nibble.toString(16);
  });
}

function outboxKey(userId: string) {
  return `my-agent-air:ai-history-outbox:${userId}`;
}

function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readOutbox(userId: string): PendingAiMessage[] {
  const storage = browserStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(outboxKey(userId)) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PendingAiMessage => Boolean(
      item && typeof item === "object" && typeof item.id === "string" && typeof item.conversationId === "string" &&
      (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && Array.isArray(item.actions),
    )).map((item) => ({
      ...item,
      clientCreatedAt: typeof item.clientCreatedAt === "string" && item.clientCreatedAt ? item.clientCreatedAt : new Date().toISOString(),
    })).slice(-OUTBOX_LIMIT);
  } catch {
    return [];
  }
}

function writeOutbox(userId: string, rows: PendingAiMessage[]) {
  const storage = browserStorage();
  if (!storage) return false;
  try {
    const key = outboxKey(userId);
    const bounded = rows.slice(-OUTBOX_LIMIT);
    if (bounded.length) storage.setItem(key, JSON.stringify(bounded));
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function queueOutbox(userId: string, row: PendingAiMessage) {
  const current = readOutbox(userId).filter((item) => item.id !== row.id);
  return writeOutbox(userId, [...current, row]);
}

function removeFromOutbox(userId: string, id: string) {
  return writeOutbox(userId, readOutbox(userId).filter((item) => item.id !== id));
}

async function fetchWithRetry(input: RequestInfo | URL, init: RequestInit, attempts = REQUEST_ATTEMPTS) {
  let lastResponse: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      lastResponse = response;
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) await wait(250 * (attempt + 1));
  }
  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error("Tarmoq xatosi.");
}

async function persistMessage(session: AuthSession, row: PendingAiMessage) {
  const body = JSON.stringify({
    id: row.id,
    user_id: session.user.id,
    conversation_id: row.conversationId,
    role: row.role,
    content: row.content.slice(0, 8000),
    actions: row.actions,
    client_created_at: row.clientCreatedAt,
  });
  return fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_messages?on_conflict=id`, {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=ignore-duplicates,return=minimal" },
    body,
    keepalive: body.length < 60_000,
  });
}

export async function flushAiChatOutbox(session: AuthSession) {
  const pending = readOutbox(session.user.id);
  for (const row of pending) {
    try {
      const response = await persistMessage(session, row);
      if (response.ok) {
        removeFromOutbox(session.user.id, row.id);
        continue;
      }
      if (response.status >= 400 && response.status < 500 && ![401, 403, 429].includes(response.status)) {
        removeFromOutbox(session.user.id, row.id);
        continue;
      }
      break;
    } catch {
      break;
    }
  }
}

export async function listAiConversations(session: AuthSession): Promise<AiConversation[]> {
  await flushAiChatOutbox(session).catch(() => undefined);
  const all: AiConversation[] = [];
  for (let offset = 0; ; offset += CONVERSATION_PAGE_SIZE) {
    const params = new URLSearchParams({
      select: "id,title,created_at,updated_at",
      user_id: `eq.${session.user.id}`,
      order: "updated_at.desc,id.desc",
      limit: String(CONVERSATION_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
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
  const id = stableId();
  const safeTitle = title.slice(0, 120) || "Yangi chat";
  const response = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?on_conflict=id`, {
    method: "POST",
    headers: { ...headers(session), Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ id, user_id: session.user.id, title: safeTitle }),
  });
  if (!response.ok) throw new Error("Yangi AI chat yaratilmadi.");
  const rows = (await response.json()) as AiConversation[];
  if (rows[0]) return rows[0];

  const params = new URLSearchParams({ id: `eq.${id}`, user_id: `eq.${session.user.id}`, select: "id,title,created_at,updated_at", limit: "1" });
  const lookup = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    headers: headers(session),
    cache: "no-store",
  });
  if (!lookup.ok) throw new Error("Yangi AI chat yaratilmadi.");
  const existing = (await lookup.json()) as AiConversation[];
  if (!existing[0]) throw new Error("Yangi AI chat yaratilmadi.");
  return existing[0];
}

export async function renameAiConversation(session: AuthSession, conversationId: string, title: string) {
  const params = new URLSearchParams({ id: `eq.${conversationId}`, user_id: `eq.${session.user.id}` });
  const response = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    method: "PATCH",
    headers: { ...headers(session), Prefer: "return=minimal" },
    body: JSON.stringify({ title: title.slice(0, 120), updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("AI chat nomi saqlanmadi.");
}

export async function deleteAiConversations(session: AuthSession, conversationId?: string) {
  if (conversationId !== undefined && !conversationId.trim()) throw new Error("Chat tanlanmagan.");
  const params = new URLSearchParams({ user_id: `eq.${session.user.id}`, select: "id" });
  if (conversationId !== undefined) params.set("id", `eq.${conversationId}`);
  const response = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_conversations?${params.toString()}`, {
    method: "DELETE",
    headers: { ...headers(session), Prefer: "return=representation" },
  });
  if (!response.ok) throw new Error("AI chatni o‘chirib bo‘lmadi.");
  const rows = await response.json() as { id: string }[];
  if (conversationId && !rows.some((row) => row.id === conversationId)) throw new Error("Chat topilmadi yoki o‘chirishga ruxsat yo‘q.");

  if (conversationId) {
    writeOutbox(session.user.id, readOutbox(session.user.id).filter((item) => item.conversationId !== conversationId));
  } else {
    writeOutbox(session.user.id, []);
  }
}

export async function listAiChatHistory(session: AuthSession, conversationId: string): Promise<AiHistoryMessage[]> {
  await flushAiChatOutbox(session).catch(() => undefined);
  const all: AiHistoryMessage[] = [];
  for (let offset = 0; ; offset += MESSAGE_PAGE_SIZE) {
    const params = new URLSearchParams({
      select: "id,role,content,actions,created_at,client_created_at",
      user_id: `eq.${session.user.id}`,
      conversation_id: `eq.${conversationId}`,
      order: "client_created_at.asc,id.asc",
      limit: String(MESSAGE_PAGE_SIZE),
      offset: String(offset),
    });
    const response = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/ai_chat_messages?${params.toString()}`, {
      headers: headers(session),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("AI tarixi yuklanmadi.");
    const rows = (await response.json()) as (AiHistoryMessage & { client_created_at?: string })[];
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
  id = stableId(),
) {
  const row: PendingAiMessage = {
    id,
    conversationId,
    role,
    content: content.slice(0, 8000),
    actions,
    clientCreatedAt: new Date().toISOString(),
  };

  try {
    const response = await persistMessage(session, row);
    if (response.ok) {
      removeFromOutbox(session.user.id, id);
      return id;
    }
    if (response.status < 500 && response.status !== 429) throw new Error("AI tarixi saqlanmadi.");
  } catch {
    // Queue below. The same stable message ID makes later replay idempotent.
  }

  if (queueOutbox(session.user.id, row)) return id;
  throw new Error("AI tarixi saqlanmadi va lokal navbatga ham yozilmadi.");
}
