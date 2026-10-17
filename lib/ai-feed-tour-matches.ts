import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import type { AssistantDraft } from "@/lib/request-assistant";

const MAX_MATCHES = 5;
const MAX_SEARCH_TERMS = 10;

export type AiTourPostMatch = {
  id: string;
  category: string;
  title: string | null;
  origin: string | null;
  destination: string | null;
  price: number | null;
  currency: string;
  author_full_name: string | null;
  author_company_name: string | null;
  author_is_verified: boolean;
  created_at: string;
};

type FeedSearchRow = AiTourPostMatch & {
  body: string;
  status: string;
  expires_at: string | null;
};

type MarketplaceRequest = AssistantDraft & { category?: string };

type SearchArgs = {
  requests: MarketplaceRequest[];
  message: string;
  authorization: string;
  signal: AbortSignal;
};

type ServiceSignal = {
  category: string;
  feedCategories: string[];
  keys: string[];
  terms: string[];
};

type SearchContext = {
  terms: string[];
  destinationTerms: string[];
  serviceTerms: string[];
  languageTerms: string[];
  expectedCategories: Set<string>;
  russianRequested: boolean;
  directSearchRequested: boolean;
};

const STOP_WORDS = new Set([
  "tur", "turi", "turpaket", "paket", "kerak", "qidir", "qidirib", "top", "topib", "ber", "bering", "uchun", "bormi", "bor", "sayohat", "xohlayman", "xoxlayman", "til", "tili", "tilida", "gapiradigan",
  "tour", "package", "need", "find", "show", "want", "trip", "for", "language", "speaking", "please",
  "тур", "пакет", "нужен", "нужна", "нужно", "найди", "найти", "покажи", "хочу", "поездка", "есть", "для", "язык", "языке", "говорит", "говорящий",
]);

const DISCOVERY_PATTERN = /(?:\b(?:kerak|qidir(?:ib)?|top(?:ib)?|bormi|xohlayman|xoxlayman|need|find|show|want)\b|нужен|нужна|нужно|найди|найти|покажи|хочу|есть\s+ли)/i;

const SERVICE_SIGNALS: ServiceSignal[] = [
  {
    category: "Aviachipta",
    feedCategories: ["aviachipta"],
    keys: ["aviachipta", "chipta", "bilet", "flight", "air ticket", "авиачипта", "авиабилет", "билет", "рейс"],
    terms: ["aviachipta", "bilet", "авиабилет", "билет", "flight"],
  },
  {
    category: "Tur paket",
    feedCategories: ["tur_paket"],
    keys: ["tur paket", "turpaket", "tour package", "putyovka", "тур пакет", "турпакет", "путевка", "путёвка"],
    terms: ["tur paket", "turpaket", "турпакет", "путевка", "tour"],
  },
  {
    category: "Mehmonxona",
    feedCategories: ["mehmonxona"],
    keys: ["mehmonxona", "hotel", "otel", "hostel", "gostinitsa", "отель", "гостиница", "хостел", "апартамент"],
    terms: ["mehmonxona", "hotel", "отель", "гостиница", "hostel"],
  },
  {
    category: "Transfer",
    feedCategories: ["transfer"],
    keys: ["transfer", "taksi", "taxi", "driver", "transport", "трансфер", "такси", "водитель", "транспорт"],
    terms: ["transfer", "трансфер", "taxi", "такси", "водитель"],
  },
  {
    category: "Gid",
    feedCategories: [],
    keys: ["gid", "guide", "ekskursovod", "гид", "экскурсовод"],
    terms: ["gid", "guide", "гид", "экскурсовод"],
  },
  {
    category: "Viza",
    feedCategories: ["viza"],
    keys: ["viza", "visa", "виза"],
    terms: ["viza", "visa", "виза"],
  },
];

