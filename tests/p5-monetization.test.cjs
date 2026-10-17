const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migrationPath = 'supabase/migrations/20261010135500_p5_deal_fee_ledger.sql';

test('P5 historical migration gave each user five free completed deals per Tashkent month', () => {
  const sql = read(migrationPath);
  assert.match(sql, /monthly_sequence <= 5 then 0/);
  assert.match(sql, /date_trunc\('month', timezone\('Asia\/Tashkent'/);
  assert.match(sql, /status in \('free','pending','paid','waived'\)/);
  assert.match(sql, /unique \(deal_id, user_id\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /on conflict \(deal_id, user_id\) do nothing/);
});

test('P5 historical role prices match the agreed per-deal tariff', () => {
  const sql = read(migrationPath);
  assert.match(sql, /when 'turoperator' then 7000/);
  assert.match(sql, /when 'mehmonxona' then 10000/);
  assert.match(sql, /when 'transport' then 7000/);
  assert.match(sql, /when 'gid' then 3000/);
  assert.match(sql, /when 'restoran' then 5000/);
  assert.match(sql, /when 'turagent' then 5000/);
  assert.match(sql, /when 'aviakassa' then 5000/);
});

test('P5 records fees only when a deal becomes completed', () => {
  const sql = read(migrationPath);
  assert.match(sql, /if p_status = 'completed' then\s+perform app_private\.record_completed_deal_fees/);
  assert.doesNotMatch(sql, /if p_status = 'accepted' then\s+perform app_private\.record_completed_deal_fees/);
  assert.doesNotMatch(sql, /if p_status = 'processing' then\s+perform app_private\.record_completed_deal_fees/);
  assert.doesNotMatch(sql, /if p_status = 'issued' then\s+perform app_private\.record_completed_deal_fees/);
});

test('P5 billing ledger is read-only to authenticated clients and protected by RLS', () => {
  const sql = read(migrationPath);
  assert.match(sql, /alter table public\.deal_fees enable row level security/);
  assert.match(sql, /revoke all on table public\.deal_fees from anon, authenticated/);
  assert.match(sql, /grant select on table public\.deal_fees to authenticated/);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.doesNotMatch(sql, /grant .*insert.*deal_fees to authenticated/i);
  assert.doesNotMatch(sql, /grant .*update.*deal_fees to authenticated/i);
  assert.doesNotMatch(sql, /grant .*delete.*deal_fees to authenticated/i);
});

test('billing UI keeps P5 fee history while the wallet successor adds lifetime quota and CLICK top-up', () => {
  const api = read('app/billing/billing-api.ts');
  const page = read('app/billing/page.tsx');
  const deals = read('app/deals/page.tsx');
  assert.match(api, /rpc\/get_billing_summary/);
  assert.match(api, /rpc\/get_billing_wallet_status/);
  assert.match(api, /deal_fees\?/);
  assert.match(page, /Har bir akkauntga jami 5 ta bepul/);
  assert.match(page, /Bu limit har oy yangilanmaydi/);
  assert.match(page, /Click bilan to‘ldirish/);
  assert.match(page, /outstanding_amount/);
  assert.match(deals, /href="\/billing"/);
  assert.doesNotMatch(api, /click\.uz|payme\.uz|stripe/i);
});
