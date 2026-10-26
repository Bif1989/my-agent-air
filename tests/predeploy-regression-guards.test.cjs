const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const auth = require('../lib/supabase-auth.ts');

const originalFetch = auth.authenticatedSupabaseFetch;
const originalSession = auth.getStoredSession;
const originalWindow = global.window;
const { getCurrentProfile, updateCurrentProfile } = require('../app/profile/profile-api.ts');

after(() => {
  auth.authenticatedSupabaseFetch = originalFetch;
  auth.getStoredSession = originalSession;
  if (originalWindow === undefined) delete global.window;
  else global.window = originalWindow;
});

const session = {
  access_token: 'header.eyJzdWIiOiJ1c2VyLTEiLCJleHAiOjQxMDI0NDQ4MDB9.signature',
  refresh_token: 'refresh',
  user: { id: 'user-1', email: 'agent@example.com' },
};

const profile = {
  id: 'user-1',
  full_name: 'Test Agent',
  avatar_url: null,
  company_name: 'Test Travel',
  region: 'Namangan viloyati',
  city: 'Chust tumani',
  phone: '+998901234567',
  agent_type: 'Turagent',
  services: ['aviachipta'],
  is_verified: false,
  is_active: true,
  registration_status: 'active',
  role: 'agent',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: null,
};

test('profile reads distinguish auth, HTTP and malformed-response failures', async () => {
  auth.getStoredSession = () => session;

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify({ message: 'expired' }), { status: 401 });
  await assert.rejects(getCurrentProfile(), /AUTH_SESSION_EXPIRED/);

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify({ message: 'denied' }), { status: 403 });
  await assert.rejects(getCurrentProfile(), /PROFILE_LOAD_FAILED_403/);

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify({ id: 'not-an-array' }), { status: 200 });
  await assert.rejects(getCurrentProfile(), /PROFILE_LOAD_INVALID_RESPONSE/);

  auth.authenticatedSupabaseFetch = async () => new Response('[]', { status: 200 });
  assert.equal(await getCurrentProfile(), null);

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify([profile]), { status: 200 });
  assert.deepEqual(await getCurrentProfile(), profile);
});

test('profile updates reject failed and malformed PATCH responses before reporting success', async () => {
  auth.getStoredSession = () => session;
  global.window = { dispatchEvent() {} };
  const editable = {
    full_name: profile.full_name,
    avatar_url: '',
    company_name: profile.company_name,
    region: profile.region,
    city: profile.city,
    phone: profile.phone,
    agent_type: profile.agent_type,
    services: profile.services,
  };

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify({ message: 'denied' }), { status: 403 });
  await assert.rejects(updateCurrentProfile(editable), /PROFILE_SAVE_FAILED_403/);

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  await assert.rejects(updateCurrentProfile(editable), /PROFILE_SAVE_INVALID_RESPONSE/);

  auth.authenticatedSupabaseFetch = async () => new Response('[]', { status: 200 });
  await assert.rejects(updateCurrentProfile(editable), /Profil saqlanmadi/);

  auth.authenticatedSupabaseFetch = async () => new Response(JSON.stringify([profile]), { status: 200 });
  assert.deepEqual(await updateCurrentProfile(editable), profile);
});

test('supplier email suppression is enforced on persisted outstanding invites', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/20261025235613_supplier_invite_email_suppression_guard.sql'), 'utf8');
  assert.match(sql, /supplier_invites_email_suppression_guard/);
  assert.match(sql, /before insert or update of channel, recipient on public\.supplier_invites/);
  assert.match(sql, /supplier_email_suppressed/);
  assert.match(sql, /reconcile_supplier_invites_for_suppression/);
  assert.match(sql, /i\.status in \('queued', 'failed'\)/);
});

test('homepage statistics drop stale values on failed or malformed refreshes', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/components/platform-stats.tsx'), 'utf8');
  assert.match(source, /if \(!response\.ok\) \{[\s\S]*?setStats\(null\);[\s\S]*?return;/);
  assert.match(source, /if \(!isPlatformStatsData\(data\)\) \{[\s\S]*?setStats\(null\);[\s\S]*?return;/);
  assert.match(source, /catch \{[\s\S]*?setStats\(null\);/);
});

 test('profile rejects malformed rows and other users without emitting save success', async () => {
  auth.getStoredSession = () => session;
  let events = 0;
  global.window = { dispatchEvent() { events++; } };
  for (const row of [null, {}, {...profile, id: 'other-user'}, {...profile, services: {}}, {...profile, is_active: 'true'}]) {
    auth.authenticatedSupabaseFetch = async () => Response.json([row]);
    await assert.rejects(getCurrentProfile(), /PROFILE_LOAD_INVALID_RESPONSE/);
    await assert.rejects(updateCurrentProfile({}), /PROFILE_SAVE_INVALID_RESPONSE/);
  }
  assert.equal(events, 0);
});
