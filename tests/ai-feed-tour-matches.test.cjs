const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTourPostSearchTerms, buildAiFeedSearchContext, findAiTourPostMatches } = require('../lib/ai-feed-tour-matches.ts');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

const tourId = '11111111-1111-4111-8111-111111111111';
const hotelId = '22222222-2222-4222-8222-222222222222';
const guideId = '33333333-3333-4333-8333-333333333333';
const closedId = '44444444-4444-4444-8444-444444444444';
const expiredId = '55555555-5555-4555-8555-555555555555';
const routeClosedId = '558b1edb-3243-4907-a356-b15c4d84d6fb';

const baseOffer = {
  id: tourId,
  category: 'tur_paket',
  title: 'Dubai 7 kecha — Atlantis va Marina',
  body: 'Toshkentdan Dubayga tayyor tur paket',
  origin: 'Toshkent',
  destination: 'Dubai',
  price: 899,
  currency: 'USD',
  status: 'active',
  expires_at: '2099-12-31T23:59:59Z',
  created_at: '2099-01-01T00:00:00Z',
  author_full_name: 'Test Operator',
  author_company_name: 'Test Travel',
  author_is_verified: true,
};

const hotelOffer = {
  ...baseOffer,
  id: hotelId,
  category: 'mehmonxona',
  title: 'Dubai Marina Hotel 4*',
  body: 'Mehmonxona uchun B2B narxlar mavjud',
  price: 120,
  author_company_name: 'Hotel Partner',
};

const guideOffer = {
  ...baseOffer,
  id: guideId,
  category: 'boshqa',
  title: 'Гид Мантип — индивидуальные экскурсии',
  body: 'Русскоязычный гид. Экскурсии и сопровождение для туристов.',
  destination: null,
  price: null,
  author_company_name: null,
  author_full_name: 'Mantip Guide',
};

const closedRouteOffer = {
  ...baseOffer,
  id: routeClosedId,
  title: 'smarqandga',
  body: 'Namangandan Samarqanffdsv',
  origin: 'nmc',
  destination: 'ffg',
  status: 'closed',
  expires_at: null,
  price: null,
  created_at: '2026-09-17T14:42:03Z',
};

test('AI feed search expands destinations and service names across Uzbek, Russian and English', () => {
  const dubai = buildTourPostSearchTerms('Dubai', 'Dubaiga tur kerak');
  assert.ok(dubai.some((term) => /dubai/i.test(term)));
  assert.ok(dubai.some((term) => /dubay/i.test(term)));
  assert.ok(dubai.length <= 10);

  const guide = buildAiFeedSearchContext([{ category: 'Gid' }], 'rus tilida gid kerak');
  assert.ok(guide.terms.some((term) => /^gid$/i.test(term)));
  assert.ok(guide.terms.some((term) => term === 'гид'));
  assert.equal(guide.russianRequested, true);
  assert.equal(guide.directSearchRequested, true);

  const hotel = buildAiFeedSearchContext([{ category: 'Mehmonxona', destination: 'Egypt' }], 'Misrga hotel kerak');
  assert.ok(hotel.terms.some((term) => /hotel/i.test(term)));
  assert.ok(hotel.terms.some((term) => /misr|egypt/i.test(term)));
  assert.equal(hotel.directSearchRequested, true);
});

test('route-only Uzbek wording triggers marketplace search without a service keyword', () => {
  const route = buildAiFeedSearchContext([], 'Namangandan Samarqandga');
  assert.equal(route.directSearchRequested, true);
  assert.ok(route.terms.some((term) => /namangan/i.test(term)));
  assert.ok(route.terms.some((term) => /samarqand|samarkand/i.test(term)));

  const russianRoute = buildAiFeedSearchContext([], 'из Намангана в Самарканд');
  assert.equal(russianRoute.directSearchRequested, true);
});

test('AI keeps active non-expired matching posts and searches all feed categories', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json([
      baseOffer,
      { ...baseOffer, id: closedId, title: 'Closed Dubai offer', status: 'closed' },
      { ...baseOffer, id: expiredId, title: 'Expired Dubai offer', expires_at: '2000-01-01T00:00:00Z' },
    ]);
  };

  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Tur paket', destination: 'Dubai' }],
    message: 'Dubaiga tur kerak',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.deepEqual(matches.map((item) => item.id), [tourId]);
  assert.equal(matches[0].author_company_name, 'Test Travel');
  assert.ok(calls.length > 0 && calls.length <= 10);
  assert.ok(calls.every((call) => call.url.endsWith('/rest/v1/rpc/list_feed_posts')));
  assert.ok(calls.every((call) => call.body.p_category === null && call.body.p_limit === 8));
});

test('when no active match exists, route-only search can surface a clearly marked closed historical post', async () => {
  const calls = [];
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    const term = String(calls.at(-1).p_search || '').toLowerCase();
    return Response.json(term.includes('namangan') ? [closedRouteOffer] : []);
  };

  const matches = await findAiTourPostMatches({
    requests: [],
    message: 'Namangandan Samarqandga',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.deepEqual(matches.map((item) => item.id), [routeClosedId]);
  assert.match(matches[0].title, /^YOPILGAN · /);
  assert.ok(calls.some((call) => /namangan/i.test(call.p_search)));
  assert.ok(calls.every((call) => call.p_category === null));
});

test('hotel request returns hotel posts but filters unrelated tour posts', async () => {
  global.fetch = async () => Response.json([baseOffer, hotelOffer]);

  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Mehmonxona', destination: 'Dubai' }],
    message: 'Dubaiga mehmonxona kerak',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.deepEqual(matches.map((item) => item.id), [hotelId]);
  assert.equal(matches[0].category, 'mehmonxona');
});

test('Uzbek guide request can discover a guide post written in Russian', async () => {
  const calls = [];
  global.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return Response.json([baseOffer, guideOffer]);
  };

  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Gid' }],
    message: 'rus tilida gid kerak',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.deepEqual(matches.map((item) => item.id), [guideId]);
  assert.equal(matches[0].author_company_name, 'Mantip Guide');
  assert.ok(calls.some((call) => /gid|guide|гид|экскурсовод/i.test(call.p_search)));
  assert.ok(calls.every((call) => call.p_category === null));
});

test('editing an existing draft does not trigger an unrelated marketplace search', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return Response.json([]); };
  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Mehmonxona', destination: 'Samarqand' }],
    message: 'Nonushta qo‘shing',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });
  assert.deepEqual(matches, []);
  assert.equal(calls, 0);
});

test('AI response surfaces exact post links in a generic marketplace-offer block', () => {
  const root = path.join(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'app/api/ai/route.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'app/dashboard/components/ai-response-text.tsx'), 'utf8');

  assert.match(route, /findAiTourPostMatches/);
  assert.match(route, /composePostMatchSection/);
  assert.match(route, /\[\[offer\]\]/);
  assert.match(route, /\/feed\/\$\{match\.id\}/);
  assert.match(renderer, /clarification\|note\|suggestion\|warning\|offer/);
  assert.match(renderer, /Platformadagi mos takliflar/);
  assert.match(renderer, /Подходящие предложения на платформе/);
  assert.ok(renderer.includes('[0-9a-f-]{36}$/i.test(href)'));
});
