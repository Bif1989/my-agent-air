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

test('auth requests are normalized, uncached and time bounded without direct public bypass helpers', () => {
  const session = read('lib/supabase-auth.ts');
  const password = read('lib/password-auth.ts');
  const publicAuth = read('lib/public-auth.ts');
  assert.match(session, /AUTH_REQUEST_TIMEOUT_MS = 15_000/);
  assert.match(session, /controller\.abort\(\)/);
  assert.match(session, /cache: "no-store"/);
  assert.match(session, /referrerPolicy: "no-referrer"/);
  assert.match(password, /email\.trim\(\)\.toLowerCase\(\)/);
  assert.match(publicAuth, /email: input\.email\.trim\(\)\.toLowerCase\(\)/);
  assert.doesNotMatch(session, /export function signIn\(/);
  assert.doesNotMatch(session, /export function signUp\(/);
  assert.doesNotMatch(session, /export function verifySignupOtp\(/);
  assert.doesNotMatch(session, /export function resendSignupOtp\(/);
  assert.doesNotMatch(session, /export function requestPasswordReset\(/);
});

test('session storage does not keep a second duplicate access-token key', () => {
  const source = read('lib/supabase-auth.ts');
  assert.doesNotMatch(source, /localStorage\.setItem\(ACCESS_TOKEN_STORAGE_KEY/);
  assert.match(source, /localStorage\.removeItem\(ACCESS_TOKEN_STORAGE_KEY\)/);
});

test('stored sessions are bound to the JWT subject and refreshed before expiry', () => {
  const source = read('lib/supabase-auth.ts');
  assert.match(source, /function decodeJwtClaims/);
  assert.match(source, /TextDecoder/);
  assert.match(source, /function accessTokenSubject/);
  assert.match(source, /subject !== data\.user\.id/);
  assert.match(source, /subject !== session\.user\.id/);
  assert.match(source, /if \(!claims \|\| typeof claims\.exp !== "number"\) return true/);
  assert.match(source, /if \(sessionNeedsRefresh\(session\)\)/);
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
  assert.match(recover, /hisob mavjud bo‘lsa/);
  assert.match(migration, /grant execute on function public\.consume_auth_action_quota\(text, integer, integer\) to service_role/);
  assert.match(migration, /revoke all on function public\.consume_auth_action_quota\(text, integer, integer\) from public, anon, authenticated/);
});

test('signup OTP verification and resend use protected server-side quotas', () => {
  const register = read('app/register/page.tsx');
  const client = read('lib/public-auth.ts');
  const verify = read('app/api/auth/verify-signup/route.ts');
  const resend = read('app/api/auth/resend-signup/route.ts');

  assert.match(register, /verifySignupOtpProtected/);
  assert.match(register, /resendSignupOtpProtected/);
  assert.match(client, /\/api\/auth\/verify-signup/);
  assert.match(client, /\/api\/auth\/resend-signup/);
  assert.match(verify, /consume_auth_action_quota/);
  assert.match(verify, /otp-verify-pair/);
  assert.match(verify, /limit: 5, window: 900/);
  assert.match(verify, /limit: 30, window: 3600/);
  assert.match(verify, /sec-fetch-site/);
  assert.match(verify, /INVALID_OTP/);
  assert.match(resend, /consume_auth_action_quota/);
  assert.match(resend, /otp-resend-pair/);
  assert.match(resend, /limit: 3, window: 1800/);
  assert.match(resend, /limit: 20, window: 3600/);
  assert.match(resend, /tasdiqlash kutilayotgan bo‘lsa/);
});

test('production smoke waits for real app content instead of only an old reachable alias', () => {
  const source = read('.github/workflows/production-smoke.yml');
  assert.match(source, /Wait for production app/);
  assert.match(source, /grep -Eqi "MY AGENT AIR\|My Agent Air"/);
  assert.match(source, /for attempt in \{1\.\.20\}/);
});
