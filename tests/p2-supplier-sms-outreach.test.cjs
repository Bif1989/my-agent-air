const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('supplier SMS route authenticates the actor and validates the invite token', () => {
  const route = read('app/api/supplier-outreach/send-sms/route.ts');
  assert.match(route, /auth\.getUser\(accessToken\)/);
  assert.match(route, /createHash\("sha256"\)\.update\(token\)/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /typedInvite\.created_by !== user\.id && actor\.role !== "admin"/);
  assert.match(route, /typedInvite\.channel !== "sms"/);
});

test('supplier SMS route uses Eskiz server-side credentials and multipart API calls', () => {
  const route = read('app/api/supplier-outreach/send-sms/route.ts');
  assert.match(route, /process\.env\.ESKIZ_EMAIL/);
  assert.match(route, /process\.env\.ESKIZ_PASSWORD/);
  assert.match(route, /process\.env\.ESKIZ_FROM/);
  assert.match(route, /https:\/\/notify\.eskiz\.uz\/api\/auth\/login/);
  assert.match(route, /https:\/\/notify\.eskiz\.uz\/api\/message\/sms\/send/);
  assert.match(route, /new FormData\(\)/);
  assert.match(route, /form\.set\("mobile_phone", phone\)/);
  assert.match(route, /Authorization.*Bearer/);
});

test('supplier SMS route normalizes Uzbekistan numbers and records provider state', () => {
  const route = read('app/api/supplier-outreach/send-sms/route.ts');
  assert.match(route, /\^998\\d\{9\}\$/);
  assert.match(route, /return `998\$\{digits\}`/);
  assert.match(route, /status: "sent"/);
  assert.match(route, /provider_message_id: providerId/);
  assert.match(route, /status: "failed"/);
  assert.match(route, /configured: false/);
});

test('supplier outreach client automatically delivers SMS and keeps email fallback', () => {
  const api = read('app/requests/supplier-matching-api.ts');
  const ui = read('app/requests/supplier-matching.tsx');
  assert.match(api, /deliverSupplierInviteSms/);
  assert.match(api, /\/api\/supplier-outreach\/send-sms/);
  assert.match(ui, /draft\.channel === "email" \|\| draft\.channel === "sms"/);
  assert.match(ui, /deliverSupplierInviteSms/);
  assert.match(ui, /SMS avtomatik yuborildi/);
  assert.match(ui, /telefon bo‘lmasa email orqali avtomatik yuboriladi/);
});

test('supplier invite migration prefers SMS and permits intentional resend after cooldown', () => {
  const migration = read('supabase/migrations/20261009161500_p2_sms_first_supplier_outreach.sql');
  const phonePos = migration.indexOf("v_supplier.phone");
  const emailPos = migration.indexOf("v_supplier.email");
  assert.ok(phonePos >= 0 && emailPos > phonePos, 'phone must be preferred before email');
  assert.match(migration, /interval '30 seconds'/);
  assert.match(migration, /invite_already_responded/);
  assert.doesNotMatch(migration, /invite_already_sent/);
});
