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
    global.fetch = async () => new Response(`${suffix}:0\r\n`);
    assert.deepEqual(await security.checkPasswordExposure(password), { status: 'safe' });
    global.fetch = async () => new Response(`${suffix}:invalid\r\n`);
    assert.deepEqual(await security.checkPasswordExposure(password), { status: 'safe' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('signup and recovery UI enforce the new password path and expose optional Turnstile challenges', () => {
  const register = read('app/register/page.tsx');
  const login = read('app/login/page.tsx');
  const forgot = read('app/forgot-password/page.tsx');
  const reset = read('app/reset-password/page.tsx');
  const signupRoute = read('lib/server/auth-actions/signup.ts');
  const recoveryRoute = read('lib/server/auth-actions/update-password.ts');

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
  for (const route of ['lib/server/auth-actions/signup.ts', 'lib/server/auth-actions/password.ts', 'lib/server/auth-actions/recover.ts']) {
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
    for (const hostname of ['other.example', undefined, 123]) {
      global.fetch = async () => Response.json({ success: true, action: 'login', hostname });
      const result = await helper.verifyTurnstile({ token: 'token', action: 'login', hostname: 'agent.bifavia.uz' });
      assert.equal(result.ok, false);
      assert.equal(result.status, 403);
    }
  } finally {
    if (oldSite === undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY; else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = oldSite;
    if (oldSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY; else process.env.TURNSTILE_SECRET_KEY = oldSecret;
    global.fetch = originalFetch;
  }
});

test('recovery rejects oversized chunked bodies before any upstream request', async () => {
  const { NextRequest } = require('next/server');
  const { POST } = require('../lib/server/auth-actions/update-password.ts');
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; throw new Error('Must not contact upstream'); };
  try {
    for (const declaredLength of [undefined, '2']) {
      let cancelled = false;
      const payload = new TextEncoder().encode(JSON.stringify({ password: 'x'.repeat(5000) }));
      const stream = new ReadableStream({
        start(controller) { controller.enqueue(payload); },
        cancel() { cancelled = true; },
      });
      const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer invalid-test-token' };
      if (declaredLength) headers['Content-Length'] = declaredLength;
      const response = await POST(new NextRequest('https://agent.bifavia.uz/api/auth/update-password', {
        method: 'POST', headers, body: stream, duplex: 'half',
      }));
      assert.equal(response.status, 422);
      assert.equal(cancelled, true);
      assert.equal(calls, 0);
    }
  } finally { global.fetch = originalFetch; }
});
