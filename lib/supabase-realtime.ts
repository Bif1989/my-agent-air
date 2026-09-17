import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { getStoredSession } from "@/lib/supabase-auth";

const SUPABASE_URL = "https://fsemjqlreuzvpyvbmxzt.supabase.co";
const SUPABASE_KEY = "sb_publishable_-GDTmDKA2vl2O2msBTSUBw_RIJ62pQS";

let realtimeClient: SupabaseClient | null = null;

export function getSupabaseRealtimeClient() {
  if (typeof window === "undefined") return null;
  const session = getStoredSession();
  if (!session) return null;
  if (!realtimeClient) {
    realtimeClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  realtimeClient.realtime.setAuth(session.access_token);
  return realtimeClient;
}

export function subscribeToDealMessages(dealId: string, onInsert: (payload: { new: Record<string, unknown> }) => void) {
  const client = getSupabaseRealtimeClient();
  if (!client) return null;
  const channel: RealtimeChannel = client.channel(`deal-messages:${dealId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `deal_id=eq.${dealId}` }, onInsert)
    .subscribe();
  return { client, channel };
}