const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('admin SMS storage is service-only and browser roles have no table grants', () => {
  const migration = read('supabase/migrations/20261017094500_admin_bulk_sms_campaigns.sql');
  assert.match(migration, /create table if not exists public\.admin_sms_campaigns/);
  assert.match(migration, /create table if not exists public\.admin_sms_recipients/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.admin_sms_campaigns from public, anon, authenticated/);
  assert.match(migration, /revoke all on table public\.admin_sms_recipients from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.admin_sms_campaigns to service_role/);
});

test('bulk SMS API requires an active admin and never exposes Eskiz credentials to the browser', () => {
  const route = read('app/api/admin/sms-campaigns/route.ts');
  assert.match(route, /profile\.role !== "admin"/);
  assert.match(route, /profile\.is_active !== true/);
  assert.match(route, /profile\.registration_status !== "active"/);
  assert.match(route, /process\.env\.ESKIZ_EMAIL/);
  assert.match(route, /process\.env\.ESKIZ_PASSWORD/);
  assert.match(route, /https:\/\/notify\.eskiz\.uz\/api\/message\/sms\/send/);
  assert.doesNotMatch(read('app/admin/sms/page.tsx'), /ESKIZ_PASSWORD|ESKIZ_EMAIL/);
});

test('bulk SMS delivery is batched, deduplicated, concurrency-safe and not automatic', () => {
  const migration = read('supabase/migrations/20261017094500_admin_bulk_sms_campaigns.sql');
  const route = read('app/api/admin/sms-campaigns/route.ts');
  const page = read('app/admin/sms/page.tsx');
  assert.match(route, /const BATCH_SIZE = 5/);
  assert.match(route, /const phones = new Set<string>\(\)/);
  assert.match(route, /admin\.rpc\("claim_admin_sms_batch"/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /status = 'processing'/i);
  assert.match(migration, /grant execute on function public\.claim_admin_sms_batch\(uuid, integer\) to service_role/);
  assert.match(page, /Draft kampaniya yaratish/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /consentConfirmed/);
});

test('admin panel exposes the SMS module only through the admin area', () => {
  const admin = read('app/admin/page.tsx');
  const sms = read('app/admin/sms/page.tsx');
  assert.match(admin, /href="\/admin\/sms"/);
  assert.match(sms, /profile\?\.role !== "admin"/);
  assert.match(sms, /activePath="\/admin"/);
});
