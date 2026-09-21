import { AIRPORTS, type AirportReference } from "@/data/airports";

export type AirportCode = { code: string; city: string; airport?: string; country?: string };

export type AviaTemplate = { command: string; label: string; text: string };

export const AVIA_TEMPLATES: AviaTemplate[] = [
  {
    command: "/avia",
    label: "Avia so‘rov",
    text: "✈️ AVIA SO‘ROV\nYo‘nalish:\nSana:\nYo‘lovchi:\nBagaj:\nOW / RT:\nByudjet:\nIzoh:",
  },
  {
    command: "/pnr",
    label: "PNR ma’lumoti",
    text: "🎫 PNR\nPNR:\nYo‘lovchi:\nYo‘nalish:\nReys:\nSana:\nStatus:\nBagaj:",
  },
  {
    command: "/refund",
    label: "Qaytarish",
    text: "↩️ QAYTARISH\nPNR:\nBilet №:\nYo‘lovchi:\nSabab:\nIzoh:",
  },
  {
    command: "/reissue",
    label: "Qayta rasmiylashtirish",
    text: "🔄 QAYTA RASMIYLASHTIRISH\nPNR:\nBilet №:\nYo‘lovchi:\nEski sana/reys:\nYangi sana/reys:\nIzoh:",
  },
  {
    command: "/price",
    label: "Narx so‘rovi",
    text: "✈️ NARX SO‘ROVI\nYo‘nalish:\nSana:\nYo‘lovchi:\nBagaj:\nOW / RT:\nIzoh:",
  },
  {
    command: "/seat",
    label: "Joy so‘rovi",
    text: "💺 JOY SO‘ROVI\nPNR:\nReys:\nSana:\nYo‘lovchi:\nSo‘ralgan joy:",
  },
  {
    command: "/baggage",
    label: "Bagaj so‘rovi",
    text: "🧳 BAGAJ\nPNR:\nYo‘lovchi:\nReys:\nBagaj:\nQo‘shimcha bagaj:\nIzoh:",
  },
  {
    command: "/change",
    label: "Sana/reys o‘zgartirish",
    text: "🔄 SANA/REYS O‘ZGARTIRISH\nPNR:\nBilet №:\nYo‘lovchi:\nEski reys/sana:\nYangi reys/sana:\nIzoh:",
  },
  {
    command: "/visa",
    label: "Sayohat/viza so‘rovi",
    text: "🌍 SAYOHAT/VIZA SO‘ROVI\nDavlat:\nSafar sanasi:\nYo‘lovchilar:\nViza holati:\nMehmonxona:\nIzoh:",
  },
];

export type AviaSuggestion =
  | { type: "airport"; code: string; city: string; airport?: string; country: string; tokenStart: number; tokenEnd: number }
  | { type: "template"; command: string; label: string; text: string; tokenStart: number; tokenEnd: number };

const MAX_SUGGESTIONS = 6;

const CYRILLIC_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  қ: "q", ғ: "g", ў: "u", ҳ: "h",
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ё: "Yo", Ж: "J", З: "Z", И: "I", Й: "Y", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T", У: "U", Ф: "F", Х: "H", Ц: "Ts", Ч: "Ch", Ш: "Sh", Щ: "Sch", Ы: "I", Э: "E", Ю: "Yu", Я: "Ya",
  Қ: "Q", Ғ: "G", Ў: "U", Ҳ: "H"
};

function stripDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function transliterateCyrillic(value: string) {
  return value.split("").map((character) => CYRILLIC_MAP[character] ?? character).join("");
}

export function normalizeAirportSearch(text: string) {
  const raw = text ?? "";
  const simplified = stripDiacritics(raw)
    .replace(/[’'`]/g, "")
    .replace(/[\u2018\u2019]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  return transliterateCyrillic(simplified)
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getLastToken(value: string, cursorPos: number) {
  const before = value.slice(0, cursorPos);
  const match = /([^\s/]+)$/u.exec(before);
  const rawToken = match ? match[1] : "";
  const token = rawToken.replace(/[.,;:!?]+$/g, "");
  return { token, tokenStart: cursorPos - rawToken.length, tokenEnd: cursorPos };
}

function getAirportSearchEntries(query: string) {
  const normalizedQuery = normalizeAirportSearch(query);
  if (!normalizedQuery) return [];

  const matches: Array<AirportReference & { score: number }> = [];

  for (const airport of AIRPORTS) {
    const code = airport.code.toUpperCase();
    const codeNorm = normalizeAirportSearch(code);
    const airportNorm = normalizeAirportSearch(airport.airport ?? "");
    const countryNorm = normalizeAirportSearch(airport.country);
    const aliasValues = (airport.aliases ?? []).map((alias) => normalizeAirportSearch(alias));
    const cityAliases = [normalizeAirportSearch(airport.city), ...aliasValues];

    let score: number | null = null;
    if (codeNorm === normalizedQuery) score = 0;
    else if (codeNorm.startsWith(normalizedQuery)) score = 1;
    else if (cityAliases.some((value) => value === normalizedQuery)) score = 2;
    else if (cityAliases.some((value) => value.startsWith(normalizedQuery))) score = 3;
    else if (airportNorm.includes(normalizedQuery) || countryNorm.includes(normalizedQuery) || aliasValues.some((value) => value.includes(normalizedQuery))) score = 4;

    if (score !== null) {
      matches.push({ ...airport, code, score });
    }
  }

  return matches.sort((left, right) => left.score - right.score || left.code.localeCompare(right.code));
}

export function searchAirports(query: string, limit = 6) {
  if (!query || !query.trim()) return [];
  return getAirportSearchEntries(query)
    .slice(0, limit)
    .map((airport) => ({
      code: airport.code,
      city: airport.city,
      airport: airport.airport,
      country: airport.country,
    }));
}

export function computeAviaSuggestions(value: string, cursorPos: number): AviaSuggestion[] {
  const { token, tokenStart, tokenEnd } = getLastToken(value, cursorPos);
  if (!token) return [];

  if (token.startsWith("/")) {
    const lower = token.toLowerCase();
    return AVIA_TEMPLATES
      .filter((template) => template.command.startsWith(lower))
      .slice(0, MAX_SUGGESTIONS)
      .map((template) => ({ type: "template" as const, ...template, tokenStart, tokenEnd }));
  }

  return searchAirports(token, MAX_SUGGESTIONS).map((airport) => ({ type: "airport" as const, ...airport, tokenStart, tokenEnd }));
}
