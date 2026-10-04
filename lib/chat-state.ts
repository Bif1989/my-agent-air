export const ACTIVE_MESSENGER_ROOM_EVENT = "my-agent-air:active-room";
export const CHAT_READ_EVENT = "my-agent-air:chat-read";

export function mergeMessages<T extends { id: string; created_at: string }>(current: T[], incoming: T[]): T[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) messages.set(message.id, message);
  return [...messages.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
