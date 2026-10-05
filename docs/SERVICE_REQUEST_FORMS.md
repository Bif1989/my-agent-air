# Service request questionnaires

The seven request categories now share a typed definition in `lib/service-request.ts`. Manual entry, AI extraction, publication validation, editing and detail displays use the same keys. Publishing remains an explicit user action.

| Category | Core fields | Additional requirements |
| --- | --- | --- |
| Aviachipta | Airports, departure, passengers, one-way/return/multi-city | Return date or extra legs when applicable; cabin, airline, direct flights, date flexibility, baggage, children's ages |
| Tur paket | Origin, destination/route, start, transport, total days, participants | Nights (including zero for day trips), hotel class, meals, room type, included services |
| Mehmonxona | City, check-in/check-out, rooms, guests | Nights calculated from dates; children's ages, hotel, room allocation, meals, nationality, cancellation |
| Transfer | Pickup/drop-off, date/local time, vehicle, passengers, service type | Return date/time or hourly duration when applicable; flight number, bags, child seats, stops |
| Gid | City, date, language, hours per day, itinerary, participants | Number of days, start time, walking/transport/interpreter service |
| Viza | Country, planned entry, applicants, nationality/residence, purpose, duration, assistance type | Submission city and entry count; no passport numbers/scans required |
| Boshqa | Service name, city, date, quantity and unit, participants | Start time and other requirements |

Budgets are optional. A stated amount requires a currency and explicit basis (total, person, room/night, vehicle, etc.); per-unit budgets are not silently converted into totals. Supplier offers explicitly ask for the total proposed price, consistent with the existing deal acceptance workflow.

## Data compatibility

New requests use `requests.service_details` (JSON object, allowed named string fields) and `form_version=1`. A database trigger checks the service schema, dates, times, ranges and age counts. Existing row ownership, account and status checks remain in force. New columns have only the additional UPDATE grants required for editing.

Historical `form_version=0` rows are unchanged. Their `Xizmat tafsilotlari:` description trailers are read into fields on display/edit, without duplicating the user's notes. Legacy hotel nights yield a checkout date when a check-in exists. Editing and publishing an upgraded row requires any newly mandatory details. Version-1 rows cannot downgrade to bypass validation.

Service fields are displayed on request cards/details and on deals. Hotels, guides, visas and other location-based services do not show meaningless origin arrows or airline/baggage fields. Uzbek and Russian labels are included, with responsive and dark-theme form styles.

## AI

The existing `/api/ai` dashboard chat and the inline `AI yordamchi` form filler use the same category-specific strict schema. Multiple independently requested services remain separate drafts. Unknown values remain missing and receive field-specific validation before publication. Applying AI values can be undone.

Full draft data stays in saved chat history. Opening a draft stages it in account-bound session storage for 24 hours and navigates with a short ID, avoiding oversized URLs and request data in access logs. Old `?draft=` links remain readable. History entries are retained whole instead of cutting their structured JSON halfway through.

The API uses `OPENAI_API_KEY` on the server and `OPENAI_AI_MODEL` (default `gpt-6-luna`), `store:false`, a 40-second timeout and validated output. Incomplete, invalid or mismatched-category responses cannot overwrite the form. Existing database quotas are now used by `/api/ai`: 20 attempts per active user/day, 100 site-wide/day, and 6 seconds between attempts; day boundaries use Asia/Tashkent. Failed provider attempts consume a reservation. These are request limits, not a guaranteed dollar budget.

## Migration and verification

The quota migration `20261005042133` was already applied. The service migrations `20261005123936`, `20261005124625` and `20261005124752` were applied to project `fsemjqlreuzvpyvbmxzt` on 2026-10-05. The later migrations fix PL/pgSQL variable disambiguation and extend existing column-scoped update privileges. Keep all three in order for other databases; do not rerun them on the existing database manually.

Run `npm test`, `npm run lint` and `npm run build`. `supabase/tests/service_request_forms.sql` creates rollback-only fixtures, exercises all seven categories under authenticated RLS, tests editing/status changes and rejects 13 invalid cases. Tests cover legacy data, strict AI schema, mocked provider failures, long Cyrillic drafts and form/detail rendering. No paid OpenAI calls are used in automated tests. Actual OpenAI language quality and signed-in browser interactions still need a configured deployment smoke check.

## Reference material

These are supplier quotation questionnaires, not claims that a supplier can confirm availability or issue a visa.

- Amadeus Flight Offers Search: airports, dates, return journeys and traveler/cabin structure — https://github.com/amadeus4dev/amadeus-open-api-specification/blob/main/spec/json/FlightOffersSearch_v2_swagger_specification.json
- Agoda API reference: hotel dates, rooms, adults, child ages and room/night price basis — https://developer.pps.agoda.com/docs/api-reference
- OpenAI Structured Outputs: strict response schema — https://platform.openai.com/docs/guides/structured-outputs
