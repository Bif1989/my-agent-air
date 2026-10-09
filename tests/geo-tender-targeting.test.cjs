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

test('matched suppliers can only record their own request view through a narrow RPC', () => {
  const source = read('supabase/migrations/20261009020000_geo_tender_engagement_tracking.sql');
  assert.match(source, /create or replace function app_private\.mark_request_target_viewed_internal\(p_request_id uuid\)/);
  assert.match(source, /v_uid uuid := auth\.uid\(\)/);
  assert.match(source, /profile_id = v_uid/);
  assert.match(source, /status in \('matched', 'notified'\)/);
  assert.match(source, /create or replace function public\.mark_request_target_viewed\(p_request_id uuid\)/);
  assert.match(source, /security invoker/);
  assert.match(source, /app_private\.mark_request_target_viewed_internal\(p_request_id\)/);
  assert.match(source, /revoke insert, update, delete, truncate, references, trigger on table public\.request_targets from authenticated/);
  assert.match(source, /grant select on table public\.request_targets to authenticated/);
  assert.match(source, /grant execute on function public\.mark_request_target_viewed\(uuid\) to authenticated/);
});

test('creating an offer marks the matching request target as responded on the database', () => {
  const source = read('supabase/migrations/20261009020000_geo_tender_engagement_tracking.sql');
  assert.match(source, /create or replace function app_private\.mark_request_target_responded\(\)/);
  assert.match(source, /profile_id = new\.agent_id/);
  assert.match(source, /status = 'responded'/);
  assert.match(source, /status in \('matched', 'notified', 'viewed'\)/);
  assert.match(source, /create trigger trg_offers_mark_request_target_responded/);
  assert.match(source, /after insert on public\.offers/);
});

test('request targeting client records a view before loading the supplier match summary', () => {
  const api = read('app/requests/request-targeting-api.ts');
  const summary = read('app/requests/request-targeting-summary.tsx');
  assert.match(api, /rpc\/mark_request_target_viewed/);
  assert.match(api, /p_request_id: requestId/);
  assert.match(summary, /markOwnRequestTargetViewed\(requestId\)/);
  assert.match(summary, /then\(\(\) => getOwnRequestTarget\(requestId\)\)/);
});
