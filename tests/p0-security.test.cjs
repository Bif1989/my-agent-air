const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('agent directory only requests active completed registrations', () => {
  const source = read('app/agents/agents-api.ts');
  assert.match(source, /registration_status:\s*"eq\.active"/);
  assert.match(source, /agent_type\.neq\.agent/);
});

test('profile API exposes server-controlled registration status without making it editable', () => {
  const source = read('app/profile/profile-api.ts');
  assert.match(source, /registration_status/);
  const editableBlock = source.match(/export type EditableProfile = \{([\s\S]*?)\n\};/);
  assert(editableBlock, 'EditableProfile type missing');
  assert.doesNotMatch(editableBlock[1], /registration_status|is_active|is_verified|role/);
});

test('app shell routes incomplete registrations to profile and suppresses realtime business UI', () => {
  const source = read('app/dashboard/components/app-shell.tsx');
  assert.match(source, /registrationStatus === "incomplete"/);
  assert.match(source, /router\.replace\("\/profile\?complete=1"\)/);
  assert.match(source, /const accountReady = accountActive && registrationStatus === "active"/);
  assert.match(source, /if \(!currentSession \|\| !accountReady\) return/);
  assert.match(source, /accountReady && <FloatingMessengerPanel/);
});

test('P0 database migrations gate business actions by completed registration', () => {
  const account = read('supabase/migrations/20261008104500_p0_account_status_and_rls_hardening.sql');
  const rpc = read('supabase/migrations/20261008105000_p0_authenticated_rpc_account_gates.sql');
  const rls = read('supabase/migrations/20261008111000_p0_core_rls_registration_status.sql');
  const ai = read('supabase/migrations/20261008111500_p0_ai_quota_registration_gate.sql');
  const triggerFix = read('supabase/migrations/20261008113000_p0_fix_active_actor_trigger_record_field.sql');
  assert.match(account, /registration_status in \('pending_email','incomplete','active','suspended'\)/);
  assert.match(account, /app_private\.account_is_active/);
  assert.match(rpc, /account_inactive_or_incomplete/);
  assert.match(rls, /registration_status='active'/);
  assert.match(ai, /registration_status='active'/);
  assert.match(triggerFix, /if tg_table_name in \('messages','chat_messages'\) then/);
});

test('external supplier public RPCs require high-entropy token shape and are anon-only', () => {
  const source = read('supabase/migrations/20261008110000_p0_deal_and_public_invite_hardening.sql');
  assert.match(source, /\^\[0-9A-Fa-f\]\{48\}\$/);
  assert.match(source, /revoke execute on function public\.get_supplier_invite_public\(text\) from authenticated, public/);
  assert.match(source, /grant execute on function public\.get_supplier_invite_public\(text\) to anon/);
  assert.match(source, /already_responded/);
});

test('external supplier admin import matches table constraints and bounds each batch', () => {
  const source = read('supabase/migrations/20261008124500_p0_external_supplier_import_hardening.sql');
  assert.match(source, /registration_status = 'active'/);
  assert.match(source, /jsonb_array_length\(p_items\) > 1000/);
  assert.match(source, /official_registry','open_data','public_business_contact','manual/);
  assert.match(source, /source_name is not distinct from v_source_name/);
  assert.match(source, /then 'registry' else 'public_contact' end/);
  assert.match(source, /\^\[1-5\]\$/);
});

test('all privileged admin RPCs require an active completed admin registration', () => {
  const source = read('supabase/migrations/20261009003500_p1_admin_rpc_registration_status_gate.sql');
  assert.match(source, /admin_external_supplier_stats/);
  assert.match(source, /admin_set_agent_active/);
  assert.match(source, /admin_set_agent_verified/);
  assert.match(source, /review_verification_request/);
  assert.ok((source.match(/registration_status = 'active'/g) || []).length >= 2);
  assert.ok((source.match(/registration_status <> 'active'/g) || []).length >= 2);
});

test('trigger-only helper functions are not directly executable by client roles', () => {
  const source = read('supabase/migrations/20261008125500_p0_trigger_function_execute_hardening.sql');
  assert.match(source, /touch_comment_edited_at\(\).*public, anon, authenticated/);
  assert.match(source, /touch_post_updated_at\(\).*public, anon, authenticated/);
  assert.match(source, /touch_updated_at\(\).*public, anon, authenticated/);
});

test('CI blocks high production dependency vulnerabilities and runs Chromium plus WebKit smoke', () => {
  const source = read('.github/workflows/quality.yml');
  assert.match(source, /npm audit --omit=dev --audit-level=high/);
  assert.match(source, /npm test/);
  assert.match(source, /npm run lint/);
  assert.match(source, /npm run build/);
  assert.match(source, /browser-smoke\.cjs/);
  assert.match(source, /chromium webkit/);
});