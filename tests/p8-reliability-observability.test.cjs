const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('P8 waits for Realtime JWT authentication before subscribing filtered channels', () => {
  const source = read('lib/supabase-realtime.ts');
  assert.match(source, /realtimeAuthReady = Promise\.resolve\(realtimeClient\.realtime\.setAuth\(nextToken\)\)/);
  assert.match(source, /void syncSession\(\)\.then\(\(authenticated\) => \{/);
  assert.match(source, /if \(!authenticated \|\| subscription\.closed \|\| subscription\.started/);
  assert.match(source, /subscription\.channel\.subscribe\(\)/);
  assert.doesNotMatch(source, /void realtimeClient\.realtime\.setAuth\(token\)/);
});

test('P8 preserves all scoped Realtime filters behind the authentication gate', () => {
  const source = read('lib/supabase-realtime.ts');
  assert.match(source, /deal_id=eq\.\$\{dealId\}/);
  assert.match(source, /room_id=eq\.\$\{roomId\}/);
  assert.match(source, /request_id=eq\.\$\{requestId\}/);
});

test('P8 cleanup can cancel a channel before delayed authenticated subscription starts', () => {
  const source = read('lib/supabase-realtime.ts');
  assert.match(source, /subscription\.closed = true/);
  assert.match(source, /shared\.get\(key\) !== subscription/);
  assert.match(source, /return client\.removeChannel\(subscription\.channel\)/);
});

test('P8 unread badge uses a scalar RPC instead of loading all conversation summaries', () => {
  const source = read('app/messages/messages-api.ts');
  const fn = source.match(/export async function getUnreadMessageCount\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(fn, /rpc\/get_unread_deal_message_count/);
  assert.match(fn, /dedupeInFlight\("messages:unread-count"/);
  assert.doesNotMatch(fn, /listConversationSummaries/);
});

test('P8 unread-count RPC stays RLS-bound with SECURITY INVOKER', () => {
  const sql = read('supabase/migrations/20261010163500_p8_unread_message_count.sql');
  assert.match(sql, /create or replace function public\.get_unread_deal_message_count\(\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /from public\.messages m/);
  assert.match(sql, /m\.read_at is null/);
  assert.match(sql, /revoke all on function public\.get_unread_deal_message_count\(\) from public, anon/);
  assert.match(sql, /grant execute on function public\.get_unread_deal_message_count\(\) to authenticated/);
  assert.doesNotMatch(sql, /security definer/);
});
