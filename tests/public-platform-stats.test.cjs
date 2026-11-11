const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { GET } = require('../app/api/public/platform-stats/route.ts');

const initialFetch = global.fetch;
const initialSecret = process.env.SUPABASE_SECRET_KEY;
const initialConsoleError = console.error;

afterEach(() => {
  global.fetch = initialFetch;
  console.error = initialConsoleError;
  if (initialSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = initialSecret;
});

function metricFromRequest(input) {
  const url = new URL(typeof input === 'string' ? input : input.url);
  assert.ok(url.pathname.startsWith('/rest/v1/'), 'only the Supabase REST API may be mocked');
  if (url.pathname.endsWith('/external_suppliers')) return 'supplier_records';
  assert.ok(url.pathname.endsWith('/profiles'));
  const agentType = url.searchParams.get('agent_type');
  if (agentType === 'eq.Mehmonxona') return 'hotels';
  if (agentType === 'eq.Turoperator') return 'tour_operators';
  if (agentType === 'eq.Turagent') return 'travel_agents';
  return url.searchParams.has('registration_status') ? 'total_active' : 'agent_profiles';
}

function mockCounts(failingMetric = null, failAll = false) {
  process.env.SUPABASE_SECRET_KEY = 'test-only-server-key';
  const values = {
    total_active: 24,
    supplier_records: 1392,
    agent_profiles: 57,
    hotels: 4,
    tour_operators: 4,
    travel_agents: 4,
  };
  global.fetch = async (input) => {
    const metric = metricFromRequest(input);
    if (failAll || metric === failingMetric) {
      return Response.json({ code: 'PGRST000', message: '' }, { status: 503 });
    }
    return new Response(null, {
      status: 200,
      headers: { 'Content-Range': '0-0/' + values[metric] },
    });
  };
  console.error = () => {};
  return values;
}

test('public stats return all numeric counts and cache healthy responses briefly', async () => {
  const expected = mockCounts();
  const response = await GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /s-maxage=60/);
  const data = await response.json();
  assert.equal(data.degraded, false);
  for (const [key, count] of Object.entries(expected)) {
    assert.equal(data[key], count, key);
  }
});

test('public stats keep successful metrics and mark an unavailable count as unknown', async () => {
  const expected = mockCounts('supplier_records');
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.degraded, true);
  assert.equal(data.supplier_records, null, 'a failed count must not be presented as zero');
  assert.equal(data.total_active, expected.total_active);
  assert.equal(data.agent_profiles, expected.agent_profiles);
  assert.equal(data.hotels, expected.hotels);
});

test('public stats report temporary unavailability if every query fails', async () => {
  mockCounts(null, true);
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    message: 'Platforma statistikasi vaqtincha mavjud emas.',
  });
});

test('public stats require server-only Supabase credentials', async () => {
  delete process.env.SUPABASE_SECRET_KEY;
  global.fetch = () => { throw new Error('must not issue a query'); };
  const response = await GET();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
