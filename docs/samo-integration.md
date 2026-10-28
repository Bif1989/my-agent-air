# SAMO integration

## Current scope

The first My Agent Air integration layer uses the classic SAMO `export/default.php` API contract and keeps provider credentials server-side.

Implemented:

- unified tour-provider types under `lib/tour-providers/`;
- SAMO adapter under `lib/server/tour-providers/samo.ts`;
- `SearchTour_PRICES` request mapping;
- normalization of SAMO prices into My Agent Air `TourOffer` objects;
- request timeout and response-size guards;
- regression tests that prevent `NEXT_PUBLIC_SAMO*` credential exposure.

Not enabled yet:

- production SAMO credentials;
- operator-specific lookup values (departure town/state/tour/hotel IDs);
- browser-facing search action and frontend tour-search widget;
- booking/write operations.

A dedicated `/api/tours/search` Vercel route is intentionally not added at this stage. My Agent Air currently protects its Hobby-plan function budget with regression guards, so SAMO will be exposed through the existing consolidated server surface or a separately approved backend path instead of silently creating a seventh Vercel function.

## Required server-only environment variables

```text
SAMO_BASE_URL=https://operator.example/samotour
SAMO_OAUTH_TOKEN=replace-with-provider-token
SAMO_API_VERSION=1.0
```

Optional:

```text
SAMO_TIMEOUT_MS=15000
SAMO_MAX_RESPONSE_BYTES=4194304
```

`SAMO_BASE_URL` may be either the SAMO module root (for example `https://operator.example/samotour`) or the complete HTTPS `.../export/default.php` endpoint. The adapter normalizes both forms.

Never expose SAMO credentials through `NEXT_PUBLIC_*` variables.

## Unified search input

The provider adapter accepts the following shape internally:

```json
{
  "provider": "samo",
  "departureTownId": 1885,
  "destinationStateId": 9,
  "checkInFrom": "2026-11-10",
  "checkInTo": "2026-11-12",
  "nightsFrom": 7,
  "nightsTo": 9,
  "adults": 2,
  "children": 1,
  "childAges": [8],
  "currencyId": 3,
  "onlyAvailable": true
}
```

The adapter maps this to SAMO `SearchTour_PRICES` fields and returns normalized `TourOffer` objects rather than passing raw provider payloads through the application.

## Rollout sequence

1. Obtain the exact SAMO operator API URL, OAuth token and the operator's enabled API/action list.
2. Add the server-only variables to a controlled non-production secret store first.
3. Verify directory/reference calls for departure towns, destination states, tours, hotels and currencies for that operator.
4. Run live `SearchTour_PRICES` smoke queries against a narrow date window.
5. Expose search through an existing consolidated backend surface (or another explicitly approved backend) without increasing the Vercel Hobby function count unintentionally.
6. Add the search-widget reference-data selectors and result cards.
7. Keep booking disabled until search parity, price freshness and error handling are verified.
8. Add booking actions only after the operator confirms the exact booking API permissions and workflow.

## Security decisions

- Credentials are read only on the server.
- SAMO must not be called directly from the browser with provider credentials.
- SAMO response sizes and request duration are bounded.
- Raw provider debug payloads are not forwarded to clients.
- Production credentials and booking remain disabled until live operator access is verified.
