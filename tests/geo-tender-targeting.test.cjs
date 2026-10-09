const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('geo tender foundation stores supplier capabilities and explicit request targets', () => {
  const source = read('supabase/migrations/20261009010000_geo_tender_targeted_distribution_foundation.sql');
  assert.match(source, /create table if not exists public\.supplier_capabilities/);
  assert.match(source, /create table if not exists public\.request_targets/);
  assert.match(source, /capability_type in \('aviation','travel_agent','tour_operator','hotel','transport','guide','restaurant','visa','other'\)/);
  assert.match(source, /latitude double precision/);
  assert.match(source, /longitude double precision/);
  assert.match(source, /capacity integer/);
  assert.match(source, /onboarding_status in \('seeded','in_progress','complete'\)/);
});

test('new targeted requests are matched automatically and marketplace visibility is target-scoped', () => {
  const source = read('supabase/migrations/20261009010000_geo_tender_targeted_distribution_foundation.sql');
  assert.match(source, /default 'targeted'/);
  assert.match(source, /refresh_request_targets_internal/);
  assert.match(source, /trg_requests_auto_target/);
  assert.match(source, /exists\(select 1 from public\.request_targets rt where rt\.request_id=requests\.id and rt\.profile_id=\(select auth\.uid\(\)\)/);
  assert.match(source, /r\.distribution_mode='broadcast'/);
  assert.match(source, /Agents can create own offers/);
});

test('request push notifications use matched targets instead of broadcasting targeted requests', () => {
  const source = read('supabase/functions/push-dispatch/index.ts');
  assert.match(source, /distribution_mode/);
  assert.match(source, /from\("request_targets"\)/);
  assert.match(source, /Yangi mos so‘rov/);
  assert.match(source, /status: "notified"/);
});
