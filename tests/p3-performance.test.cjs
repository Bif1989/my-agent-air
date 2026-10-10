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
  assert.match(ai, /max_output_tokens: 3500/);
});

test('P3 only loads the voice-input bundle on the AI dashboard', () => {
  const layout = read('app/layout.tsx');
  const loader = read('app/components/ai-voice-loader.tsx');
  assert.match(layout, /AiVoiceLoader/);
  assert.doesNotMatch(layout, /from "@\/app\/components\/ai-voice-input"/);
  assert.match(loader, /dynamic\(\(\) => import\("@\/app\/components\/ai-voice-input"\)/);
  assert.match(loader, /ssr: false/);
  assert.match(loader, /pathname !== "\/dashboard"/);
});

test('P3 realtime session upkeep avoids hidden or offline background work', () => {
  const realtime = read('lib/supabase-realtime.ts');
  assert.match(realtime, /document\.visibilityState !== "visible" \|\| !navigator\.onLine/);
  assert.match(realtime, /setInterval\(refreshIfNeeded, 60_000\)/);
  assert.doesNotMatch(realtime, /setInterval\(refreshIfNeeded, 30_000\)/);
});

test('P3 Geo Tender client fetches only fields used by the UI', () => {
  const api = read('app/requests/request-targeting-api.ts');
  assert.match(api, /const SELECT_FIELDS = "request_id,profile_id,match_score,distance_km,match_reason,status"/);
  assert.doesNotMatch(api, /SELECT_FIELDS = .*capability_id/);
  assert.doesNotMatch(api, /SELECT_FIELDS = .*created_at/);
  assert.doesNotMatch(api, /SELECT_FIELDS = .*updated_at/);
});

test('P3 shares concurrent messenger conversation reads instead of duplicating RPC calls', () => {
  const api = read('app/messenger/messenger-api.ts');
  assert.match(api, /let conversationsInFlight: Promise<MessengerConversation\[\]> \| null = null/);
  assert.match(api, /if \(conversationsInFlight\) return conversationsInFlight/);
  assert.match(api, /finally\(\(\) => \{ conversationsInFlight = null; \}\)/);
});

test('P3 shares concurrent reads for the same agent profile', () => {
  const api = read('app/agents/agents-api.ts');
  assert.match(api, /const agentReadsInFlight = new Map<string, Promise<AgentRecord \| null>>\(\)/);
  assert.match(api, /const existing = agentReadsInFlight\.get\(id\)/);
  assert.match(api, /agentReadsInFlight\.set\(id, task\)/);
  assert.match(api, /agentReadsInFlight\.delete\(id\)/);
});

test('P3 deduplicates concurrent AI history outbox flushes per user', () => {
  const history = read('lib/ai-chat-history.ts');
  assert.match(history, /const outboxFlushInFlight = new Map<string, Promise<void>>\(\)/);
  assert.match(history, /const existing = outboxFlushInFlight\.get\(session\.user\.id\)/);
  assert.match(history, /outboxFlushInFlight\.set\(session\.user\.id, task\)/);
  assert.match(history, /outboxFlushInFlight\.delete\(session\.user\.id\)/);
});

test('P3 stays deploy-free until the combined batch is promoted', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.equal(vercel.git.deploymentEnabled.main, true);
  assert.equal(vercel.git.deploymentEnabled['**'], false);
  assert.ok(vercel.ignoreCommand.includes('git diff --quiet'));
});