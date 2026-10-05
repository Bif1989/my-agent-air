const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SERVICE_CATEGORIES, requestIssues, hydrateServiceRequest, cleanServiceData, serviceDetailEntries, requestTitle, serviceFields } = require('../lib/service-request.ts');
const { AI_SERVICE_DETAILS_SCHEMA, aiRequestToDraft } = require('../lib/ai-request-draft.ts');
const { readRequestDraft } = require('../lib/request-assistant.ts');
const { joinServiceDetails } = require('../lib/request-details.ts');

const now = new Date('2026-10-05T09:00:00Z');
const details = {
  Aviachipta: { trip_type: 'round_trip', return_date: '2026-11-19', cabin_class: 'business' },
  'Tur paket': { transport: 'bus', duration_days: '1', nights: '0', included_services: 'Transport, gid va tushlik' },
  Mehmonxona: { check_out: '2026-11-15', rooms: '2', meal_plan: 'breakfast', room_type: 'TWIN' },
  Transfer: { transfer_type: 'round_trip', pickup_time: '10:30', vehicle: 'Staria 8 o‘rin', return_date: '2026-11-12', return_time: '19:00', luggage_count: '4' },
  Gid: { language: 'Rus', duration_hours: '4', route_details: 'Registon, Shohi Zinda' },
  Viza: { nationality: 'O‘zbekiston', residence_country: 'O‘zbekiston', visa_purpose: 'tourism', duration_days: '15', visa_service: 'documents' },
  Boshqa: { service_name: 'Guruh tushligi', quantity: '20', unit: 'meal', start_time: '13:00' },
};
const make = (category) => ({ category, origin: ['Aviachipta','Tur paket','Transfer'].includes(category) ? 'Toshkent' : null, destination: category === 'Viza' ? 'Polsha' : 'Samarqand', travel_date: '2026-11-12', adults: 2, children: 0, infants: 0, currency: 'UZS', budget: null, description: 'Kelishilgan xizmat', service_details: { ...details[category] }, form_version: 1 });

for (const category of SERVICE_CATEGORIES) {
  test(`${category}: complete questionnaire survives AI → URL → edit → display without detail loss`, () => {
    const original = make(category);
    assert.deepEqual(requestIssues(original, false, now), []);
    const ai = aiRequestToDraft({ ...original, service_details: { kind: category, ...original.service_details }, created_by: 'forged-owner', status: 'accepted' });
    const fromLink = readRequestDraft(JSON.stringify(ai));
    const edited = hydrateServiceRequest(fromLink);
    assert.deepEqual(edited.service_details, original.service_details);
    assert.deepEqual(requestIssues(edited, true, now), []);
    assert.equal(edited.description, original.description);
    assert.equal(edited.created_by, undefined);
    assert.equal(edited.status, undefined);
    for (const [key, value] of Object.entries(original.service_details)) assert.ok(serviceDetailEntries(edited).some((entry) => entry.key === key && entry.value), `${key} should be visible: ${value}`);
  });
}

test('hotel dates, rooms and exact child ages are validated independently', () => {
  const request = make('Mehmonxona');
  request.children = 2;
  request.service_details = { ...request.service_details, check_out: request.travel_date, rooms: '0', child_ages: '7' };
  const fields = requestIssues(request, false, now).map((issue) => issue.field);
  for (const key of ['check_out','rooms','child_ages']) assert.ok(fields.includes(`service_details.${key}`));
  request.service_details = { ...request.service_details, check_out: '2026-11-15', rooms: '1', child_ages: '7, 12' };
  assert.deepEqual(requestIssues(request, false, now), []);
});

test('round trips, impossible dates and transfer return times cannot be published', () => {
  const flight = make('Aviachipta');
  flight.service_details.return_date = '2026-11-11';
  assert.ok(requestIssues(flight, false, now).some((issue) => issue.field === 'service_details.return_date'));
  flight.travel_date = '2027-02-30';
  assert.ok(requestIssues(flight, false, now).some((issue) => issue.field === 'travel_date'));
  const transfer = make('Transfer');
  transfer.service_details.return_time = '09:00';
  assert.ok(requestIssues(transfer, false, now).some((issue) => issue.field === 'service_details.return_time'));
  transfer.service_details.pickup_time = '25:90';
  assert.ok(requestIssues(transfer, false, now).some((issue) => issue.field === 'service_details.pickup_time'));
});

test('unknown budget and passenger count stay unknown; price basis is required for a budget', () => {
  const draft = aiRequestToDraft({ category: 'Aviachipta', adults: null, budget: null, currency: '', service_details: {} });
  assert.equal(draft.adults, undefined);
  assert.equal(draft.budget, undefined);
  assert.equal(draft.currency, undefined);
  const request = make('Mehmonxona');
  request.budget = 250000;
  assert.ok(requestIssues(request, false, now).some((issue) => issue.field === 'service_details.budget_basis'));
  request.service_details.budget_basis = 'per_person_night';
  assert.deepEqual(requestIssues(request, false, now), []);
  assert.equal(aiRequestToDraft(request).budget, 250000);
});

test('legacy hotel trailers become structured fields without duplicating or losing free text', () => {
  const description = joinServiceDetails('Nonushta bilan, bolaga qo‘shimcha yotoq.', 'Mehmonxona', { rooms: '2', nights: '3', vehicle: '', language: '' });
  const old = { ...make('Mehmonxona'), origin: 'Buxoro', destination: null, service_details: undefined, description, form_version: 0 };
  const upgraded = hydrateServiceRequest(old);
  assert.equal(upgraded.destination, 'Buxoro');
  assert.equal(upgraded.origin, null);
  assert.deepEqual(upgraded.service_details, { rooms: '2', check_out: '2026-11-15' });
  assert.equal(upgraded.description, 'Nonushta bilan, bolaga qo‘shimcha yotoq.');
  assert.deepEqual(hydrateServiceRequest(upgraded), upgraded);
  assert.equal(aiRequestToDraft({ ...old, rooms: '2', nights: '3' }).service_details.check_out, '2026-11-15');
});

test('hidden and foreign-category details cannot leak into the saved request', () => {
  const request = make('Aviachipta');
  request.service_details = { trip_type: 'one_way', return_date: '2026-11-19', rooms: '4', passport_number: 'forbidden', child_ages: '7', budget_basis: 'per_room_night' };
  assert.deepEqual(cleanServiceData(request), { trip_type: 'one_way' });
  assert.equal(requestTitle(make('Mehmonxona')), 'Samarqand');
  assert.equal(requestTitle(make('Transfer')), 'Toshkent → Samarqand');
});

test('AI has exactly the questionnaire fields and explicit category variants', () => {
  assert.equal(AI_SERVICE_DETAILS_SCHEMA.anyOf.length, 7);
  for (const schema of AI_SERVICE_DETAILS_SCHEMA.anyOf) {
    const category = schema.properties.kind.enum[0];
    assert.deepEqual(schema.required, ['kind', ...serviceFields(category).map((field) => field.key)]);
    assert.equal(schema.additionalProperties, false);
  }
});
