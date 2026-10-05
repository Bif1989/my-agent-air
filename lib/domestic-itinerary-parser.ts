import { normalizeAirportSearch } from "@/lib/aviation-assist";
import { joinServiceDetails } from "@/lib/request-details";
import { parseRequestDraft } from "@/lib/request-assistant";
import { UZBEKISTAN_DESTINATIONS } from "@/lib/uzbekistan-tourism";

export type DomesticItineraryDraft = ReturnType<typeof parseRequestDraft>;

type CityMention = { index: number; end: number; city: string; suffix: "from" | "to" | "" };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalize = (value: string) => normalizeAirportSearch(value.replace(/[ʻ’`´]/g, "'").replace(/[–—→]/g, "-")).toLowerCase();

function cityMentions(text: string) {
  const normalized = normalize(text);
  const mentions: CityMention[] = [];
  for (const destination of UZBEKISTAN_DESTINATIONS) {
    for (const alias of [destination.name, ...destination.aliases]) {
      const value = normalize(alias);
      if (!value) continue;
      const pattern = new RegExp(`(?:^|[\\s,+/;:()\\-])(${escapeRegex(value)})(dan|da|ga|gacha|дан|да|га)?(?=$|[\\s,+/;:.()\\-])`, "gi");
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(normalized))) {
        const ending = (match[2] || "").toLowerCase();
        const suffix = ending === "dan" || ending === "дан" ? "from" : ending === "ga" || ending === "gacha" || ending === "га" ? "to" : "";
        mentions.push({ index: match.index, end: pattern.lastIndex, city: destination.name, suffix });
      }
    }
  }
  return mentions.sort((a, b) => a.index - b.index || a.end - b.end).filter((item, index, items) => {
    return items.findIndex((other) => other.index === item.index && other.city === item.city) === index;
  });
}

function parseBudget(segment: string) {
  const value = normalize(segment);
  const uzs = /(\d+(?:[.,]\d+)?)\s*(ming|mln|million)?\s*(?:so['’`]?m|som|sum|uzs|сум)(?:dan|дан)?/i.exec(value);
  if (uzs) {
    const base = Number(uzs[1].replace(",", "."));
    const multiplier = uzs[2] === "ming" ? 1_000 : uzs[2] === "mln" || uzs[2] === "million" ? 1_000_000 : 1;
    return { budget: base * multiplier, currency: "UZS" };
  }
  const foreign = /(\d+(?:[.,]\d+)?)\s*(usd|eur|rub|dollar|dolar|доллар)/i.exec(value);
  if (foreign) {
    const currency = /eur/i.test(foreign[2]) ? "EUR" : /rub/i.test(foreign[2]) ? "RUB" : "USD";
    return { budget: Number(foreign[1].replace(",", ".")), currency };
  }
  return null;
}

function parseNights(segment: string) {
  const match = /(\d+)\s*(?:kecha|kechaga|kechaга|tun|tunga|night|nights|ноч(?:ь|и|ей)?)/i.exec(normalize(segment));
  return match ? Math.max(1, Math.min(365, Number(match[1]))) : 0;
}

function hotelScore(segment: string) {
  const value = normalize(segment);
  let score = 0;
  if (/(mehmonxona|mexmonxona|hotel|otel|gostinitsa|гостиница|отель|hostel)/i.test(value)) score += 4;
  if (parseNights(value)) score += 3;
  if (parseBudget(value)) score += 2;
  if (/(nonushta|zavtrak|breakfast|завтрак)/i.test(value)) score += 1;
  return score;
}

