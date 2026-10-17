const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261017041057_wallet_multirole_billing_foundation.sql'), 'utf8');
const billingPage = fs.readFileSync(path.join(root, 'app/billing/page.tsx'), 'utf8');
const billingApi = fs.readFileSync(path.join(root, 'app/billing/billing-api.ts'), 'utf8');
const requestNew = fs.readFileSync(path.join(root, 'app/requests/new/page.tsx'), 'utf8');
const requestEdit = fs.readFileSync(path.join(root, 'app/request-edit/page.tsx'), 'utf8');
const offerPanel = fs.readFileSync(path.join(root, 'app/requests/request-offer-panel.tsx'), 'utf8');
const requestApi = fs.readFileSync(path.join(root, 'app/requests/requests-api.ts'), 'utf8');
const offerApi = fs.readFileSync(path.join(root, 'app/offers/offers-api.ts'), 'utf8');
const dealApi = fs.readFileSync(path.join(root, 'app/deals/deals-api.ts'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'lib/supabase-auth.ts'), 'utf8');
const roles = fs.readFileSync(path.join(root, 'lib/billing-roles.ts'), 'utf8');

test('wallet rollout is feature-gated and defaults to five lifetime free deals', () => {
  assert.match(migration, /wallet_mode_enabled boolean not null default false/);
  assert.match(migration, /lifetime_free_limit integer not null default 5/);
  assert.match(migration, /low_balance_warning integer not null default 10000/);
  assert.match(migration, /wallet_topup_min integer not null default 5000/);
  assert.match(migration, /if not v_wallet_enabled then/);
  assert.match(migration, /elsif v_lifetime_sequence<=v_free_limit then v_fee:=0/);
  assert.doesNotMatch(migration, /wallet_mode_enabled boolean not null default true/);
});

test('wallet and ledger are read-only to authenticated clients and protected by own-row RLS', () => {
  assert.match(migration, /alter table public\.billing_wallets enable row level security/);
  assert.match(migration, /revoke insert, update, delete on public\.billing_wallets from authenticated/);
  assert.match(migration, /billing_wallets_select_own/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = user_id\)/);
  assert.match(migration, /alter table public\.billing_wallet_ledger enable row level security/);
  assert.match(migration, /revoke insert, update, delete on public\.billing_wallet_ledger from authenticated/);
  assert.match(migration, /billing_wallet_ledger_select_own/);
  assert.match(migration, /billing_wallet_ledger_payment_order_uq/);
  assert.match(migration, /billing_wallet_ledger_deal_fee_uq/);
});

test('completed paid deals deduct wallet atomically and insufficient balance raises instead of debt', () => {
  assert.match(migration, /select balance into v_wallet_balance from public\.billing_wallets where user_id=v_user_id for update/);
  assert.match(migration, /if coalesce\(v_wallet_balance,0\)<v_fee then/);
  assert.match(migration, /raise exception 'billing_insufficient_balance'/);
  assert.match(migration, /update public\.billing_wallets set balance=v_new_balance/);
  assert.match(migration, /'deal_charge',-v_fee,v_new_balance/);
  assert.match(migration, /v_billing_source:='wallet'; end if;[\s\S]*?insert into public\.deal_fees[\s\S]*?'paid'[\s\S]*?v_billing_source/);
  assert.match(auth, /billing_insufficient_balance/);
  assert.match(auth, /Balansingizni to‘ldiring/);
});

test('Unlimited bypasses wallet charging before the lifetime/free decision', () => {
  assert.match(migration, /if v_subscription_active then v_fee:=0; v_billing_source:='subscription'; elsif v_lifetime_sequence<=v_free_limit/);
});

test('multi-role deal snapshots are immutable billing inputs after offer acceptance', () => {
  assert.match(migration, /add column if not exists acting_role text/);
  assert.match(migration, /add column if not exists buyer_role_snapshot text/);
  assert.match(migration, /add column if not exists seller_role_snapshot text/);
  assert.match(migration, /app_private\.user_has_billing_role/);
  assert.match(migration, /app_private\.billing_role_from_category/);
  assert.match(migration, /v_request\.acting_role/);
  assert.match(migration, /v_offer\.acting_role/);
  assert.match(migration, /buyer_role_snapshot,seller_role_snapshot/);
  assert.match(migration, /coalesce\(v_deal\.buyer_role_snapshot/);
  assert.match(migration, /coalesce\(v_deal\.seller_role_snapshot/);
});

test('role prices and canonical aliases match the agreed tariff', () => {
  assert.match(roles, /travel_agent: \{[^}]*fee: 5000/);
  assert.match(roles, /aviation: \{[^}]*fee: 5000/);
  assert.match(roles, /tour_operator: \{[^}]*fee: 7000/);
  assert.match(roles, /hotel: \{[^}]*fee: 10000/);
  assert.match(roles, /transport: \{[^}]*fee: 7000/);
  assert.match(roles, /guide: \{[^}]*fee: 3000/);
  assert.match(roles, /restaurant: \{[^}]*fee: 5000/);
  assert.match(roles, /visa: \{[^}]*fee: 5000/);
  assert.match(migration, /when 'hotel' then 10000/);
  assert.match(migration, /when 'transport' then 7000/);
});

test('request and offer flows persist acting role while deals expose role snapshots', () => {
  assert.match(requestApi, /acting_role/);
  assert.match(offerApi, /acting_role/);
  assert.match(dealApi, /buyer_role_snapshot/);
  assert.match(dealApi, /seller_role_snapshot/);
  assert.match(requestNew, /ActingRoleSelector/);
  assert.match(requestNew, /getMyBillingRoles/);
  assert.match(requestEdit, /ActingRoleSelector/);
  assert.match(offerPanel, /billingRoleForCategory/);
  assert.match(offerPanel, /ActingRoleSelector/);
});

test('CLICK wallet top-up credits balance idempotently through the existing order table', () => {
  assert.match(migration, /purpose in \('subscription','wallet_topup'\)/);
  assert.match(migration, /purpose='wallet_topup' and plan_code is null/);
  assert.match(migration, /if v_order\.purpose='wallet_topup' then/);
  assert.match(migration, /'click_topup',v_order\.amount,v_new_balance,v_order\.id/);
  assert.match(migration, /wallet_ledger_id=v_ledger_id/);
  assert.match(billingApi, /purpose: "wallet_topup"/);
  assert.match(billingApi, /startClickWalletTopup/);
});

test('billing cabinet shows balance, one-time five-deal quota, top-up presets, low-balance warning and multi-role pricing', () => {
  assert.match(billingPage, /TOPUP_PRESETS = \[20_000, 50_000, 100_000\]/);
  assert.match(billingPage, /Har bir akkauntga jami 5 ta bepul/);
  assert.match(billingPage, /Bu limit har oy yangilanmaydi/);
  assert.match(billingPage, /lowBalance/);
  assert.match(billingPage, /Click bilan to‘ldirish/);
  assert.match(billingPage, /SIZNING YO‘NALISHLARINGIZ/);
  assert.match(billingPage, /Unlimited — 99 000 UZS/);
  assert.match(billingPage, /Yangi bitimlar qarzga yozilmaydi/);
});
