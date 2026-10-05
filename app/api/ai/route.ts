import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import { tashkentDate } from "@/lib/request-freshness";
import { UZBEKISTAN_TOURISM_AI_CONTEXT } from "@/lib/uzbekistan-tourism";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const ACTIONS = ["create_request", "open_requests", "open_agents", "open_deals", "open_chat", "open_profile", "open_feed", "none"] as const;
const REQUEST_CATEGORIES = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Gid", "Viza", "Boshqa"] as const;
const CURRENCIES = ["USD", "UZS", "EUR", "RUB"] as const;

type AiAction = (typeof ACTIONS)[number];
type RequestCategory = (typeof REQUEST_CATEGORIES)[number];
type Currency = (typeof CURRENCIES)[number];
type HistoryItem = { role?: "user" | "assistant"; content?: string };

type AiRequestDraft = {
  category: RequestCategory;
  origin: string;
  destination: string;
  travel_date: string;
  adults: number;
  children: number;
  infants: number;
  baggage: string;
  budget: number;
  currency: Currency;
  description: string;
  rooms: string;
  nights: string;
  vehicle: string;
  language: string;
  missing: string[];
};

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

type ParsedAiReply = {
  message?: string;
  action?: AiAction;
  requests?: Partial<AiRequestDraft>[];
  clarifications?: string[];
  notes?: string[];
  suggestions?: string[];
  warnings?: string[];
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
      content: String(item.content).trim().slice(0, 5000),
    }));
}

