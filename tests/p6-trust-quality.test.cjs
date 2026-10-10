const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migration = 'supabase/migrations/20261010202000_p6_deal_reviews_trust.sql';

test('P6 reviews require a completed real deal and the reviewer must be a participant', () => {
  const sql = read(migration);
  assert.match(sql, /v_deal\.status <> 'completed'/);
  assert.match(sql, /v_uid <> v_deal\.buyer_id and v_uid <> v_deal\.seller_id/);
  assert.match(sql, /constraint deal_reviews_one_per_reviewer unique \(deal_id, reviewer_id\)/);
  assert.match(sql, /constraint deal_reviews_not_self check \(reviewer_id <> reviewee_id\)/);
  assert.match(sql, /rating between 1 and 5/);
});

test('P6 review and trust tables cannot be directly edited by authenticated clients', () => {
  const sql = read(migration);
  assert.match(sql, /alter table public\.deal_reviews enable row level security/);
  assert.match(sql, /alter table public\.profile_trust_stats enable row level security/);
  assert.match(sql, /revoke all on table public\.deal_reviews from anon, authenticated/);
  assert.match(sql, /revoke all on table public\.profile_trust_stats from anon, authenticated/);
  assert.match(sql, /grant select on table public\.profile_trust_stats to authenticated/);
  assert.doesNotMatch(sql, /grant .*insert.*deal_reviews to authenticated/i);
  assert.doesNotMatch(sql, /grant .*update.*profile_trust_stats to authenticated/i);
});

test('P6 trust score is bounded and refreshed by completed deals, reviews and verification', () => {
  const sql = read(migration);
  assert.match(sql, /trust_score between 0 and 100/);
  assert.match(sql, /least\(\s*100,/);
  assert.match(sql, /new\.status = 'completed'/);
  assert.match(sql, /perform app_private\.refresh_profile_trust_stats\(new\.reviewee_id\)/);
  assert.match(sql, /old\.is_verified is distinct from new\.is_verified/);
  assert.match(sql, /review_count > 0 and v_rating is not null/);
});

test('P6 public-facing review list is authenticated and only exposes active agent reviews', () => {
  const sql = read(migration);
  assert.match(sql, /create or replace function public\.list_agent_reviews/);
  assert.match(sql, /if v_uid is null then/);
  assert.match(sql, /app_private\.account_is_active\(v_uid\)/);
  assert.match(sql, /p\.is_active is true and p\.registration_status = 'active'/);
  assert.match(sql, /limit greatest\(1, least\(coalesce\(p_limit, 10\), 50\)\)/);
});

test('P6 UI only asks for a review after completion and agent profile shows verified reputation', () => {
  const panel = read('app/deals/deal-review-panel.tsx');
  const detail = read('app/deal-detail/page.tsx');
  const agent = read('app/agent-detail/page.tsx');
  assert.match(panel, /if \(!completed\) return null/);
  assert.match(panel, /submitDealReview/);
  assert.match(panel, /Bir bitim uchun bir marta baho beriladi/);
  assert.match(detail, /completed=\{deal\.status === "completed"\}/);
  assert.match(agent, /P6 · Trust Score/);
  assert.match(agent, /Tasdiqlangan bitim baholari/);
  assert.match(agent, /Yakunlangan bitim asosida/);
});
