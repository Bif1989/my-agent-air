const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SERVICE_CATEGORIES, requestIssues, hydrateServiceRequest, cleanServiceData, serviceDetailEntries, requestTitle, serviceFields, serviceDefinition, splitRequestFormFields } = require('../lib/service-request.ts');
const { AI_SERVICE_DETAILS_SCHEMA, aiRequestToDraft, requestFormCurrency } = require('../lib/ai-request-draft.ts');
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

test('hotel dates, rooms and exact child ages are validated independently when supplied', () => {
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

test('unknown budget and passenger count stay unknown; budget basis defaults to total', () => {
  const draft = aiRequestToDraft({ category: 'Aviachipta', adults: null, budget: null, currency: '', service_details: {} });
  assert.equal(draft.adults, undefined);
  assert.equal(draft.budget, undefined);
  assert.equal(draft.currency, undefined);
  const request = make('Mehmonxona');
  request.budget = 250000;
  assert.deepEqual(requestIssues(request, false, now), []);
  assert.equal(cleanServiceData(request).budget_basis, 'total');
  request.service_details.budget_basis = 'per_person_night';
  assert.deepEqual(requestIssues(request, false, now), []);
  assert.equal(cleanServiceData(request).budget_basis, 'per_person_night');
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

test('AI original text is preserved as the exact request title and is not duplicated in details', () => {
  const request = make('Tur paket');
  request.service_details.source_text = 'Dubaiga 2 kishiga 20 oktyabrga tur kerak, $500 har kishiga';
  const cleaned = cleanServiceData(request);
  assert.equal(cleaned.source_text, request.service_details.source_text);
  assert.equal(requestTitle({ ...request, service_details: cleaned }), request.service_details.source_text);
  assert.equal(serviceDetailEntries({ ...request, service_details: cleaned }).some((entry) => entry.key === 'source_text'), false);
});

test('detailed questionnaire fields are optional for fast publishing while supplied invalid values still fail', () => {
  for (const category of SERVICE_CATEGORIES) assert.equal(serviceDefinition(category).fields.some((field) => field.required), false);
  const tour = make('Tur paket');
  tour.origin = null;
  tour.service_details = {};
  assert.deepEqual(requestIssues(tour, false, now), []);
  const hotel = make('Mehmonxona');
  hotel.service_details = {};
  assert.deepEqual(requestIssues(hotel, false, now), []);
  hotel.service_details = { rooms: '0' };
  assert.ok(requestIssues(hotel, false, now).some((issue) => issue.field === 'service_details.rooms'));
});

test('AI has exactly the questionnaire fields and explicit category variants', () => {
  assert.equal(AI_SERVICE_DETAILS_SCHEMA.anyOf.length, 7);
  for (const schema of AI_SERVICE_DETAILS_SCHEMA.anyOf) {
    const category = schema.properties.kind.enum[0];
    assert.deepEqual(schema.required, ['kind', ...serviceFields(category).map((field) => field.key)]);
    assert.equal(schema.additionalProperties, false);
  }
});

test('Samarkand quote currency survives a missing budget and staged form handoff', () => {
  const model = { category: 'Mehmonxona', destination: 'Samarqand', travel_date: '2026-12-11', adults: 20,
    budget: null, currency: '', description: 'Jami narxni UZSda ko‘rsating. Soliqlar va turistik yig‘im alohida.',
    service_details: { kind: 'Mehmonxona', rooms: '10', check_out: '2026-12-13', meal_plan: 'breakfast' } };
  for (const currency of ['', 'USD', 'UZS']) {
    const draft = aiRequestToDraft({ ...model, currency });
    const reopened = readRequestDraft(JSON.stringify(draft));
    assert.equal(reopened.currency, 'UZS');
    assert.equal(requestFormCurrency(reopened), 'UZS');
    assert.equal(reopened.budget, undefined);
    assert.equal(reopened.adults, 20);
    assert.equal(reopened.service_details.rooms, '10');
    assert.equal(reopened.service_details.check_out, '2026-12-13');
    assert.equal(reopened.service_details.meal_plan, 'breakfast');
  }
});

test('quote currency recognizes Uzbek and Russian wording across services', () => {
  for (const [category, description, expected] of [
    ['Transfer', 'Umumiy narxni so‘mda ko‘rsating.', 'UZS'],
    ['Gid', 'Укажите стоимость в сумах.', 'UZS'],
    ['Tur paket', 'Narxni EURda ko‘rsating.', 'EUR'],
    ['Viza', 'Цена в рублях.', 'RUB'],
    ['Aviachipta', 'Show the total price in USD.', 'USD'],
  ]) {
    assert.equal(aiRequestToDraft({ category, description, budget: null }).currency, expected);
  }
});

test('unknown or ambiguous quotes remain unselected and numeric budgets retain currency', () => {
  for (const description of ['Samarqandda nonushta kerak.', 'Narxni USD yoki UZSda ko‘rsating.', 'Somon air reysi']) {
    assert.equal(requestFormCurrency(aiRequestToDraft({ category: 'Mehmonxona', description, currency: '' })), '');
  }
  const draft = aiRequestToDraft({ category: 'Mehmonxona', description: 'Jami narxni UZSda bering.', currency: 'USD', budget: 120 });
  assert.equal(draft.budget, 120);
  assert.equal(requestFormCurrency(draft), 'USD');
  assert.equal(requestFormCurrency(), 'USD');
});

test('all seven quick forms surface the most useful detail without requiring it', () => {
  const quickKeys = ['trip_type', 'duration_days', 'rooms', 'pickup_time', 'language', 'visa_purpose', 'service_name'];
  for (const [index, category] of SERVICE_CATEGORIES.entries()) {
    const { quick, extra } = splitRequestFormFields(category, {});
    assert.ok(quick.some(field => field.key === quickKeys[index]), category);
    assert.equal(new Set([...quick, ...extra].map(field => field.key)).size, quick.length + extra.length);
    assert.equal(quick.some(field => field.required), false, category);
  }
});
test('round-trip fields appear in the quick form only for a matching trip type', () => {
  for (const [category, field] of [['Aviachipta', 'trip_type'], ['Transfer', 'transfer_type']]) {
    assert.ok(splitRequestFormFields(category, { [field]: 'round_trip' }).quick.some(item => item.key === 'return_date'));
    assert.ok(!splitRequestFormFields(category, { [field]: 'one_way' }).quick.some(item => item.key === 'return_date'));
  }
  assert.deepEqual(splitRequestFormFields('toString', {}), { quick: [], extra: [] });
});

test('same-day return time is compared only against a supplied pickup time', () => {
  const request = {category:'Transfer',origin:'Toshkent',destination:'Samarqand',travel_date:'2026-12-11',adults:20,children:0,infants:0};
  const details = {transfer_type:'round_trip',return_date:'2026-12-11', return_time:'11:00'};
  const issues = (fields) => requestIssues({...request, service_details:fields}, false, new Date('2026-11-27T00:00:00Z'));
  for (const pickup_time of [undefined, '', '10:30']) assert.deepEqual(issues({...details,pickup_time}), []);
  assert.ok(issues({...details,pickup_time:'11:00'}).some(issue => issue.field === 'service_details.return_time'));
  assert.ok(issues({...details,pickup_time:'11:30'}).some(issue => issue.field === 'service_details.return_time'));
});