const LANGUAGE_SIGNALS: Array<{ id: string; keys: string[]; terms: string[] }> = [
  {
    id: "ru",
    keys: ["rus tilida", "ruscha", "russian", "русский", "русскоязы", "на русском", "по-русски", "по русски"],
    terms: ["ruscha", "russian", "русский", "русскоязы"],
  },
  {
    id: "uz",
    keys: ["o'zbek tilida", "ozbek tilida", "o'zbekcha", "ozbekcha", "uzbek", "узбекский", "на узбекском"],
    terms: ["o'zbekcha", "uzbek", "узбекский"],
  },
  {
    id: "en",
    keys: ["ingliz tilida", "inglizcha", "english", "английский", "на английском"],
    terms: ["inglizcha", "english", "английский"],
  },
];

const DESTINATION_ALIASES: Array<{ keys: string[]; terms: string[] }> = [
  { keys: ["dubai", "dubay", "дубай", "uae", "baa", "amirlik"], terms: ["Dubai", "Dubay", "Дубай", "UAE", "BAA"] },
  { keys: ["misr", "egypt", "египет", "sharm", "hurghada", "xurgada", "хургада"], terms: ["Misr", "Egypt", "Египет", "Sharm", "Hurghada"] },
  { keys: ["turkiya", "turkey", "турция", "antalya", "анталья", "istanbul", "стамбул"], terms: ["Turkiya", "Turkey", "Турция", "Antalya", "Istanbul"] },
  { keys: ["tailand", "thailand", "тайланд", "phuket", "пхукет", "pattaya", "паттайя"], terms: ["Thailand", "Tailand", "Тайланд", "Phuket", "Pattaya"] },
  { keys: ["vietnam", "ветнам", "вьетнам", "phu quoc", "phuquoc", "фукуок"], terms: ["Vietnam", "Вьетнам", "Phu Quoc", "Phuquoc", "Фукуок"] },
  { keys: ["maldiv", "maldives", "мальдив"], terms: ["Maldives", "Maldiv", "Мальдивы"] },
  { keys: ["malayziya", "malaysia", "малайзия", "kuala lumpur"], terms: ["Malaysia", "Malayziya", "Малайзия", "Kuala Lumpur"] },
  { keys: ["gruziya", "georgia", "грузия", "tbilisi", "тбилиси", "batumi", "батуми"], terms: ["Georgia", "Gruziya", "Грузия", "Tbilisi", "Batumi"] },
  { keys: ["ozarbayjon", "azerbaijan", "азербайджан", "baku", "баку"], terms: ["Azerbaijan", "Ozarbayjon", "Азербайджан", "Baku"] },
];

