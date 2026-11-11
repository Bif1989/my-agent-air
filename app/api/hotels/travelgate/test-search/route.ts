import { NextRequest, NextResponse } from "next/server";
import {
  getTravelgateClient,
  travelgateGraphQL,
  TravelgateError,
} from "@/lib/travelgate/client";
import { TRAVELGATE_MODE, TRAVELGATE_TEST } from "@/lib/travelgate/config";

export const dynamic = "force-dynamic";

const SEARCH_QUERY = `
  query BifaviaTravelgateTestSearch(
    $criteriaSearch: HotelCriteriaSearchInput
    $settings: HotelSettingsInput
    $filterSearch: HotelXFilterSearchInput
  ) {
    hotelX {
      search(
        criteria: $criteriaSearch
        settings: $settings
        filterSearch: $filterSearch
      ) {
        context
        options {
          id
          supplierCode
          accessCode
          hotelCode
          hotelCodeSupplier
          hotelName
          boardCode
          boardCodeSupplier
          paymentType
          status
          price {
            currency
            binding
            net
            gross
            minimumSellingPrice
          }
          rooms {
            code
            supplierCode
            description
            descriptionSupplier
            refundable
            units
          }
        }
        errors {
          code
          type
          description
        }
        warnings {
          code
          type
          description
        }
      }
    }
  }
`;

type TestSearchBody = {
  checkIn?: string;
  checkOut?: string;
  hotel?: string;
  adults?: number;
  childAges?: number[];
  currency?: string;
};

function isDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET() {
  return NextResponse.json({
    service: "travelgate-hotelx",
    mode: TRAVELGATE_MODE,
    client: getTravelgateClient(),
    supplier: TRAVELGATE_TEST.supplier,
    access: TRAVELGATE_TEST.access,
    context: TRAVELGATE_TEST.context,
    hotels: TRAVELGATE_TEST.hotels,
    ready: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as TestSearchBody;

    const checkIn = isDate(body.checkIn) ? body.checkIn! : "2027-05-28";
    const checkOut = isDate(body.checkOut) ? body.checkOut! : "2027-05-29";
    const hotel = TRAVELGATE_TEST.hotels.includes(
      body.hotel as (typeof TRAVELGATE_TEST.hotels)[number],
    )
      ? body.hotel!
      : TRAVELGATE_TEST.hotels[0];
    const adults = Math.min(Math.max(Number(body.adults) || 2, 1), 8);
    const childAges = Array.isArray(body.childAges)
      ? body.childAges
          .map(Number)
          .filter((age) => Number.isInteger(age) && age >= 0 && age <= 17)
          .slice(0, 4)
      : [];

    const paxes = [
      ...Array.from({ length: adults }, () => ({ age: 30 })),
      ...childAges.map((age) => ({ age })),
    ];

    const data = await travelgateGraphQL<{
      hotelX: {
        search: unknown;
      };
    }>(SEARCH_QUERY, {
      criteriaSearch: {
        checkIn,
        checkOut,
        occupancies: [{ paxes }],
        hotels: [hotel],
        currency: body.currency || "EUR",
        markets: ["ES"],
        language: "en",
        nationality: "ES",
      },
      settings: {
        client: getTravelgateClient(),
        context: TRAVELGATE_TEST.context,
        testMode: true,
        timeout: 25000,
      },
      filterSearch: {
        access: {
          includes: [TRAVELGATE_TEST.access],
        },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        mode: TRAVELGATE_MODE,
        criteria: { checkIn, checkOut, hotel, adults, childAges },
        result: data.hotelX.search,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof TravelgateError) {
      console.error("Travelgate test search failed", error.message, error.details);
      return NextResponse.json(
        {
          ok: false,
          message: error.message,
          details: error.details,
        },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    console.error("Travelgate test search failed", error);
    return NextResponse.json(
      { ok: false, message: "Travelgate test search failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
