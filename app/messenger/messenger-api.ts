import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type MessengerRoomType = "public" | "direct" | "group";
export type MessengerMessageType = "text" | "system" | "file";

export type MessengerConversation = {
  room_id: string;
  room_type: MessengerRoomType;
  title: string | null;
  slug: string | null;
  counterpart_id: string | null;
  counterpart_full_name: string | null;
  counterpart_company_name: string | null;
  counterpart_city: string | null;
  counterpart_is_verified: boolean | null;
  last_message: string | null;
  last_message_type: MessengerMessageType | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number | null;
};

export type MessengerRoom = {
  id: string;
  room_type: MessengerRoomType;
  title: string | null;
  slug: string | null;
  counterpart_id?: string | null;
  counterpart_full_name?: string | null;
  counterpart_company_name?: string | null;
  counterpart_city?: string | null;
  counterpart_is_verified?: boolean | null;
};

export type MessengerSender = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type MessengerMessage = {
  id: string;
  room_id: string;
  sender_id: string;
  message: string;
  message_type: MessengerMessageType;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  sender: MessengerSender | null;
};

const MESSAGE_SELECT = "id,room_id,sender_id,message,message_type,reply_to_id,created_at,edited_at,deleted_at,sender:profiles!chat_messages_sender_id_fkey(id,full_name,company_name,avatar_url,is_verified)";

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

export async function listMessengerConversations() {
  const response = await authenticatedSupabaseFetch("rpc/list_messenger_conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return readJson<MessengerConversation[]>(response);
}

export async function getPublicMessengerRoom() {
  const response = await authenticatedSupabaseFetch("chat_rooms?select=id,room_type,title,slug&room_type=eq.public&slug=eq.umumiy&is_active=eq.true&limit=1");
  const rows = await readJson<MessengerRoom[]>(response);
  return rows[0] || null;
}

export async function getAccessibleMessengerRoom(roomId: string, conversations?: MessengerConversation[]) {
  const publicRoom = await getPublicMessengerRoom();
  if (publicRoom?.id === roomId) return publicRoom;
  const rooms = conversations || await listMessengerConversations();
  return rooms.find((room) => room.room_id === roomId) ? {
    ...rooms.find((room) => room.room_id === roomId),
    id: roomId,
  } as MessengerRoom : null;
}

export async function getOrCreateDirectChat(otherUserId: string) {
  if (otherUserId === currentUserId()) throw new Error("SELF_CHAT_NOT_ALLOWED");
  const response = await authenticatedSupabaseFetch("rpc/get_or_create_direct_chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_other_user_id: otherUserId }),
  });
  const roomId = await readJson<string | { room_id?: string }>(response);
  return typeof roomId === "string" ? roomId : roomId.room_id || "";
}

export async function listMessengerMessages(roomId: string) {
  const response = await authenticatedSupabaseFetch(`chat_messages?select=${encode(MESSAGE_SELECT)}&room_id=eq.${encode(roomId)}&deleted_at=is.null&order=created_at.desc&limit=100`);
  const rows = await readJson<MessengerMessage[]>(response);
  return rows.reverse();
}

export async function sendMessengerMessage(roomId: string, message: string) {
  const text = message.trim();
  if (!text || text.length > 4000) throw new Error("MESSAGE_INVALID");
  const response = await authenticatedSupabaseFetch("chat_messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ room_id: roomId, sender_id: currentUserId(), message: text, message_type: "text" }),
  });
  const rows = await readJson<MessengerMessage[]>(response);
  return rows[0] || null;
}

export async function markMessengerRoomRead(roomId: string) {
  await authenticatedSupabaseFetch("rpc/mark_chat_room_read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId }),
  });
}
