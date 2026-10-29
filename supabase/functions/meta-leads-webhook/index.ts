// Supabase Edge Function: meta-leads-webhook
// Receives Meta Page `leadgen` webhook events, verifies the Meta HMAC signature,
// retrieves the authoritative lead by leadgen_id, and upserts it into the
// server-only marketing_leads table. Provider credentials must stay in Edge
// Function secrets and are never returned to clients or stored in source.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("META_APP_SECRET") || "";
const LEAD_ACCESS_TOKEN = Deno.env.get("META_LEAD_ACCESS_TOKEN") || "";
const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v26.0";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type LeadField = { name?: string; values?: unknown[] };
type MetaLead = {
  id?: string;
  created_time?: string;
  ad_id?: string;
  form_id?: string;
  field_data?: LeadField[];
};
type LeadgenValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  adgroup_id?: string;
  ad_id?: string;
  created_time?: number;
};
type WebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{ field?: string; value?: LeadgenValue }>;
  }>;
};

type AdContext = {
  name?: string;
  adset?: { name?: string };
  campaign?: { name?: string };
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function expectedSignature(rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)))}`;
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function fieldMap(fieldData: LeadField[] | undefined) {
  const result = new Map<string, string>();
  for (const field of fieldData || []) {
    const key = String(field.name || "").trim();
    if (!key) continue;
    const value = (field.values || []).map((item) => String(item ?? "").trim()).filter(Boolean).join(", ");
    result.set(key, value);
  }
  return result;
}

function firstValue(fields: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields.get(key)?.trim();
    if (value) return value;
  }
  return null;
}

function preferredTravel(fields: Map<string, string>) {
  const direct = firstValue(fields, [
    "preferred_travel",
    "preferred_travel_date",
    "preferred_travel_month",
    "travel_date",
    "travel_month",
    "departure_date",
  ]);
  if (direct) return direct;
  for (const [key, value] of fields) {
    const normalized = key.toLowerCase();
    if (/(travel|trip|month|date|safar|oy|sana|umra)/.test(normalized) && value) return value;
  }
  return null;
}

async function graphJson<T>(path: string, fields?: string): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  if (fields) url.searchParams.set("fields", fields);
  url.searchParams.set("access_token", LEAD_ACCESS_TOKEN);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `Graph API ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

async function fetchAdContext(adId: string | undefined) {
  if (!adId) return null;
  try {
    return await graphJson<AdContext>(adId, "name,adset{name},campaign{name}");
  } catch (error) {
    console.warn("meta-leads-webhook ad context unavailable", error);
    return null;
  }
}

async function ingestLead(value: LeadgenValue) {
  const leadgenId = String(value.leadgen_id || "").trim();
  if (!leadgenId) throw new Error("leadgen_id missing");

  const lead = await graphJson<MetaLead>(leadgenId, "id,created_time,ad_id,form_id,field_data");
  const fields = fieldMap(lead.field_data);
  const firstName = firstValue(fields, ["first_name"]);
  const lastName = firstValue(fields, ["last_name"]);
  const fullName = firstValue(fields, ["full_name", "name"]) || [firstName, lastName].filter(Boolean).join(" ") || null;
  const phone = firstValue(fields, ["phone_number", "phone", "mobile_phone", "mobile"]);
  const adId = String(lead.ad_id || value.ad_id || "").trim() || undefined;
  const formId = String(lead.form_id || value.form_id || "").trim() || null;
  const adContext = await fetchAdContext(adId);

  const receivedAt = lead.created_time && !Number.isNaN(Date.parse(lead.created_time))
    ? new Date(lead.created_time).toISOString()
    : value.created_time
      ? new Date(value.created_time * 1000).toISOString()
      : new Date().toISOString();

  const row = {
    source: "meta",
    platform: "meta",
    campaign_name: adContext?.campaign?.name || null,
    adset_name: adContext?.adset?.name || null,
    ad_name: adContext?.name || null,
    form_id: formId,
    leadgen_id: leadgenId,
    full_name: fullName,
    phone,
    preferred_travel: preferredTravel(fields),
    status: "new",
    raw_payload: { notification: value, lead },
    received_at: receivedAt,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("marketing_leads").upsert(row, { onConflict: "leadgen_id" });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!APP_SECRET || !LEAD_ACCESS_TOKEN) return jsonResponse({ ok: false, error: "meta_webhook_not_configured" }, 503);

  const rawBody = await req.text();
  const suppliedSignature = req.headers.get("x-hub-signature-256") || "";
  const expected = await expectedSignature(rawBody);
  if (!suppliedSignature || !timingSafeEqual(suppliedSignature, expected)) {
    return jsonResponse({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  if (payload.object !== "page") return jsonResponse({ ok: true, ignored: true });

  const values: LeadgenValue[] = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field === "leadgen" && change.value?.leadgen_id) values.push(change.value);
    }
  }
  if (!values.length) return jsonResponse({ ok: true, processed: 0 });

  const results = await Promise.allSettled(values.map(ingestLead));
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length) {
    console.error("meta-leads-webhook ingest failures", failures.map((failure) => failure.status === "rejected" ? String(failure.reason) : ""));
    return jsonResponse({ ok: false, processed: values.length - failures.length, failed: failures.length }, 500);
  }

  return jsonResponse({ ok: true, processed: values.length });
});
