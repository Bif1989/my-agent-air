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

test('bulk SMS action requires an active admin and never exposes Eskiz credentials to the browser', () => {
  const handler = read('lib/server/supplier-outreach-actions/admin-sms-campaigns.ts');
  const client = read('app/admin/sms/sms-api.ts');
  assert.match(handler, /profile\.role !== "admin"/);
  assert.match(handler, /profile\.is_active !== true/);
  assert.match(handler, /profile\.registration_status !== "active"/);
  assert.match(handler, /process\.env\.ESKIZ_EMAIL/);
  assert.match(handler, /process\.env\.ESKIZ_PASSWORD/);
  assert.match(handler, /https:\/\/notify\.eskiz\.uz\/api\/message\/sms\/send/);
  assert.match(client, /\/api\/supplier-outreach\/admin-sms-campaigns/);
  assert.doesNotMatch(read('app/admin/sms/page.tsx'), /ESKIZ_PASSWORD|ESKIZ_EMAIL/);
});

test('bulk SMS delivery is batched, deduplicated, concurrency-safe and not automatic', () => {
  const migration = read('supabase/migrations/20261017094500_admin_bulk_sms_campaigns.sql');
  const handler = read('lib/server/supplier-outreach-actions/admin-sms-campaigns.ts');
  const route = read('app/api/supplier-outreach/[action]/route.ts');
  const page = read('app/admin/sms/page.tsx');
  assert.match(handler, /const BATCH_SIZE = 5/);
  assert.match(handler, /const phones = new Set<string>\(\)/);
  assert.match(handler, /admin\.rpc\("claim_admin_sms_batch"/);
  assert.match(handler, /Promise\.all\(recipients\.map/);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /stale_processing_unknown_delivery/);
  assert.match(migration, /grant execute on function public\.claim_admin_sms_batch\(uuid, integer\) to service_role/);
  assert.match(route, /action === "admin-sms-campaigns"/);
  assert.match(route, /return adminSmsPost\(request\)/);
  assert.match(route, /return adminSmsGet\(request\)/);
  assert.match(page, /Draft kampaniya yaratish/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /consentConfirmed/);
});

test('admin SMS adds no new Vercel Function and stays inside the admin UI', () => {
  const admin = read('app/admin/page.tsx');
  const sms = read('app/admin/sms/page.tsx');
  assert.equal(fs.existsSync(path.join(process.cwd(), 'app/api/admin/sms-campaigns/route.ts')), false);
  assert.match(admin, /href="\/admin\/sms"/);
  assert.match(sms, /profile\?\.role !== "admin"/);
  assert.match(sms, /activePath="\/admin"/);
});
