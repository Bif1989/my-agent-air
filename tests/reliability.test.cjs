const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../lib/supabase-auth.ts');
const { mergeMessages } = require('../lib/chat-state.ts');
const { safeNextPath } = require('../lib/navigation.ts');
const { isRequestCurrent, tashkentDate } = require('../lib/request-freshness.ts');
const { parseRequestDraft, readRequestDraft } = require('../lib/request-assistant.ts');
const { splitServiceDetails, joinServiceDetails } = require('../lib/request-details.ts');
const { listMessengerMessages, sendMessengerMessage } = require('../app/messenger/messenger-api.ts');
const { listRequests } = require('../app/requests/requests-api.ts');

function jwt(sub, exp = Math.floor(Date.now() / 1000) + 3600) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub, exp })}.test`;
}
const session = { access_token: jwt('test-user'), refresh_token: 'old-refresh', user: { id: 'test-user', email: 'test@example.invalid' } };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  const storage = new Map();
  global.window = new EventTarget();
  global.localStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
  Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
  auth.saveSession(session);
});

test('parallel refreshes make one auth request and share the new session', async () => {
  let calls = 0;
  const newAccess = jwt('test-user');
  global.fetch = async () => { calls++; await new Promise((resolve) => setImmediate(resolve)); return json({ ...session, access_token: newAccess, refresh_token: 'new-refresh' }); };
  const sessions = await Promise.all(Array.from({ length: 12 }, () => auth.refreshSession()));
  assert.equal(calls, 1);
  assert.ok(sessions.every((value) => value.access_token === newAccess));
});

test('network outages and 500 responses preserve the session for retry', async () => {
  global.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(auth.refreshSession(), /Ulanish/);
  assert.deepEqual(auth.getStoredSession(), session);
  global.fetch = async () => json({}, 500);
  await assert.rejects(auth.refreshSession(), /Ulanish/);
  assert.deepEqual(auth.getStoredSession(), session);
});

test('invalid refresh token clears the expired session', async () => {
  global.fetch = async () => json({ error_code: 'refresh_token_not_found' }, 400);
  assert.equal(await auth.refreshSession(), null);
  assert.equal(auth.getStoredSession(), null);
});

test('logout while refreshing cannot restore an old session', async () => {
  let finish;
  global.fetch = () => new Promise((resolve) => { finish = resolve; });
  const refresh = auth.refreshSession();
  auth.clearSession();
  finish(json({ ...session, access_token: jwt('test-user') }));
  assert.equal(await refresh, null);
  assert.equal(auth.getStoredSession(), null);
});

test('refresh from another tab wins after the Web Lock is acquired', async () => {
  let calls = 0;
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: async (_name, action) => { auth.saveSession({ ...session, refresh_token: 'other-tab' }); return action(); } } } });
  global.fetch = async () => { calls++; return json({}); };
  assert.equal((await auth.refreshSession()).refresh_token, 'other-tab');
  assert.equal(calls, 0);
});

test('authenticated retry preserves the body and custom Headers', async () => {
  const seen = [];
  const freshToken = jwt('test-user');
  global.fetch = async (url, init) => {
    if (url.includes('/auth/')) return json({ ...session, access_token: freshToken });
    seen.push(init);
    return seen.length === 1 ? json({}, 401) : json({ saved: true });
  };
  await auth.authenticatedSupabaseFetch('requests', { method: 'POST', body: '{"a":1}', headers: new Headers({ Prefer: 'return=representation' }) });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].headers.Authorization, `Bearer ${freshToken}`);
  assert.equal(seen[1].headers.prefer, 'return=representation');
  assert.equal(seen[1].body, '{"a":1}');
});

test('blocked-account error is readable and does not log the user out', async () => {
  global.fetch = async () => json({ message: 'account_inactive', code: '42501' }, 403);
  await assert.rejects(auth.authenticatedSupabaseFetch('requests'), /bloklangan/);
  assert.deepEqual(auth.getStoredSession(), session);
});

test('message retry reuses the same id and returns the already saved row', async () => {
  const saved = { id: 'stable-id', room_id: 'room-a', sender_id: session.user.id, message: 'Salom', created_at: '2026-10-04T00:00:00Z' };
  const calls = [];
  global.fetch = async (url, init) => { calls.push({ url, init }); return json(init.method === 'POST' ? [] : [saved]); };
  assert.equal((await sendMessengerMessage('room-a', 'Salom', 'stable-id')).id, 'stable-id');
  assert.equal(JSON.parse(calls[0].init.body).id, 'stable-id');
  assert.match(calls[0].init.headers.prefer || calls[0].init.headers.Prefer, /ignore-duplicates/);
  assert.match(calls[1].url, /sender_id=eq.test-user/);
});

test('older-message cursor preserves timestamp precision and id tie-break', async () => {
  let query;
  global.fetch = async (url) => { query = new URL(url); return json([{ id: '2' }, { id: '1' }]); };
  const before = { id: '00000000-0000-4000-a000-000000000001', created_at: '2026-10-04T10:00:00.123456+00:00' };
  assert.deepEqual((await listMessengerMessages('room-a', { before })).map((value) => value.id), ['1', '2']);
  assert.equal(query.searchParams.get('order'), 'created_at.desc,id.desc');
  assert.ok(query.searchParams.get('or').includes(`created_at.eq.${before.created_at},id.lt.${before.id}`));
});

test('message merge deduplicates realtime/send responses without changing other ids', () => {
  const old = [{ id: 'a', created_at: '2026-10-04T00:00:00Z', message: 'old' }];
  const result = mergeMessages(old, [{ ...old[0], message: 'updated' }, { id: 'b', created_at: old[0].created_at }]);
  assert.deepEqual(result.map((value) => value.id), ['a', 'b']);
  assert.equal(result[0].message, 'updated');
  assert.equal(old[0].message, 'old');
});

test('safe return path rejects external and encoded redirect tricks', () => {
  for (const value of ['https://evil.invalid', '//evil.invalid', '/%2f%2fevil.invalid', '/%5cevil.invalid', '/login?next=/dashboard']) assert.equal(safeNextPath(value), '/dashboard');
  assert.equal(safeNextPath('/deals/123#chat'), '/deals/123#chat');
});

test('freshness uses the Tashkent calendar boundary and 30-day undated expiry', () => {
  const now = new Date('2026-10-04T20:00:00Z');
  assert.equal(tashkentDate(now), '2026-10-05');
  assert.equal(isRequestCurrent({ travel_date: '2026-10-04', created_at: now.toISOString() }, now), false);
  assert.equal(isRequestCurrent({ travel_date: '2026-10-05', created_at: now.toISOString() }, now), true);
  assert.equal(isRequestCurrent({ travel_date: null, created_at: '2026-09-01T00:00:00Z' }, now), false);
});

test('request filters combine expiry/search safely and include pagination', async () => {
  let query;
  global.fetch = async (url) => { query = new URL(url); return json([]); };
  await listRequests({ status: 'open', freshness: 'current', search: 'TAS),status.eq.closed', offset: 20 });
  assert.equal(query.searchParams.get('offset'), '20');
  assert.equal(query.searchParams.get('status'), 'eq.open');
  assert.ok(query.searchParams.get('and').includes('travel_date.gte.'));
  assert.ok(!query.searchParams.get('and').includes('TAS),status.eq.closed'));
});

test('assistant builds a reviewed draft from Uzbek text without publishing', () => {
  const parsed = parseRequestDraft('TAS–IST 10 oktabr 2 kishi 1 bola 23 kg 500 USD', {}, new Date('2026-10-04T10:00:00Z'));
  assert.equal(parsed.draft.origin, 'Toshkent');
  assert.equal(parsed.draft.destination, 'Istanbul');
  assert.equal(parsed.draft.travel_date, '2026-10-10');
  assert.equal(parsed.draft.adults, 2);
  assert.equal(parsed.draft.children, 1);
  assert.equal(parsed.draft.budget, 500);
  assert.equal(parsed.missing.length, 0);
});

test('assistant expands airport abbreviations to canonical city names', () => {
  const parsed = parseRequestDraft('SKD-DXB aviachipta 15 oktabr 2 kishi', {}, new Date('2026-10-04T10:00:00Z'));
  assert.equal(parsed.draft.origin, 'Samarqand');
  assert.equal(parsed.draft.destination, 'Dubai');
});

test('assistant does not invent missing fields or accept invalid dates', () => {
  const parsed = parseRequestDraft('Mehmonxona 31.02.2026', {}, new Date('2026-10-04T10:00:00Z'));
  assert.equal(parsed.draft.travel_date, undefined);
  assert.ok(parsed.notes.length);
  assert.ok(parsed.missing.includes('qayerdan / shahar'));
});

test('assistant URL draft ignores owner/status and rejects non-finite/negative inputs', () => {
  const draft = readRequestDraft(JSON.stringify({ category: 'Aviachipta', created_by: 'other', status: 'accepted', adults: -1, budget: -100, currency: 'FAKE', origin: 'TAS' }));
  assert.deepEqual(draft, { category: 'Aviachipta', origin: 'TAS' });
});

test('service details survive editing without duplicate descriptions', () => {
  const fields = { rooms: '2', nights: '3', vehicle: '', language: '' };
  const full = joinServiceDetails('Nonushta kerak', 'Mehmonxona', fields);
  const split = splitServiceDetails(full);
  assert.equal(split.text, 'Nonushta kerak');
  assert.deepEqual(split.details, fields);
  assert.equal(joinServiceDetails(split.text, 'Mehmonxona', split.details), full);
});

test('recovery hash validates the token before storing a recovery session', async () => {
  const recoveryToken = jwt('recovery-user');
  global.fetch = async (_url, init) => {
    assert.equal(init.headers.Authorization, `Bearer ${recoveryToken}`);
    return json({ id: 'recovery-user', email: 'recovery@example.invalid' });
  };
  const recovered = await auth.consumeRecoveryLink(`https://agent.bifavia.uz/reset-password#type=recovery&access_token=${recoveryToken}&refresh_token=recovery-refresh`);
  assert.equal(recovered.user.id, 'recovery-user');
  assert.equal(recovered.refresh_token, 'recovery-refresh');
});

test('expired recovery links preserve the current session and show an actionable error', async () => {
  global.fetch = async () => json({}, 401);
  await assert.rejects(auth.consumeRecoveryLink('https://agent.bifavia.uz/reset-password#type=recovery&access_token=expired&refresh_token=expired'), /Yangi havola/);
  assert.deepEqual(auth.getStoredSession(), session);
});
