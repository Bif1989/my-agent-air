// Supabase Edge Function: push-dispatch
// Receives a minimal { type, id } event from a DB trigger (see
// supabase/migrations/20260918120000_push_notifications.sql), re-fetches the
// authoritative row with the service role key, resolves recipients +
// preferences, and sends Web Push notifications. Never trust payload data
// beyond the event type/id — this keeps the auth token and full row bodies
// out of the trigger payload.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
const VAPID_PUBLIC_KEY = Deno.env.get("PUSH_VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE_KEY = Deno.env.get("PUSH_VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("PUSH_VAPID_SUBJECT") || "mailto:support@myagentair.com";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type NotificationPayload = { title: string; body: string; url: string; tag: string };
type Recipient = { userId: string; preferenceKey: "chat_messages" | "deal_messages" | "offers" | "new_requests" };

// Strip any markup and hard-cap length so we never render HTML in a notification.
function toPlainPreview(text: string | null | undefined, max = 80) {
  const plain = (text || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

async function fullName(userId: string) {
  const { data } = await supabase.from("profiles").select("full_name,company_name").eq("id", userId).maybeSingle();
  return data?.full_name || data?.company_name || "Agent";
}

async function filterByPreference(recipients: Recipient[]) {
  const ids = [...new Set(recipients.map((r) => r.userId))];
  if (!ids.length) return [];
  const { data } = await supabase.from("notification_preferences").select("user_id,chat_messages,deal_messages,offers,new_requests").in("user_id", ids);
  const prefsById = new Map((data || []).map((row) => [row.user_id, row]));
  return recipients.filter((recipient) => {
    const prefs = prefsById.get(recipient.userId);
    // No row yet = defaults are all ON.
    if (!prefs) return true;
    return prefs[recipient.preferenceKey] !== false;
  });
}

async function sendToRecipients(recipients: Recipient[], payload: NotificationPayload) {
  const allowed = await filterByPreference(recipients);
  const userIds = [...new Set(allowed.map((r) => r.userId))];
  if (!userIds.length) return;
  const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth_key").in("user_id", userIds);
  for (const subscription of subscriptions || []) {
    const pushSubscription = { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_key } };
    try {
      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
    } catch (error) {
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Expired/invalid subscription cleanup.
        await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
      }
    }
  }
}

async function handleChatMessage(id: string) {
  const { data: message } = await supabase.from("chat_messages").select("room_id,sender_id,message").eq("id", id).maybeSingle();
  if (!message) return;
  const { data: room } = await supabase.from("chat_rooms").select("id,room_type").eq("id", message.room_id).maybeSingle();
  if (!room) return;

  let recipientIds: string[] = [];
  if (room.room_type === "public") {
    const { data: profiles } = await supabase.from("profiles").select("id").neq("id", message.sender_id);
    recipientIds = (profiles || []).map((p) => p.id);
  } else {
    const { data: members } = await supabase.from("chat_room_members").select("user_id").eq("room_id", message.room_id).neq("user_id", message.sender_id);
    recipientIds = (members || []).map((m) => m.user_id);
  }
  if (!recipientIds.length) return;

  const senderName = await fullName(message.sender_id);
  const payload: NotificationPayload = {
    title: `Yangi xabar — ${senderName}`,
    body: toPlainPreview(message.message),
    url: `/messenger/${message.room_id}`,
    tag: `chat-${message.room_id}`,
  };
  await sendToRecipients(recipientIds.map((userId) => ({ userId, preferenceKey: "chat_messages" as const })), payload);
}

async function handleDealMessage(id: string) {
  const { data: message } = await supabase.from("messages").select("deal_id,sender_id,message").eq("id", id).maybeSingle();
  if (!message) return;
  const { data: deal } = await supabase.from("deals").select("buyer_id,seller_id").eq("id", message.deal_id).maybeSingle();
  if (!deal) return;
  const recipientId = deal.buyer_id === message.sender_id ? deal.seller_id : deal.buyer_id;
  if (!recipientId || recipientId === message.sender_id) return;

  const senderName = await fullName(message.sender_id);
  const payload: NotificationPayload = {
    title: `Yangi xabar — ${senderName}`,
    body: toPlainPreview(message.message),
    url: `/messages/${message.deal_id}`,
    tag: `deal-${message.deal_id}`,
  };
  await sendToRecipients([{ userId: recipientId, preferenceKey: "deal_messages" }], payload);
}

async function handleOffer(id: string) {
  const { data: offer } = await supabase.from("offers").select("request_id,agent_id,price,currency").eq("id", id).maybeSingle();
  if (!offer) return;
  const { data: request } = await supabase.from("requests").select("created_by,origin,destination").eq("id", offer.request_id).maybeSingle();
  if (!request || request.created_by === offer.agent_id) return;

  const payload: NotificationPayload = {
    title: `Yangi taklif — ${request.origin || "—"} → ${request.destination || "—"}`,
    body: toPlainPreview(offer.price ? `${offer.price} ${offer.currency} taklif qilindi` : "Yangi taklif keldi"),
    url: `/requests/${offer.request_id}`,
    tag: `offer-${id}`,
  };
  await sendToRecipients([{ userId: request.created_by, preferenceKey: "offers" }], payload);
}

async function handleNewRequest(id: string) {
  const { data: request } = await supabase.from("requests").select("created_by,origin,destination,category,status").eq("id", id).maybeSingle();
  if (!request || request.status !== "open") return;
  const { data: profiles } = await supabase.from("profiles").select("id").neq("id", request.created_by);
  const recipientIds = (profiles || []).map((p) => p.id);
  if (!recipientIds.length) return;

  const payload: NotificationPayload = {
    title: `Yangi so‘rov — ${request.origin || "—"} → ${request.destination || "—"}`,
    body: toPlainPreview(request.category || "Yangi so‘rov joylandi"),
    url: `/requests/${id}`,
    tag: `request-${id}`,
  };
  await sendToRecipients(recipientIds.map((userId) => ({ userId, preferenceKey: "new_requests" as const })), payload);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { type?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  if (!body.type || !body.id) return new Response("Missing type/id", { status: 400 });

  try {
    if (body.type === "chat_message") await handleChatMessage(body.id);
    else if (body.type === "deal_message") await handleDealMessage(body.id);
    else if (body.type === "offer") await handleOffer(body.id);
    else if (body.type === "new_request") await handleNewRequest(body.id);
    else return new Response("Unknown event type", { status: 400 });
  } catch (error) {
    console.error("push-dispatch error", error);
    return new Response("Internal error", { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
