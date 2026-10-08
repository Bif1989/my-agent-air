// Run against an isolated PGlite database, never a connected project:
// NODE_PATH=<temporary @electric-sql/pglite installation> node tests/ai-voice-quota-check.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb language sql as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      create table public.profiles (id uuid primary key, is_active boolean not null);
      insert into public.profiles values ('00000000-0000-0000-0000-000000000001', true);
    `);
    for (const file of ['20261005042133_ai_assistant_quota.sql', '20261008032506_ai_voice_quota.sql']) {
      await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/migrations', file), 'utf8'));
    }
    const quota = async () => (await db.query('select public.consume_ai_voice_quota() as result')).rows[0].result;
    assert.equal((await quota()).code, 'AUTH_REQUIRED');
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; set request.jwt.claims = '{"is_anonymous":true}';`);
    assert.equal((await quota()).code, 'AUTH_REQUIRED');
    await db.exec(`set request.jwt.claims = '{"is_anonymous":false}'; set role authenticated;`);
    assert.deepEqual(await quota(), {allowed:true});
    assert.equal((await quota()).code, 'TOO_FAST');
    // Voice must not consume chat's allowance or trigger its short cooldown.
    assert.deepEqual((await db.query('select public.consume_ai_assistant_quota() as result')).rows[0].result, {allowed:true});
    await assert.rejects(db.query('select * from ai_private.assistant_usage'), /permission denied/);
    await db.exec('reset role;');
    await db.exec(`update ai_private.assistant_usage set last_request_at = clock_timestamp() - interval '31 seconds' where scope like 'voice:%'; set role authenticated;`);
    assert.deepEqual(await quota(), {allowed:true});
    await db.exec(`reset role; update ai_private.assistant_usage set attempts = 20 where scope like 'voice:user:%'; set role authenticated;`);
    assert.equal((await quota()).code, 'USER_LIMIT');
    await db.exec(`reset role; update ai_private.assistant_usage set attempts = 0 where scope like 'voice:user:%'; update ai_private.assistant_usage set attempts = 100 where scope = 'voice:global'; set role authenticated;`);
    assert.equal((await quota()).code, 'GLOBAL_LIMIT');
    await db.exec(`reset role; update public.profiles set is_active = false; set role authenticated;`);
    assert.equal((await quota()).code, 'ACCOUNT_INACTIVE');
    await db.exec(`reset role; set role anon;`);
    await assert.rejects(quota(), /permission denied/);
    console.log('Voice quota SQL: auth, anonymous, cooldown, independent chat quota, user/global caps, inactive account and permissions passed.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
