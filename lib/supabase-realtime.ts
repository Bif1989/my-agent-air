import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_SESSION_CHANGED_EVENT, SESSION_STORAGE_KEY, getStoredSession, refreshSession, sessionNeedsRefresh } from "@/lib/supabase-auth";
import { SUPABASE_URL, SUPABASE_KEY } from "@/lib/supabase-config";

let realtimeClient: SupabaseClient | null = null;
let token = "";
let userId = "";
let listening = false;
let channelSequence = 0;
export type RealtimeMessagePayload = { new: Record<string, unknown>; old: Record<string, unknown> };
type Listener = (payload: RealtimeMessagePayload) => void;
const shared = new Map<string, { channel: RealtimeChannel; listeners: Set<Listener> }>();

function syncSession() {
  const session = getStoredSession();
  if (!session || (userId && userId !== session.user.id)) {
    shared.clear();
    void realtimeClient?.removeAllChannels();
    token = "";
  }
  userId = session?.user.id || "";
  if (session && realtimeClient && token !== session.access_token) {
    token = session.access_token;
    void realtimeClient.realtime.setAuth(token).catch(() => { token = ""; });
  }
}

function listenForSessionChanges() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
  window.addEventListener("storage", (event) => { if (event.key === SESSION_STORAGE_KEY || event.key === null) syncSession(); });
  const refreshIfNeeded = () => {
    const session = getStoredSession();
    if (session && sessionNeedsRefresh(session)) void refreshSession().then(syncSession).catch(() => undefined);
    else syncSession();
  };
  window.setInterval(refreshIfNeeded, 30_000);
  window.addEventListener("online", refreshIfNeeded);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshIfNeeded(); });
}

export function getSupabaseRealtimeClient() {
  if (typeof window === "undefined" || !getStoredSession()) return null;
  if (!realtimeClient) realtimeClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  listenForSessionChanges();
  syncSession();
  return realtimeClient;
}

function subscribe(table: "messages" | "chat_messages", onChange: Listener, filter?: string) {
  const client = getSupabaseRealtimeClient();
  if (!client) return null;
  const key = `${userId}:${table}:${filter || "all"}`;
  let entry = shared.get(key);
  if (!entry) {
    const listeners = new Set<Listener>();
    const channel = client.channel(`my-agent-air:${++channelSequence}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table, ...(filter ? { filter } : {}) }, (payload) => {
        for (const listener of listeners) listener(payload as RealtimeMessagePayload);
      });
    if (table === "messages") channel.on("postgres_changes", { event: "UPDATE", schema: "public", table, ...(filter ? { filter } : {}) }, (payload) => {
      for (const listener of listeners) listener(payload as RealtimeMessagePayload);
    });
    entry = { channel: channel.subscribe(), listeners };
    shared.set(key, entry);
  }
  entry.listeners.add(onChange);
  const subscription = entry;
  return {
    channel: subscription.channel,
    client: { removeChannel: (_channel: RealtimeChannel) => {
      if (_channel !== subscription.channel) return Promise.resolve("ok" as const);
      subscription.listeners.delete(onChange);
      if (subscription.listeners.size) return Promise.resolve("ok" as const);
      if (shared.get(key) === subscription) shared.delete(key);
      return client.removeChannel(subscription.channel);
    } },
  };
}

export function subscribeToDealMessages(dealId: string, onChange: Listener) {
  return subscribe("messages", onChange, `deal_id=eq.${dealId}`);
}
export function subscribeToMessages(onChange: Listener) {
  return subscribe("messages", onChange);
}
export function subscribeToMessengerRoom(roomId: string, onChange: Listener) {
  return subscribe("chat_messages", onChange, `room_id=eq.${roomId}`);
}
export function subscribeToMessengerMessages(onChange: Listener) {
  return subscribe("chat_messages", onChange);
}
