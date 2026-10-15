const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('fresh database recovery contains the historical AI chat prerequisites', () => {
  const history = read('supabase/migrations/20261005093623_add_ai_chat_history.sql');
  const conversations = read('supabase/migrations/20261005104810_add_ai_chat_conversations.sql');
  const hardening = read('supabase/migrations/20261008182000_harden_ai_history_persistence.sql');

  assert.match(history, /create table if not exists public\.ai_chat_messages/);
  assert.match(conversations, /create table if not exists public\.ai_chat_conversations/);
  assert.match(conversations, /add column if not exists conversation_id uuid/);
  assert.match(hardening, /alter table public\.ai_chat_messages/);
  assert.match(hardening, /alter column conversation_id set not null/);
});

test('fresh recovery includes late cloud-only VK and Click schema migrations without production secrets', () => {
  const vk = read('supabase/migrations/20261013114437_vk_aviation_message_ingest.sql');
  const vkDisable = read('supabase/migrations/20261013121856_disable_legacy_vk_ingest.sql');
  const click = read('supabase/migrations/20261014045917_click_subscription_payment_orders.sql');

  assert.match(vk, /create table if not exists public\.vk_aviation_messages/);
  assert.match(vk, /create table if not exists private\.vk_ingest_config/);
  assert.doesNotMatch(vk, /85c0c04c31aa79cf47855039f054ce3d5b4ac92d52737bcb0e30e0587bdebdaa/);
  assert.doesNotMatch(vk, /grant execute on function public\.ingest_vk_aviation_message\(text, jsonb\) to anon/);
  assert.match(vkDisable, /revoke execute on function public\.ingest_vk_aviation_message/);

  assert.match(click, /create table if not exists public\.billing_payment_orders/);
  assert.match(click, /prepare_billing_click_order/);
  assert.match(click, /complete_billing_click_order/);
  assert.match(click, /cancel_billing_click_order/);
  assert.match(click, /grant execute on function public\.complete_billing_click_order\(text,bigint,bigint,integer\) to service_role/);
});

test('recovery documentation no longer claims AI is local-only or browser smoke is unavailable', () => {
  const readme = read('README.md');
  assert.match(readme, /AI chat endpoint can call OpenAI/);
  assert.match(readme, /Phone registration is the primary flow/);
  assert.match(readme, /Desktop, Android and iOS/);
  assert.match(readme, /Click subscription payment-order foundation/);
  assert.doesNotMatch(readme, /makes no paid model calls/);
  assert.doesNotMatch(readme, /Browser verification was blocked/);
});

test('P10 least-privilege rollout removes structural table privileges from browser roles', () => {
  const sql = read('supabase/p10/least_privilege_review.sql');
  for (const privilege of ['truncate', 'trigger', 'references']) assert.match(sql, new RegExp(privilege, 'i'));
  assert.match(sql, /from anon, authenticated/);

  for (const table of [
    'ai_chat_conversations',
    'ai_chat_messages',
    'notification_preferences',
    'push_subscriptions',
    'supplier_capabilities',
    'chat_messages',
    'chat_room_members',
    'chat_rooms',
    'post_comments',
    'post_reactions',
    'posts',
    'billing_payment_orders',
  ]) assert.match(sql, new RegExp(`public\\.${table}`));
});

test('P10 billing hardening covers both foreign-key indexes reported by advisors', () => {
  const sql = read('supabase/p10/billing_indexes_review.sql');
  assert.match(sql, /billing_payment_orders_plan_code_idx/);
  assert.match(sql, /billing_payment_orders\(plan_code\)/);
  assert.match(sql, /billing_payment_orders_subscription_id_idx/);
  assert.match(sql, /billing_payment_orders\(subscription_id\)/);
});

test('patched Next.js stays a production dependency and lint config stays development-only', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.next, '16.4.1');
  assert.equal(pkg.devDependencies.next, undefined);
  assert.equal(pkg.devDependencies['eslint-config-next'], '16.4.1');
});
