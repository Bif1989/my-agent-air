import { NextRequest, NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/server/bounded-json";
import { getTourProvider } from "@/lib/server/tour-providers";
import { SamoProviderError } from "@/lib/server/tour-providers/samo";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";
import type { TourProviderId, TourSearchInput } from "@/lib/tour-providers/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BODY_BYTES = 16_384;
const MAX_FILTER_IDS = 50;

type SearchBody = Partial<TourSearchInput>;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function crossSite(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== request.nextUrl.host;
  } catch {
    return true;
  }
}

async function verifyUser(request: NextRequest) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization) || authorization.length > 4096) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: authorization },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function integer(value: unknown, min: number, max: number) {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : null;
}

function idList(value: unknown) {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > MAX_FILTER_IDS) return null;
  const parsed = value.map((item) => integer(item, 1, 2_147_483_647));
  return parsed.every((item): item is number => item !== null) ? parsed : null;
}

function isoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

function parseInput(body: SearchBody): TourSearchInput | null {
  const provider: TourProviderId = body.provider ?? "samo";
  if (provider !== "samo") return null;

  const departureTownId = integer(body.departureTownId, 1, 2_147_483_647);
  const destinationStateId = integer(body.destinationStateId, 1, 2_147_483_647);
  const checkInFrom = isoDate(body.checkInFrom);
  const checkInTo = body.checkInTo == null ? checkInFrom : isoDate(body.checkInTo);
  const nightsFrom = integer(body.nightsFrom, 1, 60);
  const nightsTo = body.nightsTo == null ? nightsFrom : integer(body.nightsTo, 1, 60);
  const adults = integer(body.adults, 1, 10);
  const children = body.children == null ? 0 : integer(body.children, 0, 6);

  if (!departureTownId || !destinationStateId || !checkInFrom || !checkInTo || !nightsFrom || !nightsTo || !adults || children === null) return null;
  if (nightsTo < nightsFrom) return null;

  const fromTime = Date.parse(`${checkInFrom}T00:00:00Z`);
  const toTime = Date.parse(`${checkInTo}T00:00:00Z`);
  if (toTime < fromTime || toTime - fromTime > 60 * 24 * 60 * 60 * 1000) return null;

  const childAges = body.childAges == null ? [] : body.childAges;
  if (!Array.isArray(childAges) || childAges.length !== children || childAges.some((age) => integer(age, 0, 17) === null)) return null;

  const currencyId = body.currencyId == null ? undefined : integer(body.currencyId, 1, 2_147_483_647);
  if (body.currencyId != null && currencyId === null) return null;

  const tourIds = idList(body.tourIds);
  const hotelIds = idList(body.hotelIds);
  const mealIds = idList(body.mealIds);
  const roomIds = idList(body.roomIds);
  if (tourIds === null || hotelIds === null || mealIds === null || roomIds === null) return null;
  if (body.onlyAvailable != null && typeof body.onlyAvailable !== "boolean") return null;
  if (body.instantConfirmation != null && typeof body.instantConfirmation !== "boolean") return null;

  return {
    provider,
    departureTownId,
    destinationStateId,
    checkInFrom,
    checkInTo,
    nightsFrom,
    nightsTo,
    adults,
    children,
    childAges: childAges as number[],
    currencyId: currencyId ?? undefined,
    tourIds,
    hotelIds,
    mealIds,
    roomIds,
    onlyAvailable: body.onlyAvailable,
    instantConfirmation: body.instantConfirmation,
  };
}

export async function POST(request: NextRequest) {
  if (crossSite(request)) return json({ ok: false, code: "FORBIDDEN", message: "So‘rov manbasi qabul qilinmadi." }, 403);
  if (!await verifyUser(request)) return json({ ok: false, code: "UNAUTHORIZED", message: "Kirish sessiyasi yaroqsiz." }, 401);

  const body = await readBoundedJson<SearchBody>(request, MAX_BODY_BYTES);
  const input = body ? parseInput(body) : null;
  if (!input) return json({ ok: false, code: "INVALID_INPUT", message: "Tur qidiruv parametrlarini tekshiring." }, 422);

  try {
    const provider = getTourProvider(input.provider);
    const result = await provider.search(input, request.signal);
    return json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SamoProviderError) {
      return json({ ok: false, code: error.code, message: error.message }, error.status);
    }
    console.error("Tour search failed", error);
    return json({ ok: false, code: "TOUR_SEARCH_FAILED", message: "Tur qidiruvi vaqtincha ishlamayapti." }, 502);
  }
}
