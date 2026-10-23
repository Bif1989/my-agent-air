# Travelgate HotelX integration

## Registration / onboarding

1. Open https://app.travelgate.com/signup/
2. Register with a corporate email, first name and last name.
3. Choose the Buyer path / HotelX Pull Buyers API during onboarding with Sales.
4. Build against HotelX test credentials.
5. Request HotelX certification.
6. After certification, create/manage the production API key in Travelgate App: user menu -> Manage -> API Keys.
7. Establish commercial agreements with Sellers and activate their accesses in My Connections.

## Test credentials

Travelgate publishes shared development credentials:

- API key: `test0000-0000-0000-0000-000000000000`
- Client: `client_demo`
- HOTELTEST access: `2`
- HOTELTEST context: `HOTELTEST`
- Test hotels: `BR1518`, `ES284122`

These values are development-only and must never be used for live bookings.

## Bifavia architecture

Browser -> Next.js API -> Bifavia Hotel Engine -> Travelgate HotelX -> Seller

The browser never receives the Travelgate API key. All Travelgate calls are server-side.

Current test endpoint:

- `GET /api/hotels/travelgate/test-search` - integration status/config (no secret key returned)
- `POST /api/hotels/travelgate/test-search` - HotelX Search against HOTELTEST

Example POST body:

```json
{
  "checkIn": "2027-05-28",
  "checkOut": "2027-05-29",
  "hotel": "BR1518",
  "adults": 2,
  "childAges": [],
  "currency": "EUR"
}
```

## Production switch

When BIFAVIA receives its official credentials, configure server environment variables:

```text
TRAVELGATE_MODE=production
TRAVELGATE_API_KEY=<BIFAVIA API KEY>
TRAVELGATE_CLIENT=<BIFAVIA CLIENT ID>
```

Optionally override endpoints only if Travelgate instructs us to:

```text
TRAVELGATE_SHOPPING_ENDPOINT=https://api-shopping.travelgate.com
TRAVELGATE_CONTENT_ENDPOINT=https://api-content.travelgate.com
```

The application intentionally has no production fallback key. If production mode is enabled without credentials, the API fails closed.

## Next implementation steps

1. Validate Search in preview deployment.
2. Add Quote using the Search option ID without modifying it.
3. Persist the Quote response and cancellation policy.
4. Add Book with unique Bifavia client reference and passenger data.
5. Add Booking/Cancel management.
6. Add Supabase reservation ledger and audit history.
7. Add Bifavia markup/commission rules.
8. Add FastX content/mapping and multi-supplier aggregation.
9. Replace test access with production Seller accesses after commercial activation.
