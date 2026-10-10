const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const migrationPath = 'supabase/migrations/20261010214000_p7_supplier_delivery_claim.sql';

test('P7 supplier delivery claim is atomic, token-bound and service-role only', () => {
  const sql = read(migrationPath);
  assert.match(sql, /create or replace function public\.claim_supplier_invite_delivery/);
  assert.match(sql, /for update/);
  assert.match(sql, /extensions\.digest\(trim\(p_token\), 'sha256'\)/);
  assert.match(sql, /v_invite\.created_by <> p_actor_id and v_actor\.role <> 'admin'/);
  assert.match(sql, /delivery_claimed_at > now\(\) - interval '2 minutes'/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /revoke all on function public\.claim_supplier_invite_delivery\(uuid, uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.claim_supplier_invite_delivery\(uuid, uuid, text\) to service_role/);
});

test('P7 supplier delivery claim does not alter the existing invite status model', () => {
  const sql = read(migrationPath);
  assert.match(sql, /add column if not exists delivery_claim_id uuid/);
  assert.match(sql, /add column if not exists delivery_claimed_at timestamptz/);
  assert.doesNotMatch(sql, /supplier_invites_status_check/);
  assert.doesNotMatch(sql, /status\s*=\s*'sending'/);
});

test('P7 release requires the exact claim id', () => {
  const sql = read(migrationPath);
  assert.match(sql, /create or replace function public\.release_supplier_invite_delivery/);
  assert.match(sql, /delivery_claim_id = p_claim_id/);
  assert.match(sql, /set delivery_claim_id = null,[\s\S]*delivery_claimed_at = null/);
  assert.match(sql, /revoke all on function public\.release_supplier_invite_delivery\(uuid, uuid\) from public, anon, authenticated/);
});

test('P7 consolidated outreach route serializes email and SMS without adding a Vercel function', () => {
  const route = read('app/api/supplier-outreach/[action]/route.ts');
  assert.match(route, /readBoundedJson<DeliveryBody>\(request\.clone\(\), MAX_BODY_BYTES\)/);
  assert.match(route, /authClient\.auth\.getUser\(accessToken\)/);
  assert.match(route, /admin\.rpc\("claim_supplier_invite_delivery"/);
  assert.match(route, /claim\.status === "in_flight"/);
  assert.match(route, /"DELIVERY_IN_PROGRESS"/);
  assert.match(route, /admin\.rpc\("release_supplier_invite_delivery"/);
  assert.match(route, /finally/);
  assert.match(route, /send: sendEmailPost/);
  assert.match(route, /"send-sms": sendSmsPost/);
});

test('P7 delivery claim fails closed when the database guard is unavailable', () => {
  const route = read('app/api/supplier-outreach/[action]/route.ts');
  const errorBlock = route.match(/if \(error\) \{([\s\S]*?)\n  \}/)?.[1] || '';
  assert.match(errorBlock, /Supplier delivery claim failed/);
  assert.match(errorBlock, /"OUTREACH_UNAVAILABLE"/);
  assert.match(errorBlock, /503/);
  assert.doesNotMatch(errorBlock, /return handler\(request\)/);
});
