const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
function exists(relativePath) { return fs.existsSync(path.join(root, relativePath)); }
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }

function routeFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.isFile() && entry.name === 'route.ts' ? [path.relative(root, full).replaceAll('\\', '/')] : [];
  });
}

function maxDuration(relativePath) {
  const match = read(relativePath).match(/export const maxDuration\s*=\s*(\d+)/);
  assert.ok(match, `${relativePath} must declare maxDuration`);
  return Number(match[1]);
}

test('Vercel Node API surface stays consolidated', () => {
  const routes = routeFiles(path.join(root, 'app/api')).sort();
  assert.deepEqual(routes, [
    'app/api/ai/route.ts',
    'app/api/ai/transcribe/route.ts',
    'app/api/auth/[action]/route.ts',
    'app/api/supplier-outreach/[action]/route.ts',
  ]);
});

test('legacy per-action function routes stay removed', () => {
  for (const route of [
    'app/api/auth/password/route.ts',
    'app/api/auth/recover/route.ts',
    'app/api/auth/resend-signup/route.ts',
    'app/api/auth/signup/route.ts',
    'app/api/auth/update-password/route.ts',
    'app/api/auth/verify-signup/route.ts',
    'app/api/supplier-outreach/send/route.ts',
    'app/api/supplier-outreach/send-sms/route.ts',
  ]) assert.equal(exists(route), false, `${route} would create another Vercel Function`);
});

test('redirect-only dynamic pages stay out of Vercel SSR functions', () => {
  const config = read('next.config.ts');
  assert.match(config, /source: "\/messages\/:dealId"/);
  assert.match(config, /destination: "\/deals\/:dealId#chat"/);
  assert.match(config, /source: "\/s\/:token"/);
  assert.match(config, /destination: "\/supplier-request\/:token"/);
  assert.equal(exists('app/messages/[dealId]/page.tsx'), false);
  assert.equal(exists('app/s/[token]/page.tsx'), false);
});

test('client-only detail pages stay off Vercel SSR functions', () => {
  const config = read('next.config.ts');
  const staticShells = [
    ['/admin/agents/:id', '/admin-agent-detail', 'app/admin/agents/[id]/page.tsx', 'app/admin-agent-detail/page.tsx'],
    ['/agents/:id', '/agent-detail', 'app/agents/[id]/page.tsx', 'app/agent-detail/page.tsx'],
    ['/deals/:id', '/deal-detail', 'app/deals/[id]/page.tsx', 'app/deal-detail/page.tsx'],
    ['/feed/:postId/edit', '/feed-post-edit', 'app/feed/[postId]/edit/page.tsx', 'app/feed-post-edit/page.tsx'],
    ['/feed/:postId', '/feed-post', 'app/feed/[postId]/page.tsx', 'app/feed-post/page.tsx'],
    ['/messenger/:roomId/settings', '/messenger-room-settings', 'app/messenger/[roomId]/settings/page.tsx', 'app/messenger-room-settings/page.tsx'],
    ['/messenger/:roomId', '/messenger-room', 'app/messenger/[roomId]/page.tsx', 'app/messenger-room/page.tsx'],
    ['/requests/:id/edit', '/request-edit', 'app/requests/[id]/edit/page.tsx', 'app/request-edit/page.tsx'],
    ['/requests/:id', '/request-detail', 'app/requests/[id]/page.tsx', 'app/request-detail/page.tsx'],
    ['/supplier-request/:token', '/supplier-invite', 'app/supplier-request/[token]/page.tsx', 'app/supplier-invite/page.tsx'],
  ];
  for (const [source, destination, dynamicPage, staticPage] of staticShells) {
    assert.ok(config.includes(`source: "${source}"`), `${source} rewrite missing`);
    assert.ok(config.includes(`destination: "${destination}"`), `${destination} rewrite missing`);
    assert.equal(exists(dynamicPage), false, `${dynamicPage} would create another Vercel SSR Function`);
    assert.equal(exists(staticPage), true, `${staticPage} static shell missing`);
  }
});

test('Vercel Web Analytics and custom events stay disabled on Hobby', () => {
  const layout = read('app/layout.tsx');
  const register = read('app/register/page.tsx');
  assert.doesNotMatch(layout, /@vercel\/analytics\/next/);
  assert.doesNotMatch(layout, /<Analytics\s*\/>/);
  assert.doesNotMatch(register, /@vercel\/analytics/);
  assert.doesNotMatch(register, /\btrack\s*\(/);
});

test('only main deploys and documentation-only changes can skip Vercel builds', () => {
  const config = read('vercel.json');
  assert.match(config, /"\*\*"\s*:\s*false/);
  assert.match(config, /"main"\s*:\s*true/);
  assert.match(config, /VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(config, /git diff --quiet/);
});

test('Hobby uses one Tokyo function region close to the Supabase database', () => {
  const config = read('vercel.json');
  assert.match(config, /"regions"\s*:\s*\[\s*"hnd1"\s*\]/);
});

test('server functions keep bounded execution windows', () => {
  assert.ok(maxDuration('app/api/auth/[action]/route.ts') <= 20);
  assert.ok(maxDuration('app/api/supplier-outreach/[action]/route.ts') <= 15);
  assert.ok(maxDuration('app/api/ai/transcribe/route.ts') <= 30);
  assert.ok(maxDuration('app/api/ai/route.ts') <= 60);
});

test('production smoke has no hourly cron schedule', () => {
  const workflow = read('.github/workflows/production-smoke.yml');
  assert.doesNotMatch(workflow, /^\s*schedule\s*:/m);
});
