const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildAiFeedPostSearchTerms,
  buildTourPostSearchTerms,
  findAiFeedPostMatches,
  findAiTourPostMatches,
} = require('../lib/ai-feed-tour-matches.ts');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

const guideId = '11111111-1111-4111-8111-111111111111';
const hotelId = '22222222-2222-4222-8222-222222222222';
const closedId = '33333333-3333-4333-8333-333333333333';
const expiredId = '44444444-4444-4444-8444-444444444444';

function baseOffer(overrides = {}) {
  return {
    id: guideId,
    category: 'boshqa',
    title: 'Русскоязычный гид Мантып',
    body: 'Гид по Мантыпу. Русский язык, индивидуальные экскурсии.',
    origin: null,
    destination: 'Мантып',
    price: 350000,
    currency: 'UZS',
    status: 'active',
    expires_at: '2099-12-31T23:59:59Z',
    created_at: '2099-01-01T00:00:00Z',
    author_full_name: 'Guide Test',
    author_company_name: 'Mantip Guide Service',
    author_is_verified: true,
    ...overrides,
  };
}

test('AI feed search expands service, destination and language terms across Uzbek/Russian wording', () => {
  const terms = buildAiFeedPostSearchTerms([
    { category: 'Gid', destination: 'Mantip', service_details: { language: 'Rus tili' } },
  ], 'Mantipda rus tilida gid kerak');

  assert.ok(terms.some((term) => /mantip/i.test(term)));
  assert.ok(terms.some((term) => /^gid$/i.test(term)));
  assert.ok(terms.some((term) => /гид/i.test(term)));
  assert.ok(terms.some((term) => /рус/i.test(term)));
  assert.ok(terms.length <= 9);

  const hotelTerms = buildAiFeedPostSearchTerms([
    { category: 'Mehmonxona', destination: 'Dubai' },
  ], 'Dubaida hotel kerak');
  assert.ok(hotelTerms.some((term) => /hotel|отель|mehmonxona/i.test(term)));

  const legacyTourTerms = buildTourPostSearchTerms('Egypt', 'Misrga tur topib ber');
  assert.ok(legacyTourTerms.some((term) => /egypt|misr/i.test(term)));
});

test('AI finds Russian guide posts for a guide request and searches every feed category', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), body });
    return Response.json([
      baseOffer(),
      baseOffer({
        id: hotelId,
        category: 'mehmonxona',
        title: 'Hotel in Tashkent',
        body: 'Business hotel',
        destination: 'Tashkent',
        author_is_verified: false,
      }),
    ]);
  };

  const matches = await findAiFeedPostMatches({
    requests: [{ category: 'Gid', destination: 'Mantip', service_details: { language: 'Rus tili' } }],
    message: 'Mantipda rus tilida gid kerak',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.equal(matches[0].id, guideId);
  assert.equal(matches[0].category, 'boshqa');
  assert.ok(calls.length > 0 && calls.length <= 9);
  assert.ok(calls.every((call) => call.url.endsWith('/rest/v1/rpc/list_feed_posts')));
  assert.ok(calls.every((call) => call.body.p_category === null && call.body.p_limit === 12));
  assert.ok(calls.some((call) => /гид|gid/i.test(call.body.p_search)));
});

test('hotel, transfer, visa and other structured requests also trigger feed search', async () => {
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return Response.json([]);
  };

  for (const request of [
    { category: 'Mehmonxona', destination: 'Dubai' },
    { category: 'Transfer', origin: 'Tashkent airport', destination: 'Chimgan' },
    { category: 'Viza', destination: 'Belgium' },
    { category: 'Boshqa', destination: 'Samarkand', description: 'restoran kerak' },
  ]) {
    const matches = await findAiFeedPostMatches({
      requests: [request],
      message: `${request.category} kerak`,
      authorization: 'Bearer test-user-token',
      signal: new AbortController().signal,
    });
    assert.deepEqual(matches, []);
  }
  assert.ok(calls > 0);
});

test('AI excludes closed and expired posts and deduplicates repeated matches', async () => {
  global.fetch = async () => Response.json([
    baseOffer(),
    baseOffer({ id: closedId, status: 'closed' }),
    baseOffer({ id: expiredId, expires_at: '2000-01-01T00:00:00Z' }),
    baseOffer(),
  ]);

  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Gid', destination: 'Mantip' }],
    message: 'gid Mantip',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.deepEqual(matches.map((item) => item.id), [guideId]);
});

test('AI response keeps exact post links in a generic marketplace-offer block', () => {
  const root = path.join(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'app/api/ai/route.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'app/dashboard/components/ai-response-text.tsx'), 'utf8');
  const matcher = fs.readFileSync(path.join(root, 'lib/ai-feed-tour-matches.ts'), 'utf8');

  assert.match(route, /findAiTourPostMatches/);
  assert.match(route, /composePostMatchSection/);
  assert.match(route, /\[\[offer\]\]/);
  assert.match(route, /\/feed\/\$\{match\.id\}/);
  assert.match(renderer, /clarification\|note\|suggestion\|warning\|offer/);
  assert.match(renderer, /Platformadagi mos takliflar/);
  assert.match(renderer, /Подходящие предложения на платформе/);
  assert.ok(renderer.includes('[0-9a-f-]{36}$/i.test(href)'));
  assert.match(matcher, /p_category: null/);
  assert.match(matcher, /Gid:/);
  assert.match(matcher, /Mehmonxona:/);
});
