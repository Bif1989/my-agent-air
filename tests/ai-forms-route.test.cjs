const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { POST } = require('../app/api/ai/route.ts');
const originalFetch = global.fetch;
const originalKey = process.env.OPENAI_API_KEY;
afterEach(() => { global.fetch = originalFetch; if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });

function request(body, auth = true) {
  return new NextRequest('https://example.invalid/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test-only-token' } : {}) }, body: JSON.stringify(body) });
}
function mockProvider(result, allowance = { allowed: true }) {
  process.env.OPENAI_API_KEY = 'test-only-never-sent';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'test-actor', is_anonymous: false });
    if (url.endsWith('/rpc/consume_ai_assistant_quota')) return Response.json(allowance);
    assert.equal(url, 'https://api.openai.com/v1/responses');
    return Response.json(result);
  };
  return calls;
}
const hotel = { category: 'Mehmonxona', origin: '', destination: 'Samarqand', travel_date: '2099-11-12', adults: 2, children: 1, infants: 0, budget: 120, currency: 'USD', description: 'Tinch xona', service_details: { kind: 'Mehmonxona', check_out: '2099-11-15', rooms: '1', child_ages: '7', budget_basis: 'per_room_night', meal_plan: 'breakfast' }, missing: [] };
function completed(drafts = [hotel]) { return { status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ message: 'Qoralama tayyor.', action: 'none', requests: drafts, clarifications: [], notes: [], suggestions: [], warnings: [] }) }] }] }; }

test('AI form endpoint uses the shared strict schema, preserves form context and returns reviewable data', async () => {
  const calls = mockProvider(completed());
  const res = await POST(request({ message: 'Nonushta qo‘shing', context: { locale: 'uz', formDraft: hotel } }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.equal(body.requests[0].service_details.check_out, '2099-11-15');
  assert.equal(body.requests[0].service_details.child_ages, '7');
  assert.equal(body.requests[0].budget, 120);
  assert.equal(body.requests[0].service_details.budget_basis, 'per_room_night');
  assert.deepEqual(body.requests[0].missing, []);
  const upstream = JSON.parse(calls.at(-1).options.body);
  assert.equal(upstream.store, false);
  assert.equal(upstream.text.format.strict, true);
  assert.equal(upstream.text.format.schema.properties.requests.items.properties.service_details.anyOf.length, 7);
  assert.ok(upstream.input.some(item => item.role === 'user' && item.content.includes('Current form draft') && item.content.includes('Samarqand')));
  assert.equal(calls.filter(call => call.url.includes('/rest/v1/requests')).length, 0, 'AI never publishes requests');
});
test('missing fields are calculated from the actual form, not trusted from AI', async () => {
  mockProvider(completed([{ ...hotel, service_details: { kind: 'Mehmonxona' } }]));
  const body = await (await POST(request({ message: 'Mehmonxona kerak' }))).json();
  assert.ok(body.requests[0].missing.some(text => text.includes('Chiqish sanasi')));
  assert.ok(body.requests[0].missing.some(text => text.includes('Xonalar soni')));
  assert.ok(body.requests[0].missing.some(text => text.includes('yoshini')));
});
test('unauthenticated requests and exhausted limits make no paid provider call', async () => {
  const calls = mockProvider(completed(), { allowed: false, code: 'USER_LIMIT' });
  assert.equal((await POST(request({ message: 'Hotel' }, false))).status, 401);
  assert.equal(calls.length, 0);
  const res = await POST(request({ message: 'Hotel' }));
  assert.equal(res.status, 429);
  assert.equal((await res.json()).code, 'USER_LIMIT');
  assert.ok(!calls.some(call => call.url.startsWith('https://api.openai.com')));
});
test('truncated, invalid or mismatched-category output cannot replace a form', async () => {
  for (const result of [
    { status: 'incomplete', output_text: '{"message":"partial' },
    { status: 'completed', output_text: 'not JSON' },
    { status: 'completed', output_text: 'null' },
    completed([{ ...hotel, service_details: { kind: 'Transfer' } }]),
  ]) {
    mockProvider(result);
    const res = await POST(request({ message: 'Hotel' }));
    assert.equal(res.status, 502);
    assert.equal((await res.json()).requests, undefined);
  }
});
test('a large multi-draft history entry is kept whole rather than truncated mid-JSON', async () => {
  const calls = mockProvider(completed());
  const history = 'Prepared drafts: ' + JSON.stringify(Array.from({ length: 12 }, () => ({ ...hotel, description: 'Tinch xona. '.repeat(30) })));
  assert.ok(history.length > 5000);
  assert.equal((await POST(request({ message: 'Nonushta qo‘shing', history: [{ role: 'assistant', content: history }] }))).status, 200);
  assert.ok(JSON.parse(calls.at(-1).options.body).input.some(item => item.content === history));
});
test('malformed and oversized bodies cannot trigger paid calls', async () => {
  const calls = mockProvider(completed());
  assert.equal((await POST(request(null))).status, 400);
  assert.equal((await POST(request({ message: 'x'.repeat(512001) }))).status, 413);
  assert.ok(!calls.some(call => call.url.startsWith('https://api.openai.com')));
});
