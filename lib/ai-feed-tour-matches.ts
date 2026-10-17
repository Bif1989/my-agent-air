import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import type { AssistantDraft } from "@/lib/request-assistant";

const MAX_MATCHES = 5;
const MAX_SEARCH_TERMS = 6;

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

type TourRequest = AssistantDraft & { category?: string };

type SearchArgs = {
  requests: TourRequest[];
  message: string;
  authorization: string;
  signal: AbortSignal;
};

const STOP_WORDS = new Set([
  "tur", "turi", "turpaket", "paket", "kerak", "qidir", "qidirib", "top", "topib", "ber", "bering", "uchun", "bormi", "bor", "sayohat", "xohlayman", "xoxlayman",
  "tour", "package", "need", "find", "show", "want", "trip",
  "тур", "пакет", "нужен", "нужна", "нужно", "найди", "найти", "покажи", "хочу", "поездка", "есть", "для",
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

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[ʻ’`´]/g, "'")
    .replace(/[^\p{L}\p{N}\s'-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  if (!cleaned || key.length < 3 || seen.has(key)) return;
  seen.add(key);
  target.push(cleaned);
}

export function buildTourPostSearchTerms(destination: string, message: string) {
  const terms: string[] = [];
  const seen = new Set<string>();
  addTerm(terms, seen, destination);

  const normalizedMessage = normalize(message);
  for (const raw of normalizedMessage.match(/[\p{L}\p{N}]+/gu) || []) {
    const word = stripUzbekCaseSuffix(raw);
    if (word.length < 3 || STOP_WORDS.has(word)) continue;
    addTerm(terms, seen, word);
    if (terms.length >= 3) break;
  }

  const aliasHaystack = `${normalize(destination)} ${normalizedMessage}`;
  for (const group of DESTINATION_ALIASES) {
    if (!group.keys.some((key) => aliasHaystack.includes(key))) continue;
    for (const term of group.terms) addTerm(terms, seen, term);
  }

  return terms.slice(0, MAX_SEARCH_TERMS);
}

function scoreRow(row: FeedSearchRow, terms: string[]) {
  const destination = normalize(row.destination || "");
  const title = normalize(row.title || "");
  const body = normalize(row.body || "");
  let score = row.author_is_verified ? 1 : 0;
  if (row.price !== null && row.price !== undefined) score += 0.25;
  for (const rawTerm of terms) {
    const term = normalize(rawTerm);
    if (!term) continue;
    if (destination === term) score += 8;
    else if (destination && (destination.includes(term) || term.includes(destination))) score += 5;
    if (title.includes(term)) score += 3;
    if (body.includes(term)) score += 1;
  }
  return score;
}

function sanitizeRow(row: FeedSearchRow): AiTourPostMatch | null {
  if (!row || typeof row.id !== "string" || row.category !== "tur_paket" || row.status !== "active") return null;
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

export async function findAiTourPostMatches({ requests, message, authorization, signal }: SearchArgs) {
  const tourRequests = requests.filter((item) => item.category === "Tur paket" && typeof item.destination === "string" && item.destination.trim());
  if (!tourRequests.length) return [] as AiTourPostMatch[];

  const terms: string[] = [];
  const seenTerms = new Set<string>();
  for (const draft of tourRequests) {
    for (const term of buildTourPostSearchTerms(draft.destination || "", message)) addTerm(terms, seenTerms, term);
    if (terms.length >= MAX_SEARCH_TERMS) break;
  }
  if (!terms.length) return [] as AiTourPostMatch[];

  const results = await Promise.allSettled(terms.map(async (term) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/list_feed_posts`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ p_category: "tur_paket", p_post_type: null, p_search: term, p_limit: 8, p_offset: 0 }),
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
      if (!sanitized) continue;
      const score = scoreRow(row, terms);
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
