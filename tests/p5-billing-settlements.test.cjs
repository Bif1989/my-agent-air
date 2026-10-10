const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migration = 'supabase/migrations/20261010182000_p5_billing_settlements.sql';

test('P5.2 settlement tables are RLS protected and user-readable only for own account', () => {
  const sql = read(migration);
  assert.match(sql, /alter table public\.billing_settlements enable row level security/);
  assert.match(sql, /alter table public\.billing_settlement_items enable row level security/);
  assert.match(sql, /billing_settlements_select_own/);
  assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
  assert.match(sql, /billing_settlement_items_select_own/);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*billing_settlements to authenticated/i);
});

test('P5.2 admin settlement RPC requires active completed admin registration', () => {
  const sql = read(migration);
  const occurrences = sql.match(/p\.role = 'admin'[\s\S]{0,180}p\.registration_status = 'active'/g) || [];
  assert.ok(occurrences.length >= 4);
  assert.match(sql, /admin_record_billing_settlement/);
  assert.match(sql, /fees_must_be_pending_and_owned_by_user/);
  assert.match(sql, /fee_already_settled/);
});

test('P5.2 settlement is atomic and cannot settle one fee twice', () => {
  const sql = read(migration);
  assert.match(sql, /unique \(fee_id\)/);
  assert.match(sql, /where f\.id = any\(p_fee_ids\)[\s\S]*for update/);
  assert.match(sql, /f\.status = 'pending'/);
  assert.match(sql, /set status = case when p_kind = 'payment' then 'paid' else 'waived' end/);
  assert.match(sql, /paid_at = case when p_kind = 'payment'/);
});

test('P5.2 does not add automatic billing account blocking', () => {
  const sql = read(migration);
  const billingPage = read('app/billing/page.tsx');
  assert.doesNotMatch(sql, /set is_active = false/i);
  assert.doesNotMatch(sql, /registration_status\s*=\s*'blocked'/i);
  assert.match(billingPage, /Qarzdorlik platformaga kirishni avtomatik bloklamaydi/);
});

test('P5.2 exposes admin settlement workflow and user settlement history', () => {
  const adminApi = read('app/admin/billing/admin-billing-api.ts');
  const adminPage = read('app/admin/billing/page.tsx');
  const billingApi = read('app/billing/billing-api.ts');
  const billingPage = read('app/billing/page.tsx');
  assert.match(adminApi, /admin_list_billing_accounts/);
  assert.match(adminApi, /admin_record_billing_settlement/);
  assert.match(adminPage, /To‘landi deb belgilash/);
  assert.match(adminPage, /Hisobdan chiqarish/);
  assert.match(billingApi, /billing_settlements\?/);
  assert.match(billingPage, /Settlement tarixi/);
});
