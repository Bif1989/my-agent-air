import {
  TRAVELGATE_API_KEY,
  TRAVELGATE_CLIENT,
  TRAVELGATE_SHOPPING_ENDPOINT,
  assertTravelgateConfigured,
} from "@/lib/travelgate/config";

type GraphQLError = {
  message: string;
  path?: Array<string | number>;
  extensions?: Record<string, unknown>;
};

type GraphQLResponse<T> = {
  data?: T;
  errors?: GraphQLError[];
};

export class TravelgateError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 502, details?: unknown) {
    super(message);
    this.name = "TravelgateError";
    this.status = status;
    this.details = details;
  }
}

export async function travelgateGraphQL<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  assertTravelgateConfigured();

  const response = await fetch(TRAVELGATE_SHOPPING_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      Connection: "keep-alive",
      Authorization: `Apikey ${TRAVELGATE_API_KEY}`,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | GraphQLResponse<T>
    | null;

  if (!response.ok) {
    throw new TravelgateError(
      `Travelgate HTTP ${response.status}`,
      response.status,
      payload,
    );
  }

  if (!payload) {
    throw new TravelgateError("Travelgate returned an empty response.");
  }

  if (payload.errors?.length) {
    throw new TravelgateError(
      payload.errors.map((error) => error.message).join("; "),
      502,
      payload.errors,
    );
  }

  if (!payload.data) {
    throw new TravelgateError("Travelgate response did not contain data.");
  }

  return payload.data;
}

export function getTravelgateClient() {
  return TRAVELGATE_CLIENT;
}
