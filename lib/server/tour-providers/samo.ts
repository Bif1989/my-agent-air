import type { TourOffer, TourProvider, TourSearchInput, TourSearchResult } from "@/lib/tour-providers/types";

const SAMO_EXPORT_FILE = "export/default.php";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

type UnknownRecord = Record<string, unknown>;

type SamoConfig = {
  baseUrl: string;
  oauthToken: string;
  apiVersion: string;
  timeoutMs: number;
  maxResponseBytes: number;
};

export class SamoProviderError extends Error {
  constructor(
    public readonly code:
      | "SAMO_NOT_CONFIGURED"
      | "SAMO_INVALID_CONFIG"
      | "SAMO_TIMEOUT"
      | "SAMO_REQUEST_FAILED"
      | "SAMO_BAD_RESPONSE"
      | "SAMO_RESPONSE_TOO_LARGE",
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = "SamoProviderError";
  }
}

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : null;
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function number(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveFlag(value: unknown) {
  if (value === true || value === 1) return true;
  const normalized = text(value).toUpperCase();
  return normalized === "1" || normalized === "Y" || normalized === "YES" || normalized === "TRUE";
}

function blockingFlag(value: unknown) {
  if (value == null || value === false || value === 0) return false;
  const normalized = text(value).toUpperCase();
  return Boolean(normalized) && !["0", "N", "NO", "FALSE"].includes(normalized);
}

function samoDate(value: string) {
  const normalized = value.trim();
  if (/^\d{8}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized.replaceAll("-", "");
  throw new SamoProviderError("SAMO_BAD_RESPONSE", "SAMO qidiruv sanasi noto‘g‘ri formatda.", 422);
}

function isoDate(value: unknown) {
  const normalized = text(value);
  if (/^\d{8}$/.test(normalized)) {
    return `${normalized.slice(0, 4)}-${normalized.slice(4, 6)}-${normalized.slice(6, 8)}`;
  }
  return normalized;
}

function boundedInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

export function getSamoConfig(): SamoConfig | null {
  const baseUrl = process.env.SAMO_BASE_URL?.trim() || "";
  const oauthToken = process.env.SAMO_OAUTH_TOKEN?.trim() || "";
  if (!baseUrl || !oauthToken) return null;

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new SamoProviderError("SAMO_INVALID_CONFIG", "SAMO_BASE_URL yaroqli URL emas.", 503);
  }
  if (parsed.protocol !== "https:") {
    throw new SamoProviderError("SAMO_INVALID_CONFIG", "SAMO_BASE_URL HTTPS bo‘lishi kerak.", 503);
  }

  return {
    baseUrl,
    oauthToken,
    apiVersion: process.env.SAMO_API_VERSION?.trim() || "1.0",
    timeoutMs: boundedInteger(process.env.SAMO_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
    maxResponseBytes: boundedInteger(process.env.SAMO_MAX_RESPONSE_BYTES, DEFAULT_MAX_RESPONSE_BYTES, 8 * 1024 * 1024),
  };
}

function exportEndpoint(baseUrl: string) {
  const url = new URL(baseUrl);
  const cleanPath = url.pathname.replace(/\/+$/, "");
  if (!cleanPath.endsWith(`/${SAMO_EXPORT_FILE}`) && cleanPath !== `/${SAMO_EXPORT_FILE}`) {
    url.pathname = `${cleanPath}/${SAMO_EXPORT_FILE}`.replace(/\/{2,}/g, "/");
  }
  url.search = "";
  url.hash = "";
  return url;
}

export function buildSamoApiUrl(config: Pick<SamoConfig, "baseUrl" | "oauthToken" | "apiVersion">, action: string, params: Record<string, string | number> = {}) {
  if (!/^[A-Za-z][A-Za-z0-9_]+$/.test(action)) {
    throw new SamoProviderError("SAMO_INVALID_CONFIG", "SAMO API action nomi yaroqsiz.", 500);
  }
  const url = exportEndpoint(config.baseUrl);
  url.searchParams.set("samo_action", "api");
  url.searchParams.set("version", config.apiVersion);
  url.searchParams.set("type", "json");
  url.searchParams.set("oauth_token", config.oauthToken);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    const normalized = String(value).trim();
    if (normalized) url.searchParams.set(key, normalized);
  }
  return url;
}

export function buildSamoSearchParams(input: TourSearchInput) {
  const params: Record<string, string | number> = {
    TOWNFROMINC: input.departureTownId,
    STATEINC: input.destinationStateId,
    CHECKIN_BEG: samoDate(input.checkInFrom),
    CHECKIN_END: samoDate(input.checkInTo || input.checkInFrom),
    NIGHTS_FROM: input.nightsFrom,
    NIGHTS_TILL: input.nightsTo ?? input.nightsFrom,
    ADULT: input.adults,
    CHILD: input.children ?? input.childAges?.length ?? 0,
  };
  if (input.childAges?.length) params.AGES = input.childAges.join(",");
  if (input.currencyId) params.CURRENCYINC = input.currencyId;
  if (input.tourIds?.length) params.TOURS = input.tourIds.join(",");
  if (input.hotelIds?.length) params.HOTELS = input.hotelIds.join(",");
  if (input.mealIds?.length) params.MEALS = input.mealIds.join(",");
  if (input.roomIds?.length) params.ROOMS = input.roomIds.join(",");
  return params;
}

function priceRows(payload: unknown) {
  const envelope = record(payload);
  if (!envelope) return [];
  const root = envelope.SearchTour_PRICES ?? envelope.searchTourPrices ?? envelope;
  if (Array.isArray(root)) return root.map(record).filter((item): item is UnknownRecord => Boolean(item));
  const rootRecord = record(root);
  if (!rootRecord) return [];
  const prices = rootRecord.prices ?? rootRecord.PRICES ?? rootRecord.price ?? rootRecord.PRICE;
  if (prices == null) return [];
  const pricesRecord = record(prices);
  const rows = pricesRecord ? pricesRecord.price ?? pricesRecord.PRICE ?? prices : prices;
  return list(rows).map(record).filter((item): item is UnknownRecord => Boolean(item));
}

function offerId(row: UnknownRecord, price: number, currency: string) {
  const direct = text(row.id);
  if (direct) return direct;
  return [row.tourKey, row.hotelKey, row.checkIn, row.nights, row.roomKey, row.mealKey, price, currency]
    .map(text)
    .join(":");
}

function normalizePrice(row: UnknownRecord): TourOffer | null {
  const parsedPrice = number(row.price, Number.NaN);
  if (!Number.isFinite(parsedPrice)) return null;
  const currency = text(row.currency || row.currencyAlias);
  const stopSale = blockingFlag(row.stopSale) || blockingFlag(row.stopSpog);
  const bookingFlagPresent = row.bron != null && text(row.bron) !== "";
  const available = !stopSale && (!bookingFlagPresent || positiveFlag(row.bron));

  return {
    provider: "samo",
    providerOfferId: offerId(row, parsedPrice, currency),
    tourName: text(row.tourAlt || row.tour),
    destination: text(row.townAlt || row.town),
    hotel: text(row.hotelAlt || row.hotel),
    hotelStars: text(row.starAlt || row.star),
    meal: text(row.mealAlt || row.meal),
    room: text(row.roomAlt || row.room),
    accommodation: text(row.htPlaceAlt || row.htPlace),
    checkIn: isoDate(row.checkIn),
    checkOut: isoDate(row.checkOut),
    nights: number(row.nights),
    adults: number(row.adult),
    children: number(row.child),
    price: parsedPrice,
    currency,
    available,
    instantConfirmation: positiveFlag(row.momentConfirm),
    stopSale,
    bestPrice: positiveFlag(row.best),
    incomingPartner: text(row.partnerIncomingAlt || row.partnerIncoming),
    providerMeta: {
      tourKey: text(row.tourKey),
      hotelKey: text(row.hotelKey),
      townKey: text(row.townKey),
      mealKey: text(row.mealKey),
      roomKey: text(row.roomKey),
      currencyKey: text(row.currencyKey),
    },
  };
}

export function normalizeSamoPrices(payload: unknown, input?: Pick<TourSearchInput, "onlyAvailable" | "instantConfirmation">) {
  let offers = priceRows(payload).map(normalizePrice).filter((item): item is TourOffer => Boolean(item));
  if (input?.onlyAvailable) offers = offers.filter((offer) => offer.available);
  if (input?.instantConfirmation) offers = offers.filter((offer) => offer.instantConfirmation);
  return offers;
}

async function readJson(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SamoProviderError("SAMO_RESPONSE_TOO_LARGE", "SAMO javobi ruxsat etilgan hajmdan katta.");
  }
  if (!response.body) throw new SamoProviderError("SAMO_BAD_RESPONSE", "SAMO bo‘sh javob qaytardi.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new SamoProviderError("SAMO_RESPONSE_TOO_LARGE", "SAMO javobi ruxsat etilgan hajmdan katta.");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new SamoProviderError("SAMO_BAD_RESPONSE", "SAMO JSON formatida yaroqli javob qaytarmadi.");
  }
}

