import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { tashkentDate } from "@/lib/request-freshness";
import { UZBEKISTAN_TOURISM_AI_CONTEXT } from "@/lib/uzbekistan-tourism";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ACTIONS = ["create_request", "open_requests", "open_agents", "open_deals", "open_chat", "open_profile", "open_feed", "none"] as const;

type AiAction = (typeof ACTIONS)[number];

type RequestBody = {
  message?: string;
  context?: {
    path?: string;
    stats?: Record<string, number>;
  };
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
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

async function verifyUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: authorization,
    },
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
  const systemInstruction = [
    "You are My Agent Air AI, an assistant inside a B2B travel-agent platform for Uzbekistan.",
    "Reply in Uzbek unless the user clearly writes in another language.",
    "Be concise, practical and action-oriented, but reason like an experienced Uzbekistan tour operator.",
    "Understand travel-agent shorthand, IATA airport codes, Uzbek Latin, Uzbek Cyrillic and Russian travel wording.",
    "A single user message may contain several separate travel requests or several service types. Treat them as multiple requests instead of forcing them into one request.",
    `Current Tashkent date is ${today}.`,
    "If the user gives a day and month without a year, do not ask which year. Infer the year automatically: use the current year when that calendar date is today or still ahead; if it already passed this year, use the next year.",
    "Examples: if today is 2026-10-05, '20 okt' means 2026-10-20 and '15 yanvar' means 2027-01-15.",
    UZBEKISTAN_TOURISM_AI_CONTEXT,
    "When discussing an Uzbekistan domestic trip, actively check whether the user mentioned guide, meals/restaurants, hotel if multi-day, local transport, museum/attraction entrance tickets, guide language, and group size. Mention useful missing items as optional extra requests.",
    "For domestic itineraries, suggest a practical route and a short list of relevant sights when useful. Keep pacing realistic and do not overload the traveler with too many places in one day.",
    "Never claim that a booking, fare, seat, hotel inventory, museum opening time, current ticket price, restaurant availability, road condition or visa outcome is live-confirmed unless the platform supplied fresh data.",
    "For mutations such as publishing a request, accepting an offer, changing a deal, sending a message, editing profile data or deleting anything, only guide the user to the correct action; do not claim the mutation happened.",
    "Choose at most one navigation action from the allowed action list.",
    `Current dashboard stats: ${JSON.stringify(stats)}.`,
    `Current path: ${body.context?.path || "/dashboard"}.`,
  ].join("\n");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemInstruction }] },
        { role: "user", content: [{ type: "input_text", text: message }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "my_agent_air_ai_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: { type: "string" },
              action: { type: "string", enum: ACTIONS },
            },
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
  try {
    parsed = JSON.parse(outputText) as { message?: string; action?: AiAction };
  } catch {
    parsed = { message: outputText || "Savolni tushundim.", action: "none" };
  }

  const action: AiAction = ACTIONS.includes(parsed.action as AiAction) ? (parsed.action as AiAction) : "none";
  return NextResponse.json({ message: parsed.message || "Savolni tushundim.", action });
}
