import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import type { AuthSession } from "@/lib/supabase-auth";

export type AiHistoryAction = { label: string; href: string };
export type AiHistoryMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: AiHistoryAction[];
  created_at: string;
};

function headers(session: AuthSession) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function listAiChatHistory(session: AuthSession, limit = 80): Promise<AiHistoryMessage[]> {
  const params = new URLSearchParams({
    select: "id,role,content,actions,created_at",
    user_id: `eq.${session.user.id}`,
    order: "created_at.desc",
    limit: String(limit),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_messages?${params.toString()}`, {
    headers: headers(session),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("AI tarixi yuklanmadi.");
  const rows = (await response.json()) as AiHistoryMessage[];
  return rows.reverse().map((row) => ({ ...row, actions: Array.isArray(row.actions) ? row.actions : [] }));
}

export async function saveAiChatMessage(
  session: AuthSession,
  role: "user" | "assistant",
  content: string,
  actions: AiHistoryAction[] = [],
) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/ai_chat_messages`, {
    method: "POST",
    headers: { ...headers(session), Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: session.user.id, role, content: content.slice(0, 8000), actions }),
  });
  if (!response.ok) throw new Error("AI tarixi saqlanmadi.");
}
