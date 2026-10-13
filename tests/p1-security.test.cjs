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

test('production responses use baseline browser security headers and only trusted frame ancestors', () => {
  const source = read('next.config.ts');
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /nosniff/);
  assert.match(source, /Referrer-Policy/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /microphone=\(self\)/);
  assert.match(source, /Strict-Transport-Security/);
  assert.doesNotMatch(source, /X-Frame-Options/);
  assert.match(source, /Content-Security-Policy/);
  assert.match(source, /frame-ancestors 'self'/);
  assert.match(source, /https:\/\/vk\.com/);
  assert.match(source, /https:\/\/\*\.vk\.com/);
  assert.match(source, /https:\/\/vk\.ru/);
  assert.match(source, /https:\/\/\*\.vk\.ru/);
  assert.doesNotMatch(source, /frame-ancestors \*/);
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
  assert.match(password, /identifier: identifier\.trim\(\)/);
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
  const route = read('lib/server/auth-actions/password.ts');
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
  assert.match(route, /normalizeUzPhone/);
  assert.match(route, /phone_\$\{phone\}@\$\{PHONE_EMAIL_DOMAIN\}/);
  assert.match(migration, /\(p_pair_hash, 5, 900\)/);
  assert.match(migration, /\(p_ip_hash, 30, 1800\)/);
  assert.match(migration, /grant execute on function public\.auth_login_limit_status\(text, text\) to service_role/);
  assert.match(migration, /revoke all on function public\.auth_login_limit_status\(text, text\) from public, anon, authenticated/);
});

test('SMS signup and password recovery use protected server-side quotas', () => {
  const register = read('app/register/page.tsx');
  const forgot = read('app/forgot-password/page.tsx');
  const client = read('lib/public-auth.ts');
  const signupSms = read('lib/server/auth-actions/signup-sms.ts');
  const recover = read('lib/server/auth-actions/recover.ts');
  const migration = read('supabase/migrations/20261008152500_p1_auth_action_rate_limit.sql');

  assert.match(register, /requestSignupSmsProtected/);
  assert.match(forgot, /requestPasswordResetProtected/);
  assert.match(client, /\/api\/auth\/signup-sms/);
  assert.match(client, /\/api\/auth\/recover/);
  assert.match(signupSms, /consume_auth_action_quota/);
  assert.match(signupSms, /signup-sms/);
  assert.match(signupSms, /p_limit: 5/);
  assert.match(signupSms, /p_window_seconds: 3600/);
  assert.match(recover, /consume_auth_action_quota/);
  assert.match(recover, /recover-pair/);
  assert.match(recover, /limit: 3, window: 1800/);
  assert.match(recover, /limit: 20, window: 3600/);
  assert.match(recover, /hisob mavjud bo‘lsa/);
  assert.match(migration, /grant execute on function public\.consume_auth_action_quota\(text, integer, integer\) to service_role/);
  assert.match(migration, /revoke all on function public\.consume_auth_action_quota\(text, integer, integer\) from public, anon, authenticated/);
});

test('SMS signup OTP is hashed, expires, limits retries, and uses server-side Eskiz credentials', () => {
  const register = read('app/register/page.tsx');
  const client = read('lib/public-auth.ts');
  const route = read('lib/server/auth-actions/signup-sms.ts');
  const migration = read('supabase/migrations/20261012162000_registration_sms_otp.sql');

  assert.match(register, /verifySignupSmsProtected/);
  assert.match(register, /resendSignupSmsProtected/);
  assert.match(register, /completeSignupSmsProtected/);
  assert.match(client, /phase: "verify"/);
  assert.match(client, /phase: "resend"/);
  assert.match(client, /phase: "complete"/);
  assert.match(route, /createHmac\("sha256"/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /OTP_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(route, /Number\(challenge\.attempts \|\| 0\) >= 5/);
  assert.match(route, /Number\(challenge\.resend_count \|\| 0\) >= 3/);
  assert.match(route, /process\.env\.ESKIZ_EMAIL/);
  assert.match(route, /process\.env\.ESKIZ_PASSWORD/);
  assert.match(route, /notify\.eskiz\.uz\/api\/auth\/login/);
  assert.match(route, /notify\.eskiz\.uz\/api\/message\/sms\/send/);
  assert.match(route, /email_confirm: true/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.registration_sms_otps from anon, authenticated/);
});

test('production smoke waits for real app content instead of only an old reachable alias', () => {
  const source = read('.github/workflows/production-smoke.yml');
  assert.match(source, /Wait for production app/);
  assert.match(source, /grep -Eqi "MY AGENT AIR\|My Agent Air"/);
  assert.match(source, /for attempt in \{1\.\.20\}/);
});
