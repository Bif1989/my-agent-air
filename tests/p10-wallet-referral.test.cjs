const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migration = read('supabase/migrations/20261017050615_wallet_unlimited_and_three_level_referrals.sql');
const subscriptionApi = read('app/billing/subscription/subscription-api.ts');
const subscriptionPage = read('app/billing/subscription/page.tsx');
const referralApi = read('lib/referral-api.ts');
const referralPage = read('app/referral/page.tsx');
const registerPage = read('app/register/page.tsx');
const profilePage = read('app/profile/page.tsx');
const globals = read('app/globals.css');

test('wallet can atomically purchase Unlimited without a new server route', () => {
  assert.match(migration, /purchase_billing_subscription_from_wallet/);
  assert.match(migration, /where w\.user_id = v_user_id\s+for update/);
  assert.match(migration, /v_wallet\.balance < v_plan\.price_amount/);
  assert.match(migration, /'wallet'/);
  assert.match(migration, /-v_plan\.price_amount/);
  assert.match(migration, /grant execute on function public\.purchase_billing_subscription_from_wallet\(text\) to authenticated, service_role/);
  assert.match(subscriptionApi, /rpc\/purchase_billing_subscription_from_wallet/);
  assert.match(subscriptionApi, /"wallet"/);
  assert.match(subscriptionPage, /balansdan to‘lash/);
  assert.match(subscriptionPage, /window\.confirm/);
  assert.match(subscriptionPage, /getBillingWalletStatus/);
});

test('three-level referral rewards are fixed at 15k, 10k and 5k', () => {
  assert.match(migration, /level = 1 and amount = 15000/);
  assert.match(migration, /level = 2 and amount = 10000/);
  assert.match(migration, /level = 3 and amount = 5000/);
  assert.match(migration, /for v_level in 1\.\.3 loop/);
  assert.match(migration, /case v_level when 1 then 15000 when 2 then 10000 else 5000 end/);
  assert.match(referralPage, /15000/);
  assert.match(referralPage, /10000/);
  assert.match(referralPage, /5000/);
});

test('referral reward requires a verified active real business profile', () => {
  assert.match(migration, /p\.is_verified = true/);
  assert.match(migration, /p\.is_active = true/);
  assert.match(migration, /p\.registration_status = 'active'/);
  assert.match(migration, /nullif\(trim\(coalesce\(p\.company_name, ''\)\), ''\) is not null/);
  assert.match(migration, /profiles_process_referral_qualification/);
  assert.match(referralPage, /Faqat tasdiqlangan real bizneslar|Bonus faqat real biznes uchun/);
});

test('referral claims resist self-referrals, cycles and old-account attachment', () => {
  assert.match(migration, /claim_window_expired/);
  assert.match(migration, /interval '7 days'/);
  assert.match(migration, /self_referral/);
  assert.match(migration, /with recursive chain/);
  assert.match(migration, /referral_cycle/);
  assert.match(migration, /referred_user_id uuid primary key/);
  assert.match(migration, /referral_rewards_referred_level_key unique/);
});

test('private referral tables are not browser-readable and public access is RPC-only', () => {
  assert.match(migration, /create table if not exists app_private\.referral_codes/);
  assert.match(migration, /create table if not exists app_private\.referrals/);
  assert.match(migration, /create table if not exists app_private\.referral_rewards/);
  assert.match(migration, /revoke all on app_private\.referral_codes from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.claim_referral\(text\) from public, anon/);
  assert.match(migration, /revoke all on function public\.get_my_referral_dashboard\(\) from public, anon/);
  assert.match(referralApi, /rpc\/get_my_referral_dashboard/);
  assert.match(referralApi, /rpc\/claim_referral/);
});

test('registration captures referral links without making signup depend on bonus processing', () => {
  assert.match(registerPage, /new URLSearchParams\(window\.location\.search\)\.get\("ref"\)/);
  assert.match(registerPage, /claimReferralCode/);
  assert.match(registerPage, /claimReferralCode\(referralCode\)\.catch\(\(\) => undefined\)/);
  assert.match(registerPage, /Referal taklif qabul qilindi/);
});

test('account hub exposes referral and account tariff navigation is visually emphasized', () => {
  assert.match(profilePage, /href="\/referral"/);
  assert.match(profilePage, /15 000 \+ 10 000 \+ 5 000 UZS/);
  assert.match(profilePage, /href="\/billing" className="rounded-2xl border border-blue-300 bg-blue-600/);
  assert.match(globals, /aside a\[href="\/profile"\]/);
  assert.match(globals, /nav\[aria-label="Mobil asosiy navigatsiya"\] a\[href="\/profile"\]/);
});
