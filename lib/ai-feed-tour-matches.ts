import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import type { AssistantDraft } from "@/lib/request-assistant";

const MAX_MATCHES = 6;
const MAX_SEARCH_TERMS = 9;
const SEARCH_LIMIT = 12;

export type AiFeedPostMatch = {
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

// Kept as a compatibility alias so the AI route does not need a second function surface.
export type AiTourPostMatch = AiFeedPostMatch;

type FeedSearchRow = AiFeedPostMatch & {
  body: string;
  status: string;
  expires_at: string | null;
};

type ServiceRequest = AssistantDraft & { category?: string };

type SearchArgs = {
  requests: ServiceRequest[];
  message: string;
  authorization: string;
  signal: AbortSignal;
};

type CategoryRule = { feedCategories: string[]; terms: string[] };

const FEED_CATEGORIES = new Set(["aviachipta", "tur_paket", "mehmonxona", "transfer", "viza", "umra", "hamkorlik", "boshqa"]);

const CATEGORY_RULES: Record<string, CategoryRule> = {
  Aviachipta: { feedCategories: ["aviachipta"], terms: ["aviachipta", "авиабилет", "flight", "bilet"] },
  "Tur paket": { feedCategories: ["tur_paket"], terms: ["tur paket", "тур", "tour", "турпакет"] },
  Mehmonxona: { feedCategories: ["mehmonxona"], terms: ["mehmonxona", "отель", "hotel", "гостиница"] },
  Transfer: { feedCategories: ["transfer"], terms: ["transfer", "трансфер", "transport", "транспорт"] },
  Gid: { feedCategories: ["boshqa", "hamkorlik"], terms: ["gid", "гид", "guide", "экскурсовод"] },
  Viza: { feedCategories: ["viza"], terms: ["viza", "виза", "visa"] },
  Boshqa: { feedCategories: ["boshqa", "hamkorlik"], terms: ["xizmat", "услуга", "service"] },
};

const STOP_WORDS = new Set([
  "kerak", "qidir", "qidirib", "top", "topib", "ber", "bering", "uchun", "bormi", "bor", "xohlayman", "xoxlayman", "iltimos", "menga", "bizga", "tilida",
  "need", "find", "show", "want", "please", "for", "with", "from", "the", "a", "an",
  "нужен", "нужна", "нужно", "нужны", "найди", "найти", "покажи", "хочу", "есть", "для", "мне", "нам", "пожалуйста", "на", "в", "с", "из",
]);

const DESTINATION_ALIASES: Array<{ keys: string[]; terms: string[] }> = [
  { keys: ["dubai", "dubay", "дубай", "uae", "baa", "amirlik"], terms: ["Dubai", "Dubay", "Дубай", "UAE", "BAA"] },
  { keys: ["misr", "egypt", "египет", "sharm", "hurghada", "xurgada", "хургада"], terms: ["Misr", "Egypt", "Египет", "Sharm", "Hurghada"] },
  { keys: ["turkiya", "turkey", "турция", "antalya", "анталья", "istanbul", "стамбул"], terms: ["Turkiya", "Turkey", "Турция", "Antalya", "Istanbul"] },
  { keys: ["tailand", "thailand", "тайланд", "phuket", "пхукет", "pattaya", "паттайя"], terms: ["Thailand", "Tailand", "Тайланд", "Phuket", "Pattaya"] },
  { keys: ["vietnam", "ветнам", "phu quoc", "phuquoc", "фукуок"], terms: ["Vietnam", "Вьетнам", "Phu Quoc", "Phuquoc", "Фукуок"] },
  { keys: ["maldiv", "maldives", "мальдив"], terms: ["Maldives", "Maldiv", "Мальдивы"] },
  { keys: ["malayziya", "malaysia", "малайзия", "kuala lumpur"], terms: ["Malaysia", "Malayziya", "Малайзия", "Kuala Lumpur"] },
  { keys: ["gruziya", "georgia", "грузия", "tbilisi", "тбилиси", "batumi", "батуми"], terms: ["Georgia", "Gruziya", "Грузия", "Tbilisi", "Batumi"] },
  { keys: ["ozarbayjon", "azerbaijan", "азербайджан", "baku", "баку"], terms: ["Azerbaijan", "Ozarbayjon", "Азербайджан", "Baku"] },
];

const LANGUAGE_ALIASES: Array<{ keys: string[]; terms: string[] }> = [
  { keys: ["ruscha", "rus tili", "russian", "русск"], terms: ["русский", "русскоязычный", "Russian", "ruscha"] },
  { keys: ["ingliz", "english", "англ"], terms: ["English", "английский", "ingliz"] },
  { keys: ["uzbek", "o'zbek", "ozbek", "узбек"], terms: ["o'zbek", "Uzbek", "узбекский"] },
  { keys: ["turk", "turkish", "турец"], terms: ["Turkish", "турецкий", "turk"] },
];

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  қ: "q", ғ: "g", ҳ: "h", ў: "o",
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[ʻ’`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function latinComparable(value: string) {
  return normalize(value)
    .split("")
    .map((char) => CYRILLIC_TO_LATIN[char] ?? char)
    .join("")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function consonantSkeleton(value: string) {
  return latinComparable(value).replace(/[aeiouy'\s-]/g, "");
}

function stripUzbekCaseSuffix(word: string) {
  for (const suffix of ["lardan", "larga", "ning", "dan", "ga", "da", "ni"]) {
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

function collectText(value: unknown, depth = 0): string[] {
  if (depth > 3 || value === null || value === undefined) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectText(item, depth + 1));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap((item) => collectText(item, depth + 1));
  return [];
}

function inferredCategories(message: string) {
  const haystack = normalize(message);
  return Object.entries(CATEGORY_RULES)
    .filter(([, rule]) => rule.terms.some((term) => haystack.includes(normalize(term))))
    .map(([category]) => category);
}

function requestCategories(requests: ServiceRequest[], message: string) {
  const categories = new Set(requests.map((item) => String(item.category || "").trim()).filter(Boolean));
  for (const category of inferredCategories(message)) categories.add(category);
  return [...categories];
}

function requestLocations(requests: ServiceRequest[]) {
  const locations: string[] = [];
  const seen = new Set<string>();
  for (const request of requests) {
    for (const value of [request.destination, request.origin]) {
      if (typeof value !== "string" || !value.trim()) continue;
      const key = normalize(value);
      if (!seen.has(key)) { seen.add(key); locations.push(value.trim()); }
    }
  }
  return locations.slice(0, 8);
}

export function buildAiFeedPostSearchTerms(requests: ServiceRequest[], message: string) {
  const terms: string[] = [];
  const seen = new Set<string>();
  const categories = requestCategories(requests, message);
  const locations = requestLocations(requests);

  for (const location of locations) addTerm(terms, seen, location);

  for (const category of categories) {
    const rule = CATEGORY_RULES[category];
    if (!rule) continue;
    for (const term of rule.terms.slice(0, 2)) addTerm(terms, seen, term);
  }

  const combinedText = [message, ...requests.flatMap((request) => collectText(request))].join(" ");
  const normalizedCombined = normalize(combinedText);
  for (const group of LANGUAGE_ALIASES) {
    if (!group.keys.some((key) => normalizedCombined.includes(normalize(key)))) continue;
    for (const term of group.terms.slice(0, 2)) addTerm(terms, seen, term);
  }

  for (const group of DESTINATION_ALIASES) {
    if (!group.keys.some((key) => normalizedCombined.includes(normalize(key)))) continue;
    for (const term of group.terms.slice(0, 2)) addTerm(terms, seen, term);
  }

  for (const raw of normalizedCombined.match(/[\p{L}\p{N}]+/gu) || []) {
    const word = stripUzbekCaseSuffix(raw);
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    addTerm(terms, seen, word);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }

  return terms.slice(0, MAX_SEARCH_TERMS);
}

// Compatibility helper used by the previous tour-only regression tests and callers.
export function buildTourPostSearchTerms(destination: string, message: string) {
  return buildAiFeedPostSearchTerms([{ category: "Tur paket", destination }], message);
}

function locationScore(row: FeedSearchRow, locations: string[]) {
  if (!locations.length) return 0;
  const rowText = [row.destination, row.origin, row.title, row.body].filter(Boolean).join(" ");
  const comparableRow = latinComparable(rowText);
  const skeletonRow = consonantSkeleton(rowText);
  let best = 0;
  for (const location of locations) {
    const comparable = latinComparable(location);
    const skeleton = consonantSkeleton(location);
    if (comparable.length >= 3 && comparableRow.includes(comparable)) best = Math.max(best, 9);
    else if (skeleton.length >= 3 && skeletonRow.includes(skeleton)) best = Math.max(best, 5);
  }
  return best;
}

function scoreRow(row: FeedSearchRow, terms: string[], categories: string[], locations: string[]) {
  const destination = normalize(row.destination || "");
  const origin = normalize(row.origin || "");
  const title = normalize(row.title || "");
  const body = normalize(row.body || "");
  let score = row.author_is_verified ? 1 : 0;
  if (row.price !== null && row.price !== undefined) score += 0.25;

  for (const category of categories) {
    const rule = CATEGORY_RULES[category];
    if (!rule) continue;
    if (rule.feedCategories.includes(row.category)) score += 6;
    if (rule.terms.some((term) => title.includes(normalize(term)))) score += 4;
    else if (rule.terms.some((term) => body.includes(normalize(term)))) score += 2;
  }

  score += locationScore(row, locations);

  for (const rawTerm of terms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    if (destination === term || origin === term) score += 6;
    else if ((destination && destination.includes(term)) || (origin && origin.includes(term))) score += 4;
    if (title.includes(term)) score += 2.5;
    if (body.includes(term)) score += 1;
  }
  return score;
}

function sanitizeRow(row: FeedSearchRow): AiFeedPostMatch | null {
  if (!row || typeof row.id !== "string" || !FEED_CATEGORIES.has(row.category) || row.status !== "active") return null;
  if (row.expires_at) {
    const expiry = Date.parse(row.expires_at);
    if (Number.isFinite(expiry) && expiry <= Date.now()) return null;
  }
  const numericPrice = row.price === null || row.price === undefined ? null : Number(row.price);
  return {
    id: row.id,
    category: row.category,
    title: typeof row.title === "string" ? row.title.slice(0, 160) : null,
    origin: typeof row.origin === "string" ? row.origin.slice(0, 120) : null,
    destination: typeof row.destination === "string" ? row.destination.slice(0, 120) : null,
    price: Number.isFinite(numericPrice) ? numericPrice : null,
    currency: typeof row.currency === "string" ? row.currency.slice(0, 8) : "",
    author_full_name: typeof row.author_full_name === "string" ? row.author_full_name.slice(0, 120) : null,
    author_company_name: typeof row.author_company_name === "string" ? row.author_company_name.slice(0, 160) : null,
    author_is_verified: row.author_is_verified === true,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function findAiFeedPostMatches({ requests, message, authorization, signal }: SearchArgs) {
  const categories = requestCategories(requests, message);
  if (!categories.length && !requests.length) return [] as AiFeedPostMatch[];

  const terms = buildAiFeedPostSearchTerms(requests, message);
  if (!terms.length) return [] as AiFeedPostMatch[];
  const locations = requestLocations(requests);

  const results = await Promise.allSettled(terms.map(async (term) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_feed_posts`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ p_category: null, p_post_type: null, p_search: term, p_limit: SEARCH_LIMIT, p_offset: 0 }),
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
      if (!sanitizeRow(row)) continue;
      const score = scoreRow(row, terms, categories, locations);
      if (score <= 0) continue;
      const existing = ranked.get(row.id);
      if (!existing || score > existing.score) ranked.set(row.id, { row, score });
    }
  }

  return [...ranked.values()]
    .sort((a, b) => b.score - a.score || Date.parse(b.row.created_at || "") - Date.parse(a.row.created_at || ""))
    .map(({ row }) => sanitizeRow(row))
    .filter((row): row is AiFeedPostMatch => Boolean(row))
    .slice(0, MAX_MATCHES);
}

// Compatibility export: the existing AI route calls this name, but matching is now all-service.
export const findAiTourPostMatches = findAiFeedPostMatches;
