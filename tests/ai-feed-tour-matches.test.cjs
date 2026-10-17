const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildTourPostSearchTerms, findAiTourPostMatches } = require('../lib/ai-feed-tour-matches.ts');

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

const activeId = '11111111-1111-4111-8111-111111111111';
const closedId = '22222222-2222-4222-8222-222222222222';
const expiredId = '33333333-3333-4333-8333-333333333333';

const activeOffer = {
  id: activeId,
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

test('AI tour search understands Uzbek destination suffixes and common multilingual aliases', () => {
  const dubai = buildTourPostSearchTerms('Dubai', 'Dubaiga tur kerak');
  assert.ok(dubai.some((term) => /dubai/i.test(term)));
  assert.ok(dubai.some((term) => /dubay/i.test(term)));
  assert.ok(dubai.length <= 6);

  const egypt = buildTourPostSearchTerms('Egypt', 'Misrga tur topib ber');
  assert.ok(egypt.some((term) => /egypt/i.test(term)));
  assert.ok(egypt.some((term) => /misr/i.test(term)));
});

test('AI recommends only active non-expired tour-package posts and deduplicates search results', async () => {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), body: JSON.parse(options.body) });
    return Response.json([
      activeOffer,
      { ...activeOffer, id: closedId, title: 'Closed Dubai offer', status: 'closed' },
      { ...activeOffer, id: expiredId, title: 'Expired Dubai offer', expires_at: '2000-01-01T00:00:00Z' },
    ]);
  };

  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Tur paket', destination: 'Dubai' }],
    message: 'Dubaiga tur kerak',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });

  assert.deepEqual(matches.map((item) => item.id), [activeId]);
  assert.equal(matches[0].author_company_name, 'Test Travel');
  assert.equal(matches[0].price, 899);
  assert.ok(calls.length > 0 && calls.length <= 6);
  assert.ok(calls.every((call) => call.url.endsWith('/rest/v1/rpc/list_feed_posts')));
  assert.ok(calls.every((call) => call.body.p_category === 'tur_paket' && call.body.p_limit === 8));
  assert.ok(calls.some((call) => /dubai|dubay/i.test(call.body.p_search)));
});

test('non-tour AI drafts do not trigger feed searches', async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; return Response.json([]); };
  const matches = await findAiTourPostMatches({
    requests: [{ category: 'Mehmonxona', destination: 'Dubai' }],
    message: 'Dubai hotel kerak',
    authorization: 'Bearer test-user-token',
    signal: new AbortController().signal,
  });
  assert.deepEqual(matches, []);
  assert.equal(calls, 0);
});

test('AI response surfaces exact post links in a dedicated marketplace-offer block', () => {
  const root = path.join(__dirname, '..');
  const route = fs.readFileSync(path.join(root, 'app/api/ai/route.ts'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'app/dashboard/components/ai-response-text.tsx'), 'utf8');

  assert.match(route, /findAiTourPostMatches/);
  assert.match(route, /composePostMatchSection/);
  assert.match(route, /\[\[offer\]\]/);
  assert.match(route, /\/feed\/\$\{match\.id\}/);
  assert.match(renderer, /clarification\|note\|suggestion\|warning\|offer/);
  assert.match(renderer, /Platformadagi mos tur paketlar/);
  assert.match(renderer, /\^\\\/feed\\\/[0-9a-f-]\{36\}\$/i);
});
