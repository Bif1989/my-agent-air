import { AIRPORTS } from "@/data/airports";
import { normalizeAirportSearch } from "@/lib/aviation-assist";
import { tashkentDate } from "@/lib/request-freshness";
import { detectDomesticDestinations, isUzbekistanDomesticTourism } from "@/lib/uzbekistan-tourism";
import type { RequestPayload } from "@/app/requests/requests-api";
import { hydrateServiceRequest, isCalendarDate, sanitizeServiceData } from "@/lib/service-request";

export const REQUEST_CATEGORIES = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Gid", "Viza", "Boshqa"];
export type AssistantDraft = Partial<RequestPayload>;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CATEGORY_PATTERNS: Array<{ category: string; pattern: RegExp }> = [
  { category: "Aviachipta", pattern: /(?:\b(?:aviachipta|avia|chipta|bilet|reys|flight|air\s*ticket)\b|авиачипта|\bавиа\b|чипта|билет|рейс)/i },
  { category: "Tur paket", pattern: /(?:\b(?:tur\s*paket|turpaket|tour\s*package|putyovka|paket\s*tur)\b|тур\s*пакет|турпакет|пут[её]вка)/i },
  { category: "Mehmonxona", pattern: /(?:\b(?:mehmonxona|hotel|otel|gostinitsa|hostel|apartament)\b|ме[ҳх]монхона|отель|гостиница|хостел|апартамент)/i },
  { category: "Transfer", pattern: /(?:\b(?:transfer|taksi|taxi|airport\s*transfer|aeroportdan\s*olib)\b|трансфер|такси)/i },
  { category: "Gid", pattern: /(?:\b(?:gid|guide|ekskursovod)\b|\bгид\b|экскурсовод)/i },
  { category: "Viza", pattern: /(?:\b(?:viza|visa)\b|виза)/i },
];

const MONTH_ALIASES: Array<{ month: number; aliases: string[] }> = [
  { month: 1, aliases: ["yanvar", "yanv", "январь", "января", "янв", "january", "jan"] },
  { month: 2, aliases: ["fevral", "fev", "февраль", "февраля", "фев", "february", "feb"] },
  { month: 3, aliases: ["mart", "март", "марта", "march", "mar"] },
  { month: 4, aliases: ["aprel", "apr", "апрель", "апреля", "апр", "april"] },
  { month: 5, aliases: ["may", "май", "мая"] },
  { month: 6, aliases: ["iyun", "июнь", "июня", "июн", "june", "jun"] },
  { month: 7, aliases: ["iyul", "июль", "июля", "июл", "july", "jul"] },
  { month: 8, aliases: ["avgust", "avg", "август", "августа", "авг", "august", "aug"] },
  { month: 9, aliases: ["sentabr", "sentyabr", "sent", "сентябрь", "сентября", "сен", "september", "sept", "sep"] },
  { month: 10, aliases: ["oktabr", "oktyabr", "okt", "октябрь", "октября", "окт", "october", "oct"] },
  { month: 11, aliases: ["noyabr", "noy", "ноябрь", "ноября", "ноя", "november", "nov"] },
  { month: 12, aliases: ["dekabr", "dek", "декабрь", "декабря", "дек", "december", "dec"] },
];

const MONTH_LOOKUP = new Map<string, number>();
for (const item of MONTH_ALIASES) for (const alias of item.aliases) MONTH_LOOKUP.set(alias.toLowerCase(), item.month);
const MONTH_PATTERN = Array.from(MONTH_LOOKUP.keys()).sort((a, b) => b.length - a.length).map(escapeRegex).join("|");
const ROUTE_CODE_PATTERN = /\b[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}\b/gi;

function validDate(year: number, month: number, day: number) {
  const value = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : "";
}

function inferYearDate(day: number, month: number, explicitYear: number | undefined, now: Date) {
  if (explicitYear) return validDate(explicitYear, month, day);
  const today = tashkentDate(now);
  const currentYear = Number(today.slice(0, 4));
  const thisYear = validDate(currentYear, month, day);
  if (!thisYear) return "";
  return thisYear >= today ? thisYear : validDate(currentYear + 1, month, day);
}

function parseTravelDate(text: string, normalized: string, now: Date) {
  if (/\bertaga\b|эртага/.test(normalized)) return { date: tashkentDate(new Date(now.getTime() + 86400000)), invalid: false };
  if (/\bbugun\b|бугун/.test(normalized)) return { date: tashkentDate(now), invalid: false };

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return { date, invalid: !date };
  }

  const fullNumeric = text.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/);
  if (fullNumeric) {
    const date = validDate(Number(fullNumeric[3]), Number(fullNumeric[2]), Number(fullNumeric[1]));
    return { date, invalid: !date };
  }

  const monthDate = new RegExp(`(\\d{1,2})\\s*(${MONTH_PATTERN})(?:[.\\s-]*(20\\d{2}))?(?![A-Za-zА-Яа-яЁё])`, "i").exec(normalized);
  if (monthDate) {
    const month = MONTH_LOOKUP.get(monthDate[2].toLowerCase());
    const date = month ? inferYearDate(Number(monthDate[1]), month, monthDate[3] ? Number(monthDate[3]) : undefined, now) : "";
    return { date, invalid: !date };
  }

  const shortNumeric = text.match(/\b(\d{1,2})[./](\d{1,2})(?![./]\d)/);
  if (shortNumeric) {
    const date = inferYearDate(Number(shortNumeric[1]), Number(shortNumeric[2]), undefined, now);
    return { date, invalid: !date };
  }

  return { date: "", invalid: false };
}

