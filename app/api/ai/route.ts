import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { tashkentDate } from "@/lib/request-freshness";
import { UZBEKISTAN_TOURISM_AI_CONTEXT } from "@/lib/uzbekistan-tourism";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ACTIONS = ["create_request", "open_requests", "open_agents", "open_deals", "open_chat", "open_profile", "open_feed", "none"] as const;

type AiAction = (typeof ACTIONS)[number];
type HistoryItem = { role?: "user" | "assistant"; content?: string };

type RequestBody = {
  message?: string;
  history?: HistoryItem[];
  context?: {
    path?: string;
    stats?: Record<string, number>;
    locale?: "uz" | "ru";
    conversationTitle?: string;
  };
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function extractOutputText(data: OpenAiResponse) {
  if (typeof data.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string" && content.text.trim()) return content.text.trim();
    }
  }
  return "";
}

function sanitizeHistory(history: HistoryItem[] | undefined) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => (item?.role === "user" || item?.role === "assistant") && typeof item.content === "string" && item.content.trim())
    .slice(-18)
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: String(item.content).trim().slice(0, 3000),
    }));
}

async function verifyUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: string; email?: string } | null;
  return user?.id ? user : null;
}

export async function POST(request: NextRequest) {
  const user = await verifyUser(request);
  if (!user) return NextResponse.json({ message: "Kirish sessiyasi yaroqsiz.", code: "UNAUTHORIZED" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1500) : "";
  if (!message) return NextResponse.json({ message: "Xabar bo‘sh bo‘lmasligi kerak.", code: "EMPTY_MESSAGE" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ message: "AI modeli hali ulanmagan.", code: "AI_NOT_CONFIGURED" }, { status: 503 });

  const model = process.env.OPENAI_AI_MODEL || "gpt-6-luna";
  const stats = body.context?.stats || {};
  const today = tashkentDate();
  const locale = body.context?.locale === "ru" ? "ru" : "uz";
  const conversationTitle = typeof body.context?.conversationTitle === "string" ? body.context.conversationTitle.slice(0, 120) : "";
  const history = sanitizeHistory(body.history);

  const systemInstruction = [
    "You are My Agent Air AI, an assistant inside a B2B travel-agent platform for Uzbekistan.",
    locale === "ru" ? "The selected interface language is Russian. Reply in Russian unless the user explicitly asks for another language." : "The selected interface language is Uzbek. Reply in Uzbek unless the user explicitly asks for another language.",
    "This is a persistent conversation thread. Treat the messages in this thread as one ongoing task or topic unless the user clearly says they are switching topics.",
    "Always use the supplied conversation history. Resolve references such as 'shu', 'o‘sha', 'oldingi', 'narxini o‘zgartir', 'hotelni 4* qil', 'это', 'тот', 'предыдущий', 'измени цену' against the earlier messages in this same thread.",
    "When the user changes one detail, preserve the rest of the previously agreed plan unless the new instruction conflicts with it.",
    "Do not make the user repeat facts that already appear in the current thread.",
    "When useful, briefly state what changed from the previous version and continue from there instead of restarting from zero.",
    conversationTitle ? `Conversation title: ${conversationTitle}.` : "",
    "Be concise, practical and action-oriented.",
    "Understand travel-agent shorthand, IATA airport codes, Uzbek Latin, Uzbek Cyrillic and Russian travel wording.",
    "A single user message may contain several separate travel requests or several service types. Treat them as multiple requests instead of forcing them into one request.",
    `Current Tashkent date is ${today}.`,
    "If the user gives a day and month without a year, do not ask which year. Infer the year automatically: use the current year when that calendar date is today or still ahead; if it already passed this year, use the next year.",
    UZBEKISTAN_TOURISM_AI_CONTEXT,
    "Never claim that a booking, fare, seat, hotel inventory, restaurant availability, attraction opening time, road condition or visa outcome is live-confirmed unless the platform supplied that data.",
    "For mutations such as publishing a request, accepting an offer, changing a deal, sending a message, editing profile data or deleting anything, only guide the user to the correct action; do not claim the mutation happened.",
    "Choose at most one navigation action from the allowed action list.",
    `Current dashboard stats: ${JSON.stringify(stats)}.`,
    `Current path: ${body.context?.path || "/dashboard"}.`,
  ].filter(Boolean).join("\n");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: systemInstruction },
        ...history,
        { role: "user", content: message },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "my_agent_air_ai_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: { message: { type: "string" }, action: { type: "string", enum: ACTIONS } },
            required: ["message", "action"],
          },
        },
      },
      max_output_tokens: 650,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI AI route failed", response.status, errorText.slice(0, 500));
    return NextResponse.json({ message: "AI xizmatida vaqtinchalik xatolik.", code: "AI_UPSTREAM_ERROR" }, { status: 502 });
  }

  const data = (await response.json()) as OpenAiResponse;
  const outputText = extractOutputText(data);
  let parsed: { message?: string; action?: AiAction } = {};
  try { parsed = JSON.parse(outputText) as { message?: string; action?: AiAction }; }
  catch { parsed = { message: outputText || (locale === "ru" ? "Понял вопрос." : "Savolni tushundim."), action: "none" }; }

  const action: AiAction = ACTIONS.includes(parsed.action as AiAction) ? (parsed.action as AiAction) : "none";
  return NextResponse.json({ message: parsed.message || (locale === "ru" ? "Понял вопрос." : "Savolni tushundim."), action });
}
