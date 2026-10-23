export const TRAVELGATE_SHOPPING_ENDPOINT =
  process.env.TRAVELGATE_SHOPPING_ENDPOINT?.trim() ||
  "https://api-shopping.travelgate.com";

export const TRAVELGATE_CONTENT_ENDPOINT =
  process.env.TRAVELGATE_CONTENT_ENDPOINT?.trim() ||
  "https://api-content.travelgate.com";

const TEST_API_KEY = "test0000-0000-0000-0000-000000000000";
const TEST_CLIENT = "client_demo";

export const TRAVELGATE_MODE =
  process.env.TRAVELGATE_MODE?.trim().toLowerCase() === "production"
    ? "production"
    : "test";

export const TRAVELGATE_API_KEY =
  TRAVELGATE_MODE === "production"
    ? process.env.TRAVELGATE_API_KEY?.trim() || ""
    : process.env.TRAVELGATE_API_KEY?.trim() || TEST_API_KEY;

export const TRAVELGATE_CLIENT =
  TRAVELGATE_MODE === "production"
    ? process.env.TRAVELGATE_CLIENT?.trim() || ""
    : process.env.TRAVELGATE_CLIENT?.trim() || TEST_CLIENT;

export const TRAVELGATE_TEST = {
  supplier: "HOTELTEST",
  context: "HOTELTEST",
  access: "2",
  hotels: ["BR1518", "ES284122"],
} as const;

export function assertTravelgateConfigured() {
  if (!TRAVELGATE_API_KEY || !TRAVELGATE_CLIENT) {
    throw new Error(
      "Travelgate production credentials are missing. Set TRAVELGATE_API_KEY and TRAVELGATE_CLIENT.",
    );
  }
}
