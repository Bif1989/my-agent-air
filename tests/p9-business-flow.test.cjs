const test = require('node:test');
const assert = require('node:assert/strict');
const authPath = require.resolve('../lib/supabase-auth.ts');
let userId = 'supplier-one';
let rows = [];
const calls = [];
require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
  getStoredSession: () => userId ? { user: { id: userId } } : null,
  authenticatedSupabaseFetch: async (path) => {
    calls.push(new URL(path, 'https://example.invalid/'));
    return { json: async () => rows };
  },
} };
const { getDealForRequest } = require('../app/deals/deals-api.ts');
const { getMyOfferForRequest } = require('../app/offers/offers-api.ts');

test('request handoff resolves only the current participant and preserves opaque request IDs', async () => {
  rows = [{ id: 'deal-one' }];
  const requestId = 'request & other=value';
  assert.deepEqual(await getDealForRequest(requestId), { id: 'deal-one' });
  const params = calls.at(-1).searchParams;
  assert.equal(params.get('request_id'), `eq.${requestId}`);
  assert.equal(params.get('or'), '(buyer_id.eq.supplier-one,seller_id.eq.supplier-one)');
  assert.equal(params.get('limit'), '1');
  assert.equal(params.get('select'), 'id');
  rows = [];
  assert.equal(await getDealForRequest('inaccessible'), null);
  userId = null;
  const before = calls.length;
  assert.throws(() => getDealForRequest('private'), /AUTH_SESSION_MISSING/);
  assert.equal(calls.length, before);
  userId = 'supplier-two';
  await getDealForRequest('same-request');
  assert.equal(calls.at(-1).searchParams.get('or'), '(buyer_id.eq.supplier-two,seller_id.eq.supplier-two)');
});

test('supplier offer lookup excludes withdrawn history and chooses latest own offer', async () => {
  userId = 'supplier-one';
  rows = [{ id: 'new-offer', status: 'pending' }];
  assert.equal((await getMyOfferForRequest('target-request')).id, 'new-offer');
  const params = calls.at(-1).searchParams;
  assert.equal(params.get('agent_id'), 'eq.supplier-one');
  assert.equal(params.get('request_id'), 'eq.target-request');
  assert.equal(params.get('status'), 'neq.withdrawn');
  assert.equal(params.get('order'), 'created_at.desc');
  rows = [];
  assert.equal(await getMyOfferForRequest('no-current-offer'), null);
});
