const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('new passwords use a ten-character floor and HIBP k-anonymity screening', async () => {
  const security = require('../lib/server/password-security.ts');
  assert.equal(security.MIN_NEW_PASSWORD_LENGTH, 10);
  assert.match(security.newPasswordValidationMessage('short'), /10/);

  const password = 'known-test-password';
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  const originalFetch = global.fetch;
  let requested = '';
  global.fetch = async (url, init) => {
    requested = String(url);
    assert.equal(init.method, 'GET');
    assert.equal(init.headers['Add-Padding'], 'true');
    return new Response(`${suffix}:42\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:1\r\n`);
  };
  try {
    assert.deepEqual(await security.checkPasswordExposure(password), { status: 'leaked' });
    assert.ok(requested.endsWith(`/range/${prefix}`));
    assert.equal(requested.includes(suffix), false);
    assert.equal(requested.includes(password), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('signup and recovery UI enforce the new password path and expose optional Turnstile challenges', () => {
  const register = read('app/register/page.tsx');
  const login = read('app/login/page.tsx');
  const forgot = read('app/forgot-password/page.tsx');
  const reset = read('app/reset-password/page.tsx');
  const signupRoute = read('app/api/auth/signup/route.ts');
  const recoveryRoute = read('app/api/auth/update-password/route.ts');

  assert.match(register, /MIN_PASSWORD_LENGTH = 10/);
  assert.match(reset, /MIN_PASSWORD_LENGTH = 10/);
  assert.match(reset, /updateRecoveryPassword/);
  assert.doesNotMatch(reset, /\bupdatePassword\(/);
  assert.match(signupRoute, /checkPasswordExposure\(password\)/);
  assert.match(recoveryRoute, /checkPasswordExposure\(password\)/);
  assert.match(recoveryRoute, /method === "recovery"/);
  assert.match(recoveryRoute, /RECOVERY_MAX_AGE_SECONDS/);
  assert.match(recoveryRoute, /\/auth\/v1\/user/);

  assert.match(register, /TurnstileChallenge action="signup"/);
  assert.match(login, /TurnstileChallenge action="login"/);
  assert.match(forgot, /TurnstileChallenge action="recover"/);
  for (const route of ['app/api/auth/signup/route.ts', 'app/api/auth/password/route.ts', 'app/api/auth/recover/route.ts']) {
    assert.match(read(route), /verifyTurnstile/);
  }
});

test('Turnstile is dormant without keys, fails closed on partial config, and validates action plus hostname', async () => {
  const helper = require('../lib/server/turnstile.ts');
  const oldSite = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const oldSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalFetch = global.fetch;
  try {
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    assert.deepEqual(await helper.verifyTurnstile({ token: '', action: 'login' }), { ok: true, configured: false });

    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site';
    delete process.env.TURNSTILE_SECRET_KEY;
    const partial = await helper.verifyTurnstile({ token: 'token', action: 'login' });
    assert.equal(partial.ok, false);
    assert.equal(partial.status, 503);

    process.env.TURNSTILE_SECRET_KEY = 'secret';
    global.fetch = async (url, init) => {
      assert.equal(String(url), 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
      assert.equal(init.method, 'POST');
      assert.match(String(init.body), /secret=secret/);
      assert.match(String(init.body), /response=token/);
      return Response.json({ success: true, action: 'login', hostname: 'agent.bifavia.uz' });
    };
    assert.deepEqual(await helper.verifyTurnstile({ token: 'token', action: 'login', hostname: 'agent.bifavia.uz' }), { ok: true, configured: true });
    const wrongAction = await helper.verifyTurnstile({ token: 'token', action: 'signup', hostname: 'agent.bifavia.uz' });
    assert.equal(wrongAction.ok, false);
    assert.equal(wrongAction.status, 403);
  } finally {
    if (oldSite === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = oldSite;
    if (oldSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = oldSecret;
    global.fetch = originalFetch;
  }
});
