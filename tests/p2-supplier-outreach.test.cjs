const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('supplier outreach route authenticates the actor and validates the invite token before email delivery', () => {
  const route = read('lib/server/supplier-outreach-actions/send.ts');
  assert.match(route, /auth\.getUser\(accessToken\)/);
  assert.match(route, /createHash\("sha256"\)\.update\(token\)/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /typedInvite\.created_by !== user\.id && actor\.role !== "admin"/);
  assert.match(route, /new Date\(typedInvite\.expires_at\)\.getTime\(\) <= Date\.now\(\)/);
});

test('supplier outreach uses Resend idempotently and records sent or failed state server-side', () => {
  const route = read('lib/server/supplier-outreach-actions/send.ts');
  assert.match(route, /process\.env\.RESEND_API_KEY/);
  assert.match(route, /https:\/\/api\.resend\.com\/emails/);
  assert.match(route, /"Idempotency-Key"/);
  assert.match(route, /status: "sent"/);
  assert.match(route, /finish_supplier_email_delivery/);
  assert.match(route, /p_provider_id: providerId/);
  assert.match(route, /status: "failed"/);
  assert.match(route, /configured: false/);
});

test('supplier outreach keeps recipient private and preserves manual-link fallback when delivery is unavailable', () => {
  const api = read('app/requests/supplier-matching-api.ts');
  const ui = read('app/requests/supplier-matching.tsx');
  assert.match(api, /getStoredSession/);
  assert.match(api, /Authorization.*Bearer/);
  assert.match(api, /\/api\/supplier-outreach\/send/);
  assert.match(ui, /channel === "email" && !supplier\.has_email/);
  assert.match(ui, /deliverSupplierInviteEmail/);
  assert.match(ui, /Yuborish xizmati productionda sozlanmagan/);
  assert.match(ui, /Individual link saqlandi/);
  assert.match(ui, /navigator\.clipboard\.writeText\(generated\.url\)/);
  assert.match(ui, /inviteStats\.sent/);
});
