const { test } = require('node:test');
const assert = require('node:assert/strict');
const { GET } = require('../app/api/public/platform-stats/route.ts');

const counts = { supplier_records: 21, hotels: 0, tour_operators: 2, travel_agents: 3, total_active: 7, agent_profiles: 9 };
const types = { Mehmonxona: 'hotels', Turoperator: 'tour_operators', Turagent: 'travel_agents' };

function mockCounts(t, override = () => undefined) {
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SECRET_KEY = 'local-fixture-key';
  t.after(() => {
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(input);
    const p = url.searchParams;
    assert.equal(init.method, 'HEAD');
    assert.equal(new Headers(init.headers).get('prefer'), 'count=exact');
    let metric;
    if (url.pathname === '/rest/v1/external_suppliers') metric = 'supplier_records';
    else {
      assert.equal(url.pathname, '/rest/v1/profiles');
      assert.equal(p.get('role'), 'eq.agent');
      if (!p.has('is_active')) metric = 'agent_profiles';
      else {
        assert.equal(p.get('is_active'), 'eq.true');
        assert.equal(p.get('registration_status'), 'eq.active');
        metric = p.has('agent_type') ? types[p.get('agent_type').slice(3)] : 'total_active';
      }
    }
    assert.ok(Object.hasOwn(counts, metric));
    calls.push(metric);
    return override(metric, calls.filter(item => item === metric).length)
      ?? new Response(null, { status: 200, headers: { 'Content-Range': '*/' + counts[metric] } });
  });
  return calls;
}

test('healthy public stats performs one query per count', async t => {
  const calls = mockCounts(t);
  const res = await GET();
  assert.equal(res.status, 200);
  assert.deepEqual([...calls].sort(), Object.keys(counts).sort());
});

test('public stats retries only the isolated unauthorized read and preserves exact counts including zero', async t => {
  const calls = mockCounts(t, (metric, attempt) =>
    metric === 'total_active' && attempt === 1 ? new Response(null, { status: 401 }) : undefined);
  const res = await GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /s-maxage=60/);
  const { updated_at, ...payload } = await res.json();
  assert.ok(Number.isFinite(Date.parse(updated_at)));
  assert.deepEqual(payload, counts);
  assert.deepEqual([...calls].sort(), [...Object.keys(counts), 'total_active'].sort());
});

for (const [name, override, expectedCalls] of [
  ['persistent isolated rejection', metric => metric === 'total_active' ? new Response(null, { status: 401 }) : undefined, 7],
  ['rejected server credential', () => new Response(null, { status: 401 }), 6],
  ['forbidden query', metric => metric === 'hotels' ? new Response(null, { status: 403 }) : undefined, 6],
  ['missing count header', metric => metric === 'hotels' ? new Response(null, { status: 200 }) : undefined, 6],
]) {
  test('public stats returns an uncached unavailable response for ' + name, async t => {
    const calls = mockCounts(t, override);
    const log = t.mock.method(console, 'error', () => {});
    const res = await GET();
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Object.keys(await res.json()), ['message']);
    assert.equal(calls.length, expectedCalls);
    assert.equal(log.mock.callCount(), 1);
  });
}
