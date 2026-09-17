export type AirportCode = { code: string; city: string };

export const AIRPORT_CODES: AirportCode[] = [
  { code: "TAS", city: "Toshkent" },
  { code: "NMA", city: "Namangan" },
  { code: "AZN", city: "Andijon" },
  { code: "FEG", city: "Farg‘ona" },
  { code: "SKD", city: "Samarqand" },
  { code: "BHK", city: "Buxoro" },
  { code: "UGC", city: "Urganch" },
  { code: "NCU", city: "Nukus" },
  { code: "KSQ", city: "Qarshi" },
  { code: "TMJ", city: "Termiz" },

  { code: "IST", city: "Istanbul" },
  { code: "SAW", city: "Istanbul Sabiha" },
  { code: "DXB", city: "Dubai" },
  { code: "AUH", city: "Abu-Dabi" },
  { code: "SHJ", city: "Sharja" },
  { code: "JED", city: "Jidda" },
  { code: "MED", city: "Madina" },
  { code: "RUH", city: "Ar-Riyod" },
  { code: "DOH", city: "Doha" },
  { code: "CAI", city: "Qohira" },
  { code: "SSH", city: "Sharm ash-Shayx" },
  { code: "AYT", city: "Antaliya" },
  { code: "BKK", city: "Bangkok" },
  { code: "KUL", city: "Kuala-Lumpur" },
];

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
];

export type AviaSuggestion =
  | { type: "airport"; code: string; city: string; tokenStart: number; tokenEnd: number }
  | { type: "template"; command: string; label: string; text: string; tokenStart: number; tokenEnd: number };

const MAX_SUGGESTIONS = 5;

export function getLastToken(value: string, cursorPos: number) {
  const before = value.slice(0, cursorPos);
  const match = /(\S*)$/.exec(before);
  const token = match ? match[1] : "";
  return { token, tokenStart: cursorPos - token.length, tokenEnd: cursorPos };
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

  if (/^[A-Za-z]{2,}$/.test(token)) {
    const upper = token.toUpperCase();
    return AIRPORT_CODES
      .filter((airport) => airport.code.startsWith(upper))
      .slice(0, MAX_SUGGESTIONS)
      .map((airport) => ({ type: "airport" as const, ...airport, tokenStart, tokenEnd }));
  }

  return [];
}