function splitRequestSegments(text: string) {
  const clean = text.trim();
  if (!clean) return [];

  const explicit = clean.split(/[;|]+/).map((item) => item.replace(/^\s*\d+[.)-]\s*/, "").trim()).filter(Boolean);
  if (explicit.length > 1) return explicit.slice(0, 12);

  const lines = clean.split(/\n+/).map((item) => item.replace(/^\s*\d+[.)-]\s*/, "").trim()).filter(Boolean);
  if (lines.length > 1) {
    const requestLines = lines.filter((line) => {
      ROUTE_CODE_PATTERN.lastIndex = 0;
      const hasRoute = ROUTE_CODE_PATTERN.test(line);
      ROUTE_CODE_PATTERN.lastIndex = 0;
      return hasRoute || detectRequestCategories(line).length > 0 || isUzbekistanDomesticTourism(line);
    });
    if (requestLines.length >= 2 && requestLines.length === lines.length) return lines.slice(0, 12);
  }

  ROUTE_CODE_PATTERN.lastIndex = 0;
  const starts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = ROUTE_CODE_PATTERN.exec(clean))) starts.push(match.index);
  ROUTE_CODE_PATTERN.lastIndex = 0;
  if (starts.length <= 1) return [clean];

  const prefix = clean.slice(0, starts[0]).trim().replace(/[,:-]+$/, "").trim();
  const prefixHasService = detectRequestCategories(prefix).length > 0;
  return starts.slice(0, 12).map((start, index) => {
    const end = starts[index + 1] ?? clean.length;
    const segment = clean.slice(start, end).replace(/^[,\s]+|[,\s]+$/g, "").trim();
    return prefixHasService ? `${prefix} ${segment}` : segment;
  }).filter(Boolean);
}

export function detectRequestCategories(text: string) {
  const normalized = normalizeAirportSearch(text.replace(/[–—→]/g, "-"));
  const matches = CATEGORY_PATTERNS.map(({ category, pattern }) => {
    const match = pattern.exec(normalized);
    return match ? { category, index: match.index } : null;
  }).filter((item): item is { category: string; index: number } => Boolean(item));

  if (matches.length) return matches.sort((a, b) => a.index - b.index).map((item) => item.category);
  ROUTE_CODE_PATTERN.lastIndex = 0;
  const hasRoute = ROUTE_CODE_PATTERN.test(text);
  ROUTE_CODE_PATTERN.lastIndex = 0;
  if (hasRoute) return ["Aviachipta"];
  return [];
}