function sanitizeList(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function composeStructuredMessage(base: string, parsed: ParsedAiReply, locale: "uz" | "ru") {
  const sections: string[] = [];
  const clarifications = sanitizeList(parsed.clarifications);
  const notes = sanitizeList(parsed.notes);
  const suggestions = sanitizeList(parsed.suggestions);
  const warnings = sanitizeList(parsed.warnings);

  if (clarifications.length) sections.push(`[[clarification]]${clarifications.map((item) => `• ${item}`).join("\n")}[[/clarification]]`);
  if (notes.length) sections.push(`[[note]]${notes.map((item) => `• ${item}`).join("\n")}[[/note]]`);
  if (suggestions.length) sections.push(`[[suggestion]]${suggestions.map((item) => `• ${item}`).join("\n")}[[/suggestion]]`);
  if (warnings.length) sections.push(`[[warning]]${warnings.map((item) => `• ${item}`).join("\n")}[[/warning]]`);

  const main = base.trim() || (locale === "ru" ? "Понял задачу." : "Vazifani tushundim.");
  return sections.length ? `${main}\n\n${sections.join("\n\n")}` : main;
}

function sanitizeDraft(value: Partial<AiRequestDraft>): AiRequestDraft | null {
  if (!REQUEST_CATEGORIES.includes(value.category as RequestCategory)) return null;
  const currency = CURRENCIES.includes(value.currency as Currency) ? (value.currency as Currency) : "USD";
  const cleanNumber = (input: unknown, fallback = 0) => typeof input === "number" && Number.isFinite(input) && input >= 0 ? input : fallback;
  const cleanText = (input: unknown, max = 1200) => typeof input === "string" ? input.trim().slice(0, max) : "";
  return {
    category: value.category as RequestCategory,
    origin: cleanText(value.origin, 160),
    destination: cleanText(value.destination, 220),
    travel_date: /^20\d{2}-\d{2}-\d{2}$/.test(cleanText(value.travel_date, 10)) ? cleanText(value.travel_date, 10) : "",
    adults: Math.min(500, Math.max(1, Math.round(cleanNumber(value.adults, 1)))),
    children: Math.min(500, Math.round(cleanNumber(value.children))),
    infants: Math.min(500, Math.round(cleanNumber(value.infants))),
    baggage: cleanText(value.baggage, 80),
    budget: cleanNumber(value.budget),
    currency,
    description: cleanText(value.description, 1800),
    rooms: cleanText(value.rooms, 80),
    nights: cleanText(value.nights, 80),
    vehicle: cleanText(value.vehicle, 120),
    language: cleanText(value.language, 120),
    missing: Array.isArray(value.missing) ? value.missing.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 10) : [],
  };
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
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
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
    "You are My Agent Air AI, an intelligent B2B travel-agent assistant for Uzbekistan.",
    locale === "ru" ? "The selected interface language is Russian. Reply in Russian unless the user explicitly asks for another language." : "The selected interface language is Uzbek. Reply in Uzbek unless the user explicitly asks for another language.",
    "This is a persistent conversation thread. Treat the messages in this thread as one ongoing task or tour package unless the user clearly switches topics.",
    "Always use the supplied conversation history. Resolve references such as 'shu', 'o‘sha', 'oldingi', 'narxini o‘zgartir', 'hotelni 4* qil', 'это', 'тот', 'предыдущий', 'измени цену' against earlier messages in this thread.",
    "When the user changes one detail, preserve every other previously agreed detail unless it conflicts with the new instruction.",
    "Do not make the user repeat facts already present in the thread.",
    conversationTitle ? `Conversation title: ${conversationTitle}.` : "",
    "Keep the main message concise and put auxiliary information into the dedicated arrays instead of mixing everything into one paragraph.",
    "Use clarifications for facts the user must provide or confirm before a reliable supplier request can be finalized. Phrase each clarification as a concrete missing fact or short question, not as a vague warning.",
    "Use notes for useful factual context, assumptions, calculations, or explanation of what the AI inferred. Notes are informative and do not necessarily require user action.",
    "Use suggestions for optional add-ons or improvements such as guide, meals, restaurant, museum tickets, local transport, better route sequencing, or additional supplier requests. Suggestions must remain optional unless the user asked for them.",
    "Use warnings only for actual risks, conflicts, invalid data, impossible dates, or situations where something should not be assumed. Do not overuse warnings.",
    "Do not repeat the same point in message and in an auxiliary array. One point belongs in one place only.",
    "IMPORTANT REQUEST-DRAFT RULE: whenever the user asks to organize, find, request, quote, book, prepare or change concrete travel services, return structured request drafts in the requests array. Do not only explain in prose.",
    "Each independently quotable supplier need must be its own request draft. Multiple services in one message mean multiple drafts. The same service category in different cities also means separate drafts.",
    "Examples: transport + Samarkand hotel + Bukhara hotel = three drafts. Two hotels in two cities are two separate Mehmonxona drafts, not one. Air ticket + hotel + transfer = three drafts.",
    "Use category Transfer for minivan, minibus, bus, taxi, airport transfer and other ground transport requests.",
    "Use category Boshqa for restaurant/group meals, museum or attraction entrance tickets, and other supplier services that do not have a dedicated category.",
    "Only create drafts for services the user actually requests or clearly asks you to add. Put useful but unrequested services into suggestions instead of silently creating them.",
    "If the user explicitly says to prepare everything needed for a tour, you may also create sensible additional drafts, but clearly say which ones you added as recommendations.",
    "For each draft, fill every field you can infer. Unknown text fields must be an empty string, unknown budget must be 0, and unknown counts other than adults must be 0. Put genuinely missing required facts in the missing array instead of inventing them.",
    "Every item in a request missing array that truly requires user confirmation should also appear once in clarifications, written in user-friendly language.",
    "For hotel drafts: destination is the hotel city; put breakfast/meal plan, star level, room preferences and per-person/per-room budget basis in description. Put nights in nights. Put room count in rooms only when stated or safely calculable; otherwise leave it empty and add it to missing.",
    "For ground transport drafts: put the full route in origin/destination and vehicle type in vehicle. A multi-stop itinerary may use a destination such as 'Samarqand → Buxoro' and describe the complete route in description.",
    "For guide drafts put the requested language in language when known.",
    "For budgets such as '250 ming so‘m' normalize the numeric budget to 250000 and currency to UZS. Preserve whether that budget is per person, per room, per night or total in description.",
    "Use full city names in drafts even when the user types IATA codes or abbreviations. For example TAS=Toshkent, SKD=Samarqand, BHK=Buxoro, NMA=Namangan, IST=Istanbul, DXB=Dubai.",
    "Understand travel-agent shorthand, Uzbek Latin, Uzbek Cyrillic and Russian travel wording.",
    `Current Tashkent date is ${today}.`,
    "If the user gives a day and month without a year, never ask which year. Use the current year when that date is today or still ahead; if it already passed this year, use the next year.",
    "For sequential domestic itineraries, derive later service dates when the sequence and number of nights make it unambiguous. Example: start Samarkand on 10 November for 2 nights, then Bukhara hotel starts 12 November.",
    "If the current thread already contains structured request drafts and the user changes something, return the COMPLETE updated set of drafts for the current package, not just the changed one.",
    "If the user is only asking for travel advice, sightseeing ideas or general information and is not asking for a supplier request, leave requests empty and answer normally.",
    UZBEKISTAN_TOURISM_AI_CONTEXT,
    "For Uzbekistan domestic tours, proactively use suggestions to mention useful missing optional components: guide/ekskursovod, breakfast/lunch/dinner or group restaurant, museum/attraction tickets, local transfers, and hotel when overnight stays are implied.",
    "Never claim that a booking, fare, seat, hotel inventory, restaurant availability, attraction opening time, road condition or visa outcome is live-confirmed unless the platform supplied that data.",
    "For mutations such as publishing a request, accepting an offer, changing a deal, sending a message, editing profile data or deleting anything, only prepare or guide; do not claim the mutation happened.",
    "Choose at most one navigation action from the allowed action list. When request drafts are returned, action should normally be none because the UI will render a button for every draft.",
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
            properties: {
              message: { type: "string" },
              action: { type: "string", enum: ACTIONS },
              requests: {
                type: "array",
                maxItems: 12,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    category: { type: "string", enum: REQUEST_CATEGORIES },
                    origin: { type: "string" },
                    destination: { type: "string" },
                    travel_date: { type: "string" },
                    adults: { type: "integer", minimum: 1, maximum: 500 },
                    children: { type: "integer", minimum: 0, maximum: 500 },
                    infants: { type: "integer", minimum: 0, maximum: 500 },
                    baggage: { type: "string" },
                    budget: { type: "number", minimum: 0 },
                    currency: { type: "string", enum: CURRENCIES },
                    description: { type: "string" },
                    rooms: { type: "string" },
                    nights: { type: "string" },
                    vehicle: { type: "string" },
                    language: { type: "string" },
                    missing: { type: "array", maxItems: 10, items: { type: "string" } },
                  },
                  required: ["category", "origin", "destination", "travel_date", "adults", "children", "infants", "baggage", "budget", "currency", "description", "rooms", "nights", "vehicle", "language", "missing"],
                },
              },
              clarifications: { type: "array", maxItems: 8, items: { type: "string" } },
              notes: { type: "array", maxItems: 8, items: { type: "string" } },
              suggestions: { type: "array", maxItems: 8, items: { type: "string" } },
              warnings: { type: "array", maxItems: 6, items: { type: "string" } },
            },
            required: ["message", "action", "requests", "clarifications", "notes", "suggestions", "warnings"],
          },
        },
      },
      max_output_tokens: 2800,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("OpenAI AI route failed", response.status, errorText.slice(0, 800));
    return NextResponse.json({ message: "AI xizmatida vaqtinchalik xatolik.", code: "AI_UPSTREAM_ERROR" }, { status: 502 });
  }

  const data = (await response.json()) as OpenAiResponse;
  const outputText = extractOutputText(data);
  let parsed: ParsedAiReply = {};
  try { parsed = JSON.parse(outputText) as ParsedAiReply; }
  catch { parsed = { message: outputText || (locale === "ru" ? "Понял вопрос." : "Savolni tushundim."), action: "none", requests: [], clarifications: [], notes: [], suggestions: [], warnings: [] }; }

  const action: AiAction = ACTIONS.includes(parsed.action as AiAction) ? (parsed.action as AiAction) : "none";
  const requests = Array.isArray(parsed.requests) ? parsed.requests.map(sanitizeDraft).filter((item): item is AiRequestDraft => Boolean(item)).slice(0, 12) : [];
  const baseMessage = parsed.message || (locale === "ru" ? "Понял вопрос." : "Savolni tushundim.");
  return NextResponse.json({
    message: composeStructuredMessage(baseMessage, parsed, locale),
    action,
    requests,
  });
}
