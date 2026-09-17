import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type MessengerRoomType = "public" | "direct" | "group";
export type MessengerMessageType = "text" | "system" | "file";

export type GroupRole = "owner" | "admin" | "member";

export type MessengerConversation = {
  room_id: string;
  room_type: MessengerRoomType;
  title: string | null;
  description?: string | null;
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
  description?: string | null;
  slug: string | null;
  counterpart_id?: string | null;
  counterpart_full_name?: string | null;
  counterpart_company_name?: string | null;
  counterpart_city?: string | null;
  counterpart_is_verified?: boolean | null;
};

export type GroupMember = {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  city: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  member_role: GroupRole;
  joined_at: string | null;
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
  const matched = rooms.find((room) => room.room_id === roomId);
  if (!matched) return null;
  return {
    id: matched.room_id,
    room_type: matched.room_type,
    title: matched.title,
    description: matched.description || null,
    slug: matched.slug,
    counterpart_id: matched.counterpart_id,
    counterpart_full_name: matched.counterpart_full_name,
    counterpart_company_name: matched.counterpart_company_name,
    counterpart_city: matched.counterpart_city,
    counterpart_is_verified: matched.counterpart_is_verified,
  } as MessengerRoom;
}

export async function createGroupChat(title: string, description: string, memberIds: string[]) {
  const response = await authenticatedSupabaseFetch("rpc/create_group_chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_title: title, p_description: description, p_member_ids: memberIds }),
  });
  const roomId = await readJson<string | { room_id?: string }>(response);
  return typeof roomId === "string" ? roomId : roomId.room_id || "";
}

export async function listGroupMembers(roomId: string) {
  const response = await authenticatedSupabaseFetch("rpc/list_group_members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId }),
  });
  return readJson<GroupMember[]>(response);
}

export async function addGroupMembers(roomId: string, userIds: string[]) {
  const response = await authenticatedSupabaseFetch("rpc/add_group_members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId, p_user_ids: userIds }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function removeGroupMember(roomId: string, userId: string) {
  const response = await authenticatedSupabaseFetch("rpc/remove_group_member", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId, p_user_id: userId }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function setGroupMemberRole(roomId: string, userId: string, role: GroupRole) {
  const response = await authenticatedSupabaseFetch("rpc/set_group_member_role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId, p_user_id: userId, p_role: role }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function transferGroupOwnership(roomId: string, newOwnerId: string) {
  const response = await authenticatedSupabaseFetch("rpc/transfer_group_ownership", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId, p_new_owner_id: newOwnerId }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function leaveGroupChat(roomId: string) {
  const response = await authenticatedSupabaseFetch("rpc/leave_group_chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function updateGroupChat(roomId: string, title: string, description: string) {
  const response = await authenticatedSupabaseFetch("rpc/update_group_chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId, p_title: title, p_description: description }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function closeGroupChat(roomId: string) {
  const response = await authenticatedSupabaseFetch("rpc/close_group_chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_room_id: roomId }),
  });
  return readJson<{ success?: boolean } | null>(response);
}

export async function getMessengerRoomDetails(roomId: string) {
  const response = await authenticatedSupabaseFetch(`chat_rooms?select=id,room_type,title,description,slug,created_by,is_active,created_at,updated_at&id=eq.${encode(roomId)}&limit=1`);
  const rows = await readJson<MessengerRoom[]>(response);
  return rows[0] || null;
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
