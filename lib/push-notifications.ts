import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

// Public VAPID key is safe to ship to the client; the private key stays server-side only (Edge Function secret).
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_PUSH_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function subscriptionKey(subscription: PushSubscription, name: "p256dh" | "auth") {
  const raw = subscription.getKey(name);
  if (!raw) return "";
  return btoa(String.fromCharCode(...new Uint8Array(raw)));
}

export function isPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function registerServiceWorker() {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function getExistingPushSubscription() {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function saveSubscription(subscription: PushSubscription) {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  await authenticatedSupabaseFetch("push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      user_id: session.user.id,
      endpoint: subscription.endpoint,
      p256dh: subscriptionKey(subscription, "p256dh"),
      auth_key: subscriptionKey(subscription, "auth"),
      last_seen_at: new Date().toISOString(),
    }),
  });
}

export async function removeSubscriptionFromServer(endpoint: string) {
  try {
    await authenticatedSupabaseFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: "DELETE" });
  } catch {
    // Best-effort cleanup; logout must succeed even if this fails.
  }
}

export async function enablePushNotifications() {
  if (!isPushSupported()) throw new Error("PUSH_UNSUPPORTED");
  if (!VAPID_PUBLIC_KEY) throw new Error("PUSH_NOT_CONFIGURED");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("PUSH_PERMISSION_DENIED");
  const registration = await registerServiceWorker();
  if (!registration) throw new Error("PUSH_SW_FAILED");
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  await saveSubscription(subscription);
  return true;
}

export async function disablePushNotifications() {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  await removeSubscriptionFromServer(subscription.endpoint);
  await subscription.unsubscribe().catch(() => undefined);
}
