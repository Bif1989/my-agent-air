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
  assert.match(source, /rt\.status in \('matched','notified','viewed','responded'\)/);
  assert.match(source, /r\.distribution_mode='broadcast'/);
  assert.match(source, /Agents can create own offers/);
});

test('P3 prefilters supplier types and avoids refreshes for non-matching request edits', () => {
  const source = read('supabase/migrations/20261010154500_p3_geo_tender_matching_efficiency.sql');
  assert.match(source, /v_capability_types text\[\]/);
  assert.match(source, /c\.capability_type=any\(v_capability_types\)/);
  assert.match(source, /when 'Mehmonxona' then array\['hotel','travel_agent','tour_operator'\]/);
  assert.match(source, /when 'Transfer' then array\['transport','travel_agent','tour_operator'\]/);
  assert.match(source, /new\.category is not distinct from old\.category/);
  assert.match(source, /update of category,destination,destination_lat,destination_lng,adults,children,infants,budget,currency,distribution_mode,status/);
  assert.doesNotMatch(source, /update of[^\n]*service_details/);
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
  assert.match(source, /grant select, insert, update, delete on table public\.request_targets to service_role/);
  assert.match(source, /grant execute on function public\.mark_request_target_viewed\(uuid\) to authenticated/);
});

test('matched suppliers can decline only their own unresponded target', () => {
  const source = read('supabase/migrations/20261009020000_geo_tender_engagement_tracking.sql');
  assert.match(source, /create or replace function app_private\.decline_request_target_internal\(p_request_id uuid\)/);
  assert.match(source, /profile_id = v_uid/);
  assert.match(source, /set status = 'declined'/);
  assert.match(source, /status in \('matched', 'notified', 'viewed'\)/);
  assert.match(source, /create or replace function public\.decline_request_target\(p_request_id uuid\)/);
  assert.match(source, /app_private\.decline_request_target_internal\(p_request_id\)/);
  assert.match(source, /grant execute on function public\.decline_request_target\(uuid\) to authenticated/);
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

test('existing offers are backfilled as real Geo Tender responses', () => {
  const source = read('supabase/migrations/20261009020000_geo_tender_engagement_tracking.sql');
  assert.match(source, /update public\.request_targets rt/);
  assert.match(source, /set status = 'responded'/);
  assert.match(source, /from public\.offers o/);
  assert.match(source, /o\.request_id = rt\.request_id/);
  assert.match(source, /o\.agent_id = rt\.profile_id/);
});

test('request targeting client records a view before loading the supplier match summary', () => {
  const api = read('app/requests/request-targeting-api.ts');
  const summary = read('app/requests/request-targeting-summary.tsx');
  assert.match(api, /rpc\/mark_request_target_viewed/);
  assert.match(api, /p_request_id: requestId/);
  assert.match(summary, /markOwnRequestTargetViewed\(requestId\)/);
  assert.match(summary, /then\(\(\) => getOwnRequestTarget\(requestId\)\)/);
});

test('request targeting client can decline an unsuitable match and leave the request', () => {
  const api = read('app/requests/request-targeting-api.ts');
  const summary = read('app/requests/request-targeting-summary.tsx');
  assert.match(api, /rpc\/decline_request_target/);
  assert.match(summary, /declineOwnRequestTarget\(requestId\)/);
  assert.match(summary, /So‘rov mos emas/);
  assert.match(summary, /router\.replace\("\/requests\?tab=market"\)/);
});

test('request owner funnel receives realtime target changes with low-cost resilient refresh fallbacks', () => {
  const migration = read('supabase/migrations/20261009143000_geo_tender_realtime_funnel.sql');
  const realtime = read('lib/supabase-realtime.ts');
  const summary = read('app/requests/request-targeting-summary.tsx');
  assert.match(migration, /alter publication supabase_realtime add table public\.request_targets/);
  assert.match(realtime, /subscribeToRequestTargets\(requestId/);
  assert.match(realtime, /table === "messages" \|\| table === "request_targets"/);
  assert.match(summary, /subscribeToRequestTargets\(requestId, scheduleRefresh\)/);
  assert.match(summary, /visibilitychange/);
  assert.match(summary, /180_000/);
  assert.match(summary, /document\.visibilityState === "visible" && navigator\.onLine/);
  assert.match(summary, /removeChannel\(subscription\.channel\)/);
  assert.match(summary, /Avtomatik yangilanadi/);
});

test('external supplier matching shows bilingual operational status and match scores', () => {
  const source = read('app/requests/supplier-matching.tsx');
  assert.match(source, /useUiSettings/);
  assert.match(source, /inviteStats/);
  assert.match(source, /Совпадение/);
  assert.match(source, /Статус внешних запросов/);
  assert.match(source, /supplier\.match_score/);
});