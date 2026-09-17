import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";
import type { DealProfile, DealRecord } from "@/app/deals/deals-api";

export type MessageType = "text" | "system" | "ticket" | "pnr" | "file";
const MESSAGE_SELECT = "id,deal_id,sender_id,message,message_type,created_at,read_at,sender:profiles!messages_sender_id_fkey(id,full_name,company_name,is_verified)";

export type MessageRecord = {
  id: string;
  deal_id: string;
  sender_id: string;
  message: string;
  message_type: MessageType;
  created_at: string;
  read_at: string | null;
  sender: Pick<DealProfile, "id" | "full_name" | "company_name" | "is_verified"> | null;
};

export type ConversationSummary = {
  deal_id: string;
  last_message: string | null;
  last_message_type: MessageType | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number | null;
};

export type Conversation = ConversationSummary & { deal: DealRecord };

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

export async function listConversationSummaries() {
  const response = await authenticatedSupabaseFetch("rpc/list_conversation_summaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return readJson<ConversationSummary[]>(response);
}

export async function listConversations(deals: DealRecord[]) {
  const summaries = await listConversationSummaries();
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]));
  return summaries
    .map((summary) => ({ ...summary, deal: dealsById.get(summary.deal_id) }))
    .filter((conversation): conversation is Conversation => Boolean(conversation.deal))
    .sort((left, right) => new Date(right.last_message_at || right.deal.updated_at).getTime() - new Date(left.last_message_at || left.deal.updated_at).getTime());
}

export async function listMessages(dealId: string) {
  const response = await authenticatedSupabaseFetch(`messages?select=${encode(MESSAGE_SELECT)}&deal_id=eq.${encode(dealId)}&order=created_at.asc`);
  return readJson<MessageRecord[]>(response);
}

export async function sendMessage(dealId: string, message: string) {
  const text = message.trim();
  if (!text || text.length > 4000) throw new Error("MESSAGE_INVALID");
  const response = await authenticatedSupabaseFetch("messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ deal_id: dealId, sender_id: currentUserId(), message: text, message_type: "text" }),
  });
  const rows = await readJson<MessageRecord[]>(response);
  return rows[0];
}

export async function markDealMessagesRead(dealId: string) {
  await authenticatedSupabaseFetch("rpc/mark_deal_messages_read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_deal_id: dealId }),
  });
}