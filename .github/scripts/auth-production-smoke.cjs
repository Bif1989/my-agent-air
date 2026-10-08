/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const base = process.env.BASE_URL || 'https://agent.bifavia.uz';

// Invalid requests only: never creates accounts, sends emails, or consumes AI credits.
(async () => {
  for (const route of ['password', 'signup', 'recover', 'resend-signup', 'verify-signup', 'update-password']) {
    const response = await fetch(`${base}/api/auth/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://invalid.example', 'Sec-Fetch-Site': 'cross-site' },
      body: '{}', signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 403, `${route}: cross-site request must be rejected`);
    assert.equal((await response.json()).code, 'FORBIDDEN', `${route}: expected structured error`);
    assert.match(response.headers.get('cache-control') || '', /no-store/, `${route}: auth errors must not be cached`);
  }
  const response = await fetch(`${base}/api/auth/update-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 401, 'Recovery requires a session');
  assert.equal((await response.json()).code, 'RECOVERY_REQUIRED');
  console.log('Production auth smoke passed: six cross-site guards, no-store headers, recovery session guard');
})().catch(error => { console.error(error); process.exit(1); });