const CATEGORY_LABELS: Record<string, string> = {
  aviachipta: "Aviachipta",
  tur_paket: "Tur paket",
  mehmonxona: "Mehmonxona",
  transfer: "Transfer",
  viza: "Viza",
  umra: "Umra",
  hamkorlik: "Hamkorlik",
  boshqa: "Taklif",
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[ʻ’`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripUzbekCaseSuffix(word: string) {
  for (const suffix of ["lardan", "larga", "ning", "dan", "gacha", "ga", "da", "ni"]) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

function addTerm(target: string[], seen: Set<string>, value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 48);
  const key = normalize(cleaned);
  if (!cleaned || key.length < 2 || seen.has(key)) return;
  seen.add(key);
  target.push(cleaned);
}

function hasSignal(haystack: string, keys: string[]) {
  return keys.some((key) => haystack.includes(normalize(key)));
}

function addSignalTerms(target: string[], allTerms: string[], seenTarget: Set<string>, seenAll: Set<string>, values: string[], limit = values.length) {
  for (const value of values.slice(0, limit)) {
    addTerm(target, seenTarget, value);
    addTerm(allTerms, seenAll, value);
  }
}

export function buildAiFeedSearchContext(requests: MarketplaceRequest[], message: string): SearchContext {
  const terms: string[] = [];
  const destinationTerms: string[] = [];
  const serviceTerms: string[] = [];
  const languageTerms: string[] = [];
  const seenTerms = new Set<string>();
  const seenDestinations = new Set<string>();
  const seenServices = new Set<string>();
  const seenLanguages = new Set<string>();
  const expectedCategories = new Set<string>();
  const destinationValues = requests
    .map((item) => typeof item.destination === "string" ? item.destination.trim() : "")
    .filter(Boolean);

  for (const destination of destinationValues) {
    addTerm(destinationTerms, seenDestinations, destination);
    addTerm(terms, seenTerms, destination);
  }

  const normalizedMessage = normalize(message);
  const requestCategoryNames = new Set(requests.map((item) => normalize(typeof item.category === "string" ? item.category : "")).filter(Boolean));
  const signalHaystack = `${normalizedMessage} ${destinationValues.map(normalize).join(" ")}`.trim();
  let directSearchRequested = destinationValues.some((destination) => {
    const normalizedDestination = normalize(destination);
    return normalizedDestination.length >= 3 && normalizedMessage.includes(normalizedDestination);
  });

  for (const group of SERVICE_SIGNALS) {
    const requestedByDraft = requestCategoryNames.has(normalize(group.category));
    const requestedByText = hasSignal(normalizedMessage, group.keys);
    if (requestedByText) directSearchRequested = true;
    if (!requestedByDraft && !requestedByText) continue;
    for (const category of group.feedCategories) expectedCategories.add(category);
    addSignalTerms(serviceTerms, terms, seenServices, seenTerms, group.terms, 4);
  }

  for (const group of DESTINATION_ALIASES) {
    const requestedByText = hasSignal(normalizedMessage, group.keys);
    if (requestedByText) directSearchRequested = true;
    if (!hasSignal(signalHaystack, group.keys)) continue;
    addSignalTerms(destinationTerms, terms, seenDestinations, seenTerms, group.terms, 3);
  }

  let russianRequested = false;
  for (const group of LANGUAGE_SIGNALS) {
    if (!hasSignal(normalizedMessage, group.keys)) continue;
    if (group.id === "ru") russianRequested = true;
    addSignalTerms(languageTerms, terms, seenLanguages, seenTerms, group.terms, 3);
  }

  for (const raw of normalizedMessage.match(/[\p{L}\p{N}]+/gu) || []) {
    const word = stripUzbekCaseSuffix(raw);
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    addTerm(terms, seenTerms, word);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }

  if (!directSearchRequested && requests.length > 0 && DISCOVERY_PATTERN.test(normalizedMessage)) directSearchRequested = true;

  return {
    terms: terms.slice(0, MAX_SEARCH_TERMS),
    destinationTerms,
    serviceTerms,
    languageTerms,
    expectedCategories,
    russianRequested,
    directSearchRequested,
  };
}

// Kept for backward compatibility with the first tour-only implementation and its callers/tests.
export function buildTourPostSearchTerms(destination: string, message: string) {
  return buildAiFeedSearchContext([{ category: "Tur paket", destination }], message).terms;
}

function includesAny(haystack: string, terms: string[]) {
  return terms.some((value) => {
    const term = normalize(value);
    return term.length >= 2 && haystack.includes(term);
  });
}

function serviceCompatible(row: FeedSearchRow, context: SearchContext) {
  if (!context.serviceTerms.length && !context.expectedCategories.size) return true;
  if (context.expectedCategories.has(row.category)) return true;
  const haystack = `${normalize(row.title || "")} ${normalize(row.body || "")}`;
  return includesAny(haystack, context.serviceTerms);
}

function scoreRow(row: FeedSearchRow, context: SearchContext) {
  const destination = normalize(row.destination || "");
  const origin = normalize(row.origin || "");
  const title = normalize(row.title || "");
  const body = normalize(row.body || "");
  const combined = `${title} ${body}`;
  let score = row.author_is_verified ? 1 : 0;
  if (row.price !== null && row.price !== undefined) score += 0.25;
  if (context.expectedCategories.has(row.category)) score += 7;

  for (const rawTerm of context.destinationTerms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    if (destination === term) score += 10;
    else if (destination && (destination.includes(term) || term.includes(destination))) score += 7;
    if (origin === term) score += 2;
    if (title.includes(term)) score += 4;
    if (body.includes(term)) score += 2;
  }

  for (const rawTerm of context.serviceTerms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    if (title.includes(term)) score += 6;
    if (body.includes(term)) score += 3;
  }

  for (const rawTerm of context.languageTerms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    if (title.includes(term)) score += 3;
    if (body.includes(term)) score += 2;
  }

  if (context.russianRequested && /[А-Яа-яЁё]/u.test(`${row.title || ""} ${row.body || ""}`)) score += 2.5;

  for (const rawTerm of context.terms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    if (title.includes(term)) score += 1.5;
    if (body.includes(term)) score += 0.75;
    if (destination.includes(term) || origin.includes(term)) score += 0.75;
  }

  if (!combined.trim() && !destination && !origin) score -= 5;
  return score;
}

function sanitizeRow(row: FeedSearchRow): AiTourPostMatch | null {
  if (!row || typeof row.id !== "string" || row.status !== "active") return null;
  if (row.expires_at) {
    const expiry = Date.parse(row.expires_at);
    if (Number.isFinite(expiry) && expiry <= Date.now()) return null;
  }
  const numericPrice = row.price === null || row.price === undefined ? null : Number(row.price);
  const category = typeof row.category === "string" ? row.category.slice(0, 40) : "boshqa";
  const titleValue = typeof row.title === "string" && row.title.trim()
    ? row.title.trim().slice(0, 160)
    : typeof row.destination === "string" && row.destination.trim()
      ? row.destination.trim().slice(0, 120)
      : CATEGORY_LABELS[category] || "Taklif";
  const authorName = typeof row.author_full_name === "string" && row.author_full_name.trim() ? row.author_full_name.trim().slice(0, 120) : null;
  const companyName = typeof row.author_company_name === "string" && row.author_company_name.trim()
    ? row.author_company_name.trim().slice(0, 160)
    : authorName || "Hamkor";
  return {
    id: row.id,
    category,
    title: titleValue,
    origin: typeof row.origin === "string" ? row.origin.slice(0, 120) : null,
    destination: typeof row.destination === "string" ? row.destination.slice(0, 120) : null,
    price: Number.isFinite(numericPrice) ? numericPrice : null,
    currency: typeof row.currency === "string" ? row.currency.slice(0, 8) : "",
    author_full_name: authorName,
    author_company_name: companyName,
    author_is_verified: row.author_is_verified === true,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function findAiTourPostMatches({ requests, message, authorization, signal }: SearchArgs) {
  const context = buildAiFeedSearchContext(requests, message);
  if (!context.directSearchRequested || !context.terms.length) return [] as AiTourPostMatch[];

  const results = await Promise.allSettled(context.terms.map(async (term) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_feed_posts`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ p_category: null, p_post_type: null, p_search: term, p_limit: 8, p_offset: 0 }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) return [] as FeedSearchRow[];
    const rows = await response.json().catch(() => []);
    return Array.isArray(rows) ? rows as FeedSearchRow[] : [];
  }));

  const ranked = new Map<string, { row: FeedSearchRow; score: number }>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const row of result.value) {
      const sanitized = sanitizeRow(row);
      if (!sanitized || !serviceCompatible(row, context)) continue;
      const score = scoreRow(row, context);
      if (score <= 0) continue;
      const existing = ranked.get(row.id);
      if (!existing || score > existing.score) ranked.set(row.id, { row, score });
    }
  }

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || Date.parse(b.row.created_at || "") - Date.parse(a.row.created_at || ""))
    .map(({ row }) => sanitizeRow(row))
    .filter((row): row is AiTourPostMatch => Boolean(row))
    .slice(0, MAX_MATCHES);
}