function addDays(date: string | null | undefined, days: number) {
  if (!date || !days) return date || undefined;
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function missingFor(draft: DomesticItineraryDraft["draft"], extra: string[] = []) {
  return [!draft.origin && !draft.destination ? "shahar / yo‘nalish" : "", !draft.travel_date ? "sana" : "", ...extra].filter(Boolean) as string[];
}

export function parseDomesticItineraryRequests(text: string, now = new Date()): DomesticItineraryDraft[] {
  const mentions = cityMentions(text);
  const uniqueCities = mentions.filter((item, index, items) => items.findIndex((other) => other.city === item.city) === index);
  if (uniqueCities.length < 2) return [];

  const normalized = normalize(text);
  const base = parseRequestDraft(text, {}, now).draft;
  const adults = base.adults || 1;
  const children = base.children || 0;
  const infants = base.infants || 0;
  const travelDate = base.travel_date;

  const explicitOrigins = mentions.filter((item) => item.suffix === "from");
  const origin = explicitOrigins[0]?.city || uniqueCities[0]?.city || null;

  const serviceStart = normalized.search(/(?:bizga|kerak|miniven|minivan|mikroavtobus|avtobus|transport|transfer|mehmonxona|mexmonxona|hotel|otel|гостиница|отель)/i);
  const introEnd = serviceStart >= 0 ? serviceStart : Math.min(normalized.length, 220);
  const introCities = uniqueCities.filter((item) => item.index <= introEnd).map((item) => item.city);
  let routeCities = introCities.filter((city) => city !== origin);
  if (!routeCities.length) routeCities = uniqueCities.map((item) => item.city).filter((city) => city !== origin);
  routeCities = routeCities.filter((city, index, items) => items.indexOf(city) === index);

  const results: DomesticItineraryDraft[] = [];
  const vehicleMatch = /(miniven|minivan|mikroavtobus|sprinter|staria|avtobus|bus|transport|transfer|mashina|avtomobil|транспорт|минив[эе]н|автобус)/i.exec(normalized);
  if (vehicleMatch && routeCities.length) {
    const vehicle = /miniven|minivan|минив/i.test(vehicleMatch[0]) ? "Miniven" : /sprinter/i.test(vehicleMatch[0]) ? "Sprinter" : /staria/i.test(vehicleMatch[0]) ? "Hyundai Staria" : /avtobus|bus|автобус/i.test(vehicleMatch[0]) ? "Avtobus" : vehicleMatch[0];
    const destination = routeCities.join(" + ");
    const route = [origin, ...routeCities].filter(Boolean).join(" → ");
    const descriptionText = [`Marshrut: ${route}.`, `${adults} kishi uchun ${vehicle.toLowerCase()} kerak.`].join(" ");
    const description = joinServiceDetails(descriptionText, "Transfer", { rooms: "", nights: "", vehicle, language: "" });
    const draft = {
      category: "Transfer",
      origin,
      destination,
      travel_date: travelDate || null,
      adults,
      children,
      infants,
      baggage: null,
      budget: null,
      currency: "UZS",
      description,
    };
    results.push({ draft, notes: [], missing: missingFor(draft) });
  }

  let accumulatedNights = 0;
  for (const city of routeCities) {
    const cityOccurrences = mentions.filter((item) => item.city === city);
    let bestSegment = "";
    let bestScore = 0;
    for (const occurrence of cityOccurrences) {
      const next = mentions.find((item) => item.index > occurrence.index && item.city !== city);
      const end = next?.index ?? Math.min(normalized.length, occurrence.index + 420);
      const segment = normalized.slice(occurrence.index, Math.min(end, occurrence.index + 420));
      const score = hotelScore(segment);
      if (score > bestScore) { bestScore = score; bestSegment = segment; }
    }
    if (bestScore < 2) continue;

    const nights = parseNights(bestSegment);
    const budgetData = parseBudget(bestSegment);
    const breakfast = /(nonushta|zavtrak|breakfast|завтрак)/i.test(bestSegment);
    const perPerson = /(kishi boshiga|odam boshiga|per person|na cheloveka|на человека|киши бошига)/i.test(bestSegment);
    const details: string[] = [`${adults} kishi`];
    if (nights) details.push(`${nights} kecha`);
    if (breakfast) details.push("nonushta bilan");
    if (budgetData) details.push(`budjet ${Math.round(budgetData.budget).toLocaleString("en-US")} ${budgetData.currency}${perPerson ? " kishi boshiga" : ""}`);
    const description = joinServiceDetails(details.join(". ") + ".", "Mehmonxona", { rooms: "", nights: nights ? String(nights) : "", vehicle: "", language: "" });
    const draft = {
      category: "Mehmonxona",
      origin: city,
      destination: null,
      travel_date: addDays(travelDate, accumulatedNights) || null,
      adults,
      children,
      infants,
      baggage: null,
      budget: budgetData?.budget ?? null,
      currency: budgetData?.currency || "UZS",
      description,
    };
    const extraMissing = nights ? ["xonalar soni"] : ["tunlar soni", "xonalar soni"];
    results.push({ draft, notes: [], missing: missingFor(draft, extraMissing) });
    if (nights) accumulatedNights += nights;
  }

  return results.length >= 2 ? results.slice(0, 12) : [];
}