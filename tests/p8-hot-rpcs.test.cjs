const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const sqlPath = 'supabase/migrations/20261010165000_p8_hot_rpc_aggregation.sql';

test('P8 messenger hot path batches latest-message and unread aggregation once per accessible room set', () => {
  const sql = read(sqlPath);
  assert.match(sql, /create or replace function public\.list_messenger_conversations\(\)/);
  assert.match(sql, /accessible as materialized/);
  assert.match(sql, /latest as \([\s\S]*distinct on \(cm\.room_id\)/);
  assert.match(sql, /unread as \([\s\S]*group by cm\.room_id/);
  assert.match(sql, /left join latest lm on lm\.room_id=a\.id/);
  assert.match(sql, /left join unread u on u\.room_id=a\.id/);
  assert.match(sql, /security definer/);
  assert.match(sql, /app_private\.account_is_active\(me\.uid\)/);
});

test('P8 feed hot path limits the page before comment and reaction aggregates', () => {
  const sql = read(sqlPath);
  assert.match(sql, /create or replace function public\.list_feed_posts/);
  assert.match(sql, /base as materialized/);
  assert.match(sql, /limit greatest\(1,least\(coalesce\(p_limit,20\),50\)\)/);
  assert.match(sql, /comments as \([\s\S]*group by c\.post_id/);
  assert.match(sql, /reactions as \([\s\S]*filter \(where r\.reaction='like'\)/);
  assert.match(sql, /max\(r\.reaction\) filter \(where r\.user_id=\(select auth\.uid\(\)\)\)/);
  assert.match(sql, /security invoker/);
});

test('P8 feed hot path removes repeated correlated engagement counts from the final select', () => {
  const sql = read(sqlPath);
  const feed = sql.split('create or replace function public.list_feed_posts')[1] || '';
  assert.doesNotMatch(feed, /\(select count\(\*\) from public\.post_comments/);
  assert.doesNotMatch(feed, /\(select count\(\*\) from public\.post_reactions/);
  assert.match(feed, /coalesce\(c\.comment_count,0\)::bigint/);
  assert.match(feed, /coalesce\(r\.deal_count,0\)::bigint/);
});
