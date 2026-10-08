const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function exists(relativePath) {
  return fs.existsSync(path.join(process.cwd(), relativePath));
}

test('production responses use baseline browser security headers', () => {
  const source = read('next.config.ts');
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /nosniff/);
  assert.match(source, /Referrer-Policy/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /microphone=\(self\)/);
  assert.match(source, /Strict-Transport-Security/);
  assert.match(source, /X-Frame-Options/);
  assert.match(source, /DENY/);
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /base-uri 'self'/);
  assert.match(source, /form-action 'self'/);
});

test('auth requests are normalized, uncached and time bounded', () => {
  const source = read('lib/supabase-auth.ts');
  assert.match(source, /AUTH_REQUEST_TIMEOUT_MS = 15_000/);
  assert.match(source, /controller\.abort\(\)/);
  assert.match(source, /cache: "no-store"/);
  assert.match(source, /referrerPolicy: "no-referrer"/);
  assert.match(source, /email\.trim\(\)\.toLowerCase\(\)/);
});

test('session storage does not keep a second duplicate access-token key', () => {
  const source = read('lib/supabase-auth.ts');
  assert.doesNotMatch(source, /localStorage\.setItem\(ACCESS_TOKEN_STORAGE_KEY/);
  assert.match(source, /localStorage\.removeItem\(ACCESS_TOKEN_STORAGE_KEY\)/);
});

test('legacy VK auto-login surface is removed', () => {
  const layout = read('app/layout.tsx');
  assert.doesNotMatch(layout, /VkMiniAppBridge|vk-mini-app-bridge/);
  assert.equal(exists('app/components/vk-mini-app-bridge.tsx'), false);
  assert.equal(exists('app/api/auth/vk/route.ts'), false);
});

test('password login is routed through a persistent server-side brute-force limiter', () => {
  const login = read('app/login/page.tsx');
  const client = read('lib/password-auth.ts');
  const route = read('app/api/auth/password/route.ts');
  const migration = read('supabase/migrations/20261008140500_p1_auth_login_rate_limit.sql');

  assert.match(login, /signInProtected/);
  assert.doesNotMatch(login, /\bsignIn\(/);
  assert.match(client, /\/api\/auth\/password/);
  assert.match(route, /createHmac\("sha256"/);
  assert.match(route, /auth_login_limit_status/);
  assert.match(route, /record_auth_login_result/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /TOO_MANY_ATTEMPTS/);
  assert.match(route, /Retry-After/);
  assert.match(migration, /\(p_pair_hash, 5, 900\)/);
  assert.match(migration, /\(p_ip_hash, 30, 1800\)/);
  assert.match(migration, /grant execute on function public\.auth_login_limit_status\(text, text\) to service_role/);
  assert.match(migration, /revoke all on function public\.auth_login_limit_status\(text, text\) from public, anon, authenticated/);
});

test('signup and password recovery are routed through persistent send quotas', () => {
  const register = read('app/register/page.tsx');
  const forgot = read('app/forgot-password/page.tsx');
  const client = read('lib/public-auth.ts');
  const signup = read('app/api/auth/signup/route.ts');
  const recover = read('app/api/auth/recover/route.ts');
  const migration = read('supabase/migrations/20261008152500_p1_auth_action_rate_limit.sql');

  assert.match(register, /signUpProtected/);
  assert.match(forgot, /requestPasswordResetProtected/);
  assert.match(client, /\/api\/auth\/signup/);
  assert.match(client, /\/api\/auth\/recover/);
  assert.match(signup, /consume_auth_action_quota/);
  assert.match(signup, /signup-pair/);
  assert.match(signup, /limit: 3, window: 1800/);
  assert.match(signup, /limit: 20, window: 3600/);
  assert.match(recover, /consume_auth_action_quota/);
  assert.match(recover, /recover-pair/);
  assert.match(recover, /limit: 3, window: 1800/);
  assert.match(recover, /limit: 20, window: 3600/);
  assert.match(recover, /account mavjud bo‘lsa/);
  assert.match(migration, /grant execute on function public\.consume_auth_action_quota\(text, integer, integer\) to service_role/);
  assert.match(migration, /revoke all on function public\.consume_auth_action_quota\(text, integer, integer\) from public, anon, authenticated/);
});

test('production smoke waits for real app content instead of only an old reachable alias', () => {
  const source = read('.github/workflows/production-smoke.yml');
  assert.match(source, /Wait for production app/);
  assert.match(source, /grep -Eqi "MY AGENT AIR\|My Agent Air"/);
  assert.match(source, /for attempt in \{1\.\.20\}/);
});
