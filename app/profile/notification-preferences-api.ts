import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type NotificationPreferences = {
  chat_messages: boolean;
  deal_messages: boolean;
  offers: boolean;
  new_requests: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  chat_messages: true,
  deal_messages: true,
  offers: true,
  new_requests: true,
};

const FIELDS = "chat_messages,deal_messages,offers,new_requests";

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

export async function getNotificationPreferences() {
  const response = await authenticatedSupabaseFetch(`notification_preferences?select=${FIELDS}&user_id=eq.${encodeURIComponent(currentUserId())}&limit=1`);
  const rows = await response.json() as NotificationPreferences[];
  return rows[0] || DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function updateNotificationPreferences(preferences: NotificationPreferences) {
  const response = await authenticatedSupabaseFetch("notification_preferences?on_conflict=user_id", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: currentUserId(), ...preferences }),
  });
  const rows = await response.json() as NotificationPreferences[];
  return rows[0] || preferences;
}
