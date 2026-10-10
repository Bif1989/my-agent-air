const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('supplier SMS route authenticates the actor and validates the invite token', () => {
  const route = read('lib/server/supplier-outreach-actions/send-sms.ts');
  assert.match(route, /auth\.getUser\(accessToken\)/);
  assert.match(route, /createHash\("sha256"\)\.update\(token\)/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /typedInvite\.created_by !== user\.id && actor\.role !== "admin"/);
  assert.match(route, /typedInvite\.channel !== "sms"/);
});

test('supplier SMS route uses Eskiz server-side credentials and multipart API calls', () => {
  const route = read('lib/server/supplier-outreach-actions/send-sms.ts');
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
  const route = read('lib/server/supplier-outreach-actions/send-sms.ts');
  assert.match(route, /\^998\\d\{9\}\$/);
  assert.match(route, /return `998\$\{digits\}`/);
  assert.match(route, /status: "sent"/);
  assert.match(route, /provider_message_id: providerId/);
  assert.match(route, /status: "failed"/);
  assert.match(route, /configured: false/);
});

test('supplier SMS uses the short branded public link and support phone', () => {
  const route = read('lib/server/supplier-outreach-actions/send-sms.ts');
  const shortRoute = read('app/s/[token]/page.tsx');
  assert.match(route, /new URL\(`\/s\/\$\{encodeURIComponent\(token\)\}`/);
  assert.match(route, /My Agent Air B2B turizm platformasi/);
  assert.match(route, /Tel:\+998912924010/);
  assert.match(route, /providerMessage/);
  assert.match(shortRoute, /redirect\(`\/supplier-request\/\$\{encodeURIComponent\(token\)\}`\)/);
});

test('public supplier landing explains the platform in Uzbek and Russian and promotes registration', () => {
  const page = read('app/supplier-request/[token]/page.tsx');
  assert.match(page, /Turizm biznesi uchun B2B platforma/);
  assert.match(page, /B2B-платформа для туристического бизнеса/);
  assert.match(page, /Bepul ro‘yxatdan o‘tish/);
  assert.match(page, /Бесплатная регистрация/);
  assert.match(page, /\+998 91 292 40 10/);
  assert.match(page, /href="\/register"/);
  assert.match(page, />UZ</);
  assert.match(page, />RU</);
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
