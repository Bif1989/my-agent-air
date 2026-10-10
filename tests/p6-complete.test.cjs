const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migration = 'supabase/migrations/20261010210000_p6_trust_matching_and_agent_ranking.sql';

test('P6 Geo-Tender uses trust as a bounded quality signal', () => {
  const sql = read(migration);
  assert.match(sql, /left join public\.profile_trust_stats ts on ts\.user_id=c\.profile_id/);
  assert.match(sql, /least\(10,/);
  assert.match(sql, /\+ trust_bonus\s+as total_score/);
  assert.match(sql, /'trust_score',trust_score/);
  assert.match(sql, /'trust_bonus',trust_bonus/);
  assert.match(sql, /'rating_average',rating_average/);
  assert.match(sql, /'review_count',review_count/);
  assert.match(sql, /'completed_deals',completed_deals/);
});

test('P6 refresh preserves durable Geo-Tender engagement history', () => {
  const sql = read(migration);
  assert.match(sql, /where request_id=p_request_id and status='matched'/);
  assert.match(sql, /where request_id=p_request_id and status not in \('responded','declined'\)/);
  assert.match(sql, /where public\.request_targets\.status not in \('responded','declined'\)/);
  assert.doesNotMatch(sql, /delete from public\.request_targets\s+where request_id=p_request_id and status<>'responded'/);
  assert.match(sql, /notified\/viewed\/responded\/declined history is preserved/);
});

test('P6 deduplicates multiple supplier capabilities before upsert', () => {
  const sql = read(migration);
  assert.match(sql, /best_capability_per_profile as/);
  assert.match(sql, /select distinct on \(profile_id\) \*/);
  assert.match(sql, /order by profile_id,total_score desc,distance_km asc nulls last,capability_id/);
});

test('P6 agent ranking RPC is security invoker and trust-first', () => {
  const sql = read(migration);
  assert.match(sql, /create or replace function public\.list_agents_with_trust/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /p_sort text default 'trust_desc'/);
  assert.match(sql, /coalesce\(ts\.trust_score,30\).*desc nulls last/);
  assert.match(sql, /revoke all on function public\.list_agents_with_trust[\s\S]*from public, anon, service_role/);
  assert.match(sql, /grant execute on function public\.list_agents_with_trust[\s\S]*to authenticated/);
});

test('P6 agent directory uses one trust-aware RPC and defaults to reliable partners', () => {
  const api = read('app/agents/agents-api.ts');
  const page = read('app/agents/page.tsx');
  assert.match(api, /rpc\/list_agents_with_trust/);
  assert.match(api, /AgentSort = "trust_desc"/);
  assert.match(api, /p_sort: options\.sort \|\| "trust_desc"/);
  assert.match(page, /useState<AgentSort>\("trust_desc"\)/);
  assert.match(page, /Trust \{trustScore\}\/100/);
  assert.match(page, /Eng ishonchli hamkorlar/);
});

test('P6 Geo-Tender UI explains trust contribution without expanding target payload columns', () => {
  const api = read('app/requests/request-targeting-api.ts');
  const summary = read('app/requests/request-targeting-summary.tsx');
  assert.match(api, /trust_score\?: number/);
  assert.match(api, /trust_bonus\?: number/);
  assert.match(api, /rating_average\?: number \| null/);
  assert.match(summary, /Trust \$\{reason\.trust_score\}\/100/);
  assert.match(summary, /reason\.trust_bonus/);
  assert.match(summary, /reason\.rating_average/);
  assert.match(api, /const SELECT_FIELDS = "request_id,profile_id,match_score,distance_km,match_reason,status"/);
});

test('P6 review panel follows current Uzbek/Russian UI language', () => {
  const panel = read('app/deals/deal-review-panel.tsx');
  assert.match(panel, /useUiSettings/);
  assert.match(panel, /Оцените партнёра/);
  assert.match(panel, /Hamkorni baholang/);
  assert.match(panel, /Hamkor reytingi/);
});
