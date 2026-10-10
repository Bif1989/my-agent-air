const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migration = 'supabase/migrations/20261010193000_p5_monthly_unlimited.sql';

test('P5.3 monthly Unlimited plan starts disabled until admin sets a positive price', () => {
  const sql = read(migration);
  assert.match(sql, /monthly_unlimited', 'Oylik Unlimited', null, 'UZS', 30, false/);
  assert.match(sql, /price_amount is null or price_amount > 0/);
  assert.match(sql, /invalid_subscription_price/);
  assert.match(sql, /admin_set_billing_subscription_plan/);
});

test('P5.3 subscription tables are RLS protected and authenticated users can only read their own subscription rows', () => {
  const sql = read(migration);
  assert.match(sql, /alter table public\.billing_subscription_plans enable row level security/);
  assert.match(sql, /alter table public\.billing_subscriptions enable row level security/);
  assert.match(sql, /billing_subscriptions_select_own/);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*billing_subscriptions to authenticated/i);
});

test('P5.3 active subscription makes completed deals free without changing previous debt', () => {
  const sql = read(migration);
  assert.match(sql, /s\.starts_at <= p_completed_at/);
  assert.match(sql, /s\.ends_at > p_completed_at/);
  assert.match(sql, /v_billing_source := 'subscription'/);
  assert.match(sql, /billing_source in \('free_quota','per_deal','subscription'\)/);
  assert.doesNotMatch(sql, /update public\.deal_fees[\s\S]{0,220}status = 'waived'/i);
  assert.doesNotMatch(sql, /set is_active = false/i);
});

test('P5.3 billing summary reports next deal as free while subscription is active', () => {
  const sql = read(migration);
  assert.match(sql, /subscription\.is_active then 0/);
  assert.match(sql, /get_billing_subscription_status/);
  assert.match(sql, /days_remaining/);
});

test('P5.3 renewals stack after the latest paid period instead of losing remaining days', () => {
  const sql = read(migration);
  assert.match(sql, /select max\(s\.ends_at\) into v_latest_end/);
  assert.match(sql, /v_start := greatest\(clock_timestamp\(\), coalesce\(v_latest_end, clock_timestamp\(\)\)\)/);
  assert.match(sql, /v_end := v_start \+ make_interval\(days => v_plan\.duration_days\)/);
});

test('P5.3 privileged subscription RPCs require active completed admin registration', () => {
  const sql = read(migration);
  const guards = sql.match(/p\.role = 'admin'[\s\S]{0,180}p\.registration_status = 'active'/g) || [];
  assert.ok(guards.length >= 5);
  assert.match(sql, /admin_activate_billing_subscription/);
  assert.match(sql, /subscription_plan_inactive/);
  assert.match(sql, /agent_not_found/);
});

test('P5.3 UI exposes user Unlimited status and admin configuration without an external gateway call', () => {
  const userApi = read('app/billing/subscription/subscription-api.ts');
  const userPage = read('app/billing/subscription/page.tsx');
  const adminApi = read('app/admin/billing/subscriptions/admin-subscription-api.ts');
  const adminPage = read('app/admin/billing/subscriptions/page.tsx');
  const billingPage = read('app/billing/page.tsx');
  const adminHome = read('app/admin/page.tsx');
  assert.match(userApi, /get_billing_subscription_status/);
  assert.match(userPage, /Oylik abonent tarifi/);
  assert.match(userPage, /Abonent sotib olish oldingi per-deal qarzdorlikni o‘chirmaydi/);
  assert.match(adminApi, /admin_set_billing_subscription_plan/);
  assert.match(adminApi, /admin_activate_billing_subscription/);
  assert.match(adminPage, /Unlimited tarifni faollashtirish/);
  assert.match(billingPage, /href="\/billing\/subscription"/);
  assert.match(adminHome, /href="\/admin\/billing\/subscriptions"/);
  assert.doesNotMatch(userApi + adminApi, /https?:\/\/|click\.uz|payme\.uz|stripe/i);
});