export function parseRequestDraft(text: string, previous: AssistantDraft = {}, now = new Date()) {
  const normalized = normalizeAirportSearch(text.replace(/[–—→]/g, "-"));
  const draft: AssistantDraft = { adults: 1, children: 0, infants: 0, currency: "USD", ...previous };
  const notes: string[] = [];
  const domestic = detectDomesticDestinations(text);

  if (!draft.category) {
    const category = detectRequestCategories(text)[0];
    if (category) draft.category = category;
    else if (domestic.length) draft.category = "Tur paket";
  }

  const locations: { index: number; city: string; role: "from" | "to" | "" }[] = [];
  for (const airport of AIRPORTS) {
    for (const alias of [airport.code, airport.city, ...(airport.aliases || [])]) {
      const value = normalizeAirportSearch(alias);
      if (!value) continue;
      const match = new RegExp(`(?:^|[\\s,;:-])(${escapeRegex(value)})(dan|ga|gacha)?(?=$|[\\s,;:.-])`).exec(normalized);
      if (!match) continue;
      const ending = (match[2] || "").toLowerCase();
      const role = ending === "dan" ? "from" : ending === "ga" || ending === "gacha" ? "to" : "";
      locations.push({ index: match.index, city: airport.city, role });
    }
  }
  for (const item of domestic) locations.push({ index: item.index, city: item.destination.name, role: item.suffix });

  const unique = locations.sort((a, b) => a.index - b.index).filter((item, index, items) => items.findIndex((other) => other.city === item.city) === index);
  if (unique.length > 2) notes.push("Bir nechta yo‘nalish topildi. Alohida so‘rovlar sifatida yozish uchun ularni nuqtali vergul bilan ajrating.");

  const explicitFrom = unique.find((item) => item.role === "from");
  const explicitTo = unique.find((item) => item.role === "to");
  if (explicitFrom) draft.origin = explicitFrom.city;
  if (explicitTo) draft.destination = explicitTo.city;

  if (!explicitFrom && !explicitTo && unique.length >= 2) {
    draft.origin = unique[0].city;
    draft.destination = unique[1].city;
  } else if (unique.length === 1) {
    const only = unique[0];
    if (only.role === "from") draft.origin = only.city;
    else if (only.role === "to" || (domestic.length && draft.category !== "Aviachipta")) draft.destination = only.city;
    else if (!draft.origin) draft.origin = only.city;
  } else {
    if (!draft.origin) {
      const fallbackOrigin = unique.find((item) => item.city !== draft.destination);
      if (fallbackOrigin && fallbackOrigin.role !== "to") draft.origin = fallbackOrigin.city;
    }
    if (!draft.destination) {
      const fallbackDestination = unique.find((item) => item.city !== draft.origin);
      if (fallbackDestination && fallbackDestination.role !== "from") draft.destination = fallbackDestination.city;
    }
  }

  const parsedDate = parseTravelDate(text, normalized, now);
  if (parsedDate.invalid) notes.push("Sana noto‘g‘ri. Kun va oyni tekshiring.");
  else if (parsedDate.date) {
    if (parsedDate.date < tashkentDate(now)) notes.push("Sana o‘tgan. Yangi sanani kiriting.");
    else draft.travel_date = parsedDate.date;
  }

  const adults = /(\d+)\s*(?:ta\s*)?(?:katta|odam|kishi|yolovchi|adult|vzrosl|киши|одам|взросл|человек)/.exec(normalized);
  const children = /(\d+)\s*(?:ta\s*)?(?:bola|child|reben|бола|реб[её]н)/.exec(normalized);
  const infants = /(\d+)\s*(?:ta\s*)?(?:godak|chaqaloq|infant|г[ўу]дак|младен)/.exec(normalized);
  if (adults && Number(adults[1]) >= 1 && Number(adults[1]) <= 500) draft.adults = Number(adults[1]);
  if (children && Number(children[1]) <= 500) draft.children = Number(children[1]);
  if (infants && Number(infants[1]) <= 500) draft.infants = Number(infants[1]);

  const money = /\b(\d+(?:[.,]\d{1,2})?)\s*(USD|UZS|EUR|RUB|dollar|doll?ar|som|so‘m|доллар|сум)\b/i.exec(text);
  if (money) {
    draft.budget = Number(money[1].replace(",", "."));
    draft.currency = /dollar|dolar|доллар/i.test(money[2]) ? "USD" : /som|so‘m|сум/i.test(money[2]) ? "UZS" : money[2].toUpperCase();
  }
  const baggage = /\b(\d{1,3})\s*(?:kg|кг)\b/i.exec(text);
  if (baggage) draft.baggage = `${baggage[1]} kg`;

  draft.description = [previous.description, text.trim()].filter(Boolean).join("\n").slice(-700);
  const missing = [!draft.category && "xizmat turi", !draft.origin && "qayerdan / shahar", !draft.destination && (draft.category === "Aviachipta" || draft.category === "Tur paket") && "qayerga", !draft.travel_date && "sana"].filter(Boolean);
  return { draft, notes, missing };
}

export function parseRequestDrafts(text: string, previous: AssistantDraft = {}, now = new Date()) {
  const segments = splitRequestSegments(text);
  if (!segments.length) return [parseRequestDraft(text, previous, now)];
  const globalCategories = detectRequestCategories(text);
  const results: ReturnType<typeof parseRequestDraft>[] = [];

  for (const segment of segments) {
    const segmentCategories = detectRequestCategories(segment);
    const categories = segmentCategories.length ? segmentCategories : globalCategories;
    if (!categories.length) {
      results.push(parseRequestDraft(segment, previous, now));
      continue;
    }
    for (const category of categories) {
      results.push(parseRequestDraft(segment, { ...previous, category }, now));
      if (results.length >= 12) return results;
    }
  }
  return results;
}

export function readRequestDraft(value: string | null): AssistantDraft | undefined {
  if (!value || value.length > 16000) return;
  try {
    const input = JSON.parse(value);
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const output: AssistantDraft = {};
    if (REQUEST_CATEGORIES.includes(input.category)) output.category = input.category;
    for (const key of ["origin", "destination", "baggage", "description"] as const) if (typeof input[key] === "string") output[key] = input[key].slice(0, key === "description" ? 1000 : 120);
    if (isCalendarDate(input.travel_date)) output.travel_date = input.travel_date;
    if (["USD", "UZS", "EUR", "RUB"].includes(input.currency)) output.currency = input.currency;
    for (const key of ["adults", "children", "infants"] as const) if (Number.isInteger(input[key]) && input[key] >= (key === "adults" ? 1 : 0) && input[key] <= 500) output[key] = input[key];
    if (typeof input.budget === "number" && Number.isFinite(input.budget) && input.budget >= 0) output.budget = input.budget;
    if (input.service_details && output.category) output.service_details = sanitizeServiceData(output.category, input.service_details);
    return input.service_details || input.description?.includes("Xizmat tafsilotlari:") ? hydrateServiceRequest(output) : output;
  } catch { return; }
}