async function callSamoAction(config: SamoConfig, action: string, params: Record<string, string | number>, signal?: AbortSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("SAMO_TIMEOUT")), config.timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();

  try {
    const response = await fetch(buildSamoApiUrl(config, action, params), {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new SamoProviderError("SAMO_REQUEST_FAILED", `SAMO API HTTP ${response.status} qaytardi.`, 502);
    }
    return await readJson(response, config.maxResponseBytes);
  } catch (error) {
    if (error instanceof SamoProviderError) throw error;
    if (controller.signal.aborted) {
      throw new SamoProviderError("SAMO_TIMEOUT", "SAMO API so‘rovi vaqt chegarasidan oshdi.", 504);
    }
    throw new SamoProviderError("SAMO_REQUEST_FAILED", "SAMO API bilan bog‘lanib bo‘lmadi.", 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export const samoProvider: TourProvider = {
  id: "samo",
  configured() {
    try {
      return Boolean(getSamoConfig());
    } catch {
      return false;
    }
  },
  async search(input, signal): Promise<TourSearchResult> {
    const config = getSamoConfig();
    if (!config) {
      throw new SamoProviderError("SAMO_NOT_CONFIGURED", "SAMO API credentiallari hali sozlanmagan.", 503);
    }
    const payload = await callSamoAction(config, "SearchTour_PRICES", buildSamoSearchParams(input), signal);
    const offers = normalizeSamoPrices(payload, input);
    return { provider: "samo", offers, count: offers.length };
  },
};
