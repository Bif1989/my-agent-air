import { AIRPORTS } from "@/data/airports";
import { normalizeAirportSearch } from "@/lib/aviation-assist";
import { tashkentDate } from "@/lib/request-freshness";
import type { RequestPayload } from "@/app/requests/requests-api";

export const REQUEST_CATEGORIES = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Gid", "Viza", "Boshqa"];
export type AssistantDraft = Partial<RequestPayload>;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CATEGORY_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: "Aviachipta", pattern: /\b(?:aviachipta|avia|chipta|bilet|reys|flight|air\s*ticket)\b/i },
  { category: "Tur paket", pattern: /\b(?:tur\s*paket|turpaket|tour\s*package|putyovka|paket\s*tur)\b/i },
  { category: "Mehmonxona", pattern: /\b(?:mehmonxona|hotel|otel|gostinitsa|hostel|apartament)\b/i },
  { category: "Transfer", pattern: /\b(?:transfer|taksi|taxi|airport\s*transfer|aeroportdan\s*olib)\b/i },
  { category: "Gid", pattern: /\b(?:gid|guide|ekskursovod)\b/i },
  { category: "Viza", pattern: /\b(?:viza|visa)\b/i },
];

export function detectRequestCategories(text: string) {
  const normalized = normalizeAirportSearch(text.replace(/[–—→]/g, "-"));
  const matches = CATEGORY_PATTERNS.map(({ category, pattern }) => {
    const match = pattern.exec(normalized);
    return match ? { category, index: match.index } : null;
  }).filter((item): item is { category: string; index: number } => Boolean(item));

  if (matches.length) return matches.sort((a, b) => a.index - b.index).map((item) => item.category);
  if (/\b[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}\b/i.test(text)) return ["Aviachipta"];
  return [];
}

export function parseRequestDraft(text: string, previous: AssistantDraft = {}, now = new Date()) {
  const normalized = normalizeAirportSearch(text.replace(/[–—→]/g, "-"));
  const draft: AssistantDraft = { adults: 1, children: 0, infants: 0, currency: "USD", ...previous };
  const notes: string[] = [];

  if (!draft.category) {
    const category = detectRequestCategories(text)[0];
    if (category) draft.category = category;
  }

  const locations: { index: number; city: string; value: string }[] = [];
  for (const airport of AIRPORTS) {
    for (const alias of [airport.code, airport.city, ...(airport.aliases || [])]) {
      const value = normalizeAirportSearch(alias);
      if (!value) continue;
      const match = new RegExp(`(?:^|[\\s-])(${escapeRegex(value)})(?:dan|ga|gacha)?(?=$|[\\s-])`).exec(normalized);
      // AI draftlari har doim to‘liq shahar nomini saqlaydi. Foydalanuvchi TAS, IST, DXB kabi
      // IATA qisqartmalarini yozishi mumkin, lekin so‘rov qoralamasida Toshkent, Istanbul, Dubai ko‘rinadi.
      if (match) locations.push({ index: match.index, city: airport.city, value: airport.city });
    }
  }
  const unique = locations.sort((a, b) => a.index - b.index).filter((item, index, items) => items.findIndex((other) => other.city === item.city) === index);
  if (unique.length > 2) notes.push("Bir nechta yo‘nalish topildi. Formada kerakli yo‘nalishni aniqlashtiring.");
  if (unique.length >= 2) { draft.origin = unique[0].value; draft.destination = unique[1].value; }
  else if (unique.length === 1) {
    if (!draft.origin) draft.origin = unique[0].value;
    else if (!draft.destination && unique[0].value !== draft.origin) draft.destination = unique[0].value;
  }
  if (!draft.category && unique.length >= 2) draft.category = "Aviachipta";

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  const european = text.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
  const monthDate = new RegExp(`(\\d{1,2})[\\s-]+(${months.join("|")})(?:[\\s-]+(20\\d{2}))?`).exec(normalized);
  let date = iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : european ? `${european[3]}-${european[2].padStart(2, "0")}-${european[1].padStart(2, "0")}` : monthDate ? `${monthDate[3] || tashkentDate(now).slice(0, 4)}-${String(months.indexOf(monthDate[2]) + 1).padStart(2, "0")}-${monthDate[1].padStart(2, "0")}` : "";
  if (/\bertaga\b/.test(normalized)) date = tashkentDate(new Date(now.getTime() + 86400000));
  else if (/\bbugun\b/.test(normalized)) date = tashkentDate(now);
  if (date) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < tashkentDate(now)) notes.push("Sana noto‘g‘ri yoki o‘tgan. Yangi sanani kiriting.");
    else draft.travel_date = date;
  }
  const adults = /(\d+)\s*(?:ta\s*)?(?:katta|odam|kishi|yolovchi|adult|vzrosl)/.exec(normalized);
  const children = /(\d+)\s*(?:ta\s*)?(?:bola|child|reben)/.exec(normalized);
  const infants = /(\d+)\s*(?:ta\s*)?(?:godak|chaqaloq|infant)/.exec(normalized);
  if (adults && Number(adults[1]) >= 1 && Number(adults[1]) <= 500) draft.adults = Number(adults[1]);
  if (children && Number(children[1]) <= 500) draft.children = Number(children[1]);
  if (infants && Number(infants[1]) <= 500) draft.infants = Number(infants[1]);
  const money = /\b(\d+(?:[.,]\d{1,2})?)\s*(USD|UZS|EUR|RUB|dollar|doll?ar|som|so‘m)\b/i.exec(text);
  if (money) { draft.budget = Number(money[1].replace(",", ".")); draft.currency = /dollar|dolar/i.test(money[2]) ? "USD" : /som|so‘m/i.test(money[2]) ? "UZS" : money[2].toUpperCase(); }
  const baggage = /\b(\d{1,3})\s*kg\b/i.exec(text);
  if (baggage) draft.baggage = `${baggage[1]} kg`;
  draft.description = [previous.description, text.trim()].filter(Boolean).join("\n").slice(-700);
  const missing = [!draft.category && "xizmat turi", !draft.origin && "qayerdan / shahar", !draft.destination && draft.category === "Aviachipta" && "qayerga", !draft.travel_date && "sana"].filter(Boolean);
  return { draft, notes, missing };
}

export function parseRequestDrafts(text: string, previous: AssistantDraft = {}, now = new Date()) {
  const categories = detectRequestCategories(text);
  if (!categories.length) return [parseRequestDraft(text, previous, now)];
  return categories.map((category) => parseRequestDraft(text, { ...previous, category }, now));
}

// URL input is reconstructed from allowed fields before becoming a request payload.
export function readRequestDraft(value: string | null): AssistantDraft | undefined {
  if (!value || value.length > 6000) return;
  try {
    const input = JSON.parse(value);
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const output: AssistantDraft = {};
    if (REQUEST_CATEGORIES.includes(input.category)) output.category = input.category;
    for (const key of ["origin", "destination", "baggage", "description"] as const) if (typeof input[key] === "string") output[key] = input[key].slice(0, key === "description" ? 1000 : 120);
    if (typeof input.travel_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.travel_date)) output.travel_date = input.travel_date;
    if (["USD", "UZS", "EUR", "RUB"].includes(input.currency)) output.currency = input.currency;
    for (const key of ["adults", "children", "infants"] as const) if (Number.isInteger(input[key]) && input[key] >= (key === "adults" ? 1 : 0) && input[key] <= 500) output[key] = input[key];
    if (typeof input.budget === "number" && Number.isFinite(input.budget) && input.budget >= 0) output.budget = input.budget;
    return output;
  } catch { return; }
}
