const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('supabase/migrations/20261017063849_admin_referral_dashboard_and_support_operator_chat.sql');
const supportApi = read('lib/support-api.ts');
const supportPage = read('app/support/page.tsx');
const adminPage = read('app/admin/page.tsx');
const adminSupport = read('app/admin/support/page.tsx');
const adminReferralApi = read('app/admin/referrals/admin-referral-api.ts');
const adminReferrals = read('app/admin/referrals/page.tsx');
const helpPage = read('app/help/page.tsx');

test('support operator chat reuses the existing direct messenger securely', () => {
  assert.match(migration, /create table if not exists app_private\.support_threads/i);
  assert.match(migration, /get_or_create_support_chat\(\)/);
  assert.match(migration, /least\(v_uid::text,v_admin_id::text\).*greatest\(v_uid::text,v_admin_id::text\)/s);
  assert.match(migration, /insert into public\.chat_rooms\(room_type,direct_key,created_by,is_active\)/);
  assert.match(migration, /values\('direct',v_key,v_uid,true\)/);
  assert.match(migration, /revoke all on table app_private\.support_threads from public, anon, authenticated/i);
  assert.match(migration, /account_is_active\(v_uid\)/);
  assert.match(supportApi, /rpc\/get_or_create_support_chat/);
  assert.match(supportPage, /router\.push\(`\/messenger\/\$\{roomId\}`\)/);
});

test('authenticated users can see configured admin contact details without exposing auth tables directly', () => {
  assert.match(migration, /create or replace function public\.get_support_contact\(\)/i);
  assert.match(migration, /left join auth\.users u on u\.id=p\.id/i);
  assert.match(migration, /revoke all on function public\.get_support_contact\(\) from public,anon/i);
  assert.match(supportPage, /href=\{`tel:/);
  assert.match(supportPage, /href=\{`mailto:/);
  assert.match(helpPage, /href="\/support"/);
});

test('admin referral reporting includes invite counts, qualification state and 3-level rewards', () => {
  assert.match(migration, /admin_get_referral_dashboard/);
  assert.match(migration, /count\(r\.referred_user_id\).*direct_count/s);
  assert.match(migration, /level1_count/);
  assert.match(migration, /level2_count/);
  assert.match(migration, /level3_count/);
  assert.match(migration, /generated_bonus/);
  assert.match(migration, /app_private\.account_is_admin\(v_uid\)/);
  assert.match(adminReferralApi, /rpc\/admin_get_referral_dashboard/);
  assert.match(adminReferrals, /15 000/);
  assert.match(adminReferrals, /10 000/);
  assert.match(adminReferrals, /5 000/);
  assert.match(adminReferrals, /Tasdiqlangan/);
});

test('admin panel exposes referral and operator inbox surfaces', () => {
  assert.match(adminPage, /href="\/admin\/referrals"/);
  assert.match(adminPage, /href="\/admin\/support"/);
  assert.match(adminSupport, /rpc\/admin_list_support_threads|listAdminSupportThreads/);
  assert.match(adminSupport, /Javob berish/);
  assert.match(adminSupport, /\/messenger\/\$\{thread\.room_id\}/);
  assert.match(adminSupport, /O‘qilmagan xabarlar/);
});

test('support implementation adds no new API route or Vercel function', () => {
  const apiRoutes = fs.readdirSync(path.join(root, 'app', 'api'), { withFileTypes: true }).map((entry) => entry.name).sort();
  assert.deepEqual(apiRoutes, ['ai', 'auth', 'payments', 'supplier-outreach']);
});
