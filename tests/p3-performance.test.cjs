const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('P3 dashboard uses one summary RPC instead of multiple count and unused content requests', () => {
  const migration = read('supabase/migrations/20261010160000_p3_dashboard_summary_rpc.sql');
  const data = read('app/dashboard/components/dashboard-data.ts');
  const page = read('app/dashboard/page.tsx');

  assert.match(migration, /create or replace function public\.get_dashboard_summary\(\)/);
  assert.match(migration, /security invoker/);
  assert.match(migration, /timezone\('Asia\/Tashkent',now\(\)\)::date/);
  assert.match(migration, /o\.agent_id=auth\.uid\(\)/);
  assert.match(migration, /grant execute on function public\.get_dashboard_summary\(\) to authenticated,service_role/);

  assert.match(data, /rpc\/get_dashboard_summary/);
  assert.doesNotMatch(data, /countRows/);
  assert.doesNotMatch(data, /listFeedPosts/);
  assert.doesNotMatch(data, /requestFreshnessFilter/);
  assert.match(page, /loadDashboardData\(\)/);
});

test('P3 AI request budget remains bounded', () => {
  const ai = read('app/api/ai/route.ts');
  assert.match(ai, /HISTORY_MAX_ITEMS = 12/);
  assert.match(ai, /HISTORY_MAX_CHARS = 32000/);
  assert.match(ai, /REQUEST_BODY_MAX_BYTES = 128000/);
});
