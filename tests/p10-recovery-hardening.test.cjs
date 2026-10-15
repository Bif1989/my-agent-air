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

test('recovery documentation no longer claims AI is local-only or browser smoke is unavailable', () => {
  const readme = read('README.md');
  assert.match(readme, /AI chat endpoint can call OpenAI/);
  assert.match(readme, /Phone registration is the primary flow/);
  assert.match(readme, /Desktop, Android and iOS/);
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
