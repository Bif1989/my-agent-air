const fs = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { POST: authPost } = require('../app/api/auth/[action]/route.ts');
const { POST: outreachPost } = require('../app/api/supplier-outreach/[action]/route.ts');

const read = (path) => fs.readFileSync(path, 'utf8');

for (const action of ['__proto__', 'constructor', 'toString']) {
  test(`consolidated API routes reject inherited action key ${action} with 404`, async () => {
    const authResponse = await authPost(new NextRequest(`http://localhost/api/auth/${action}`, { method: 'POST' }));
    assert.equal(authResponse.status, 404);
    assert.equal((await authResponse.json()).code, 'NOT_FOUND');

    const outreachResponse = await outreachPost(new NextRequest(`http://localhost/api/supplier-outreach/${action}`, { method: 'POST' }));
    assert.equal(outreachResponse.status, 404);
    assert.equal((await outreachResponse.json()).code, 'NOT_FOUND');
  });
}

test('admin open-request stats distinguish current, expired and total open requests', () => {
  const api = read('app/admin/admin-api.ts');
  const page = read('app/admin/page.tsx');

  assert.match(api, /requestFreshnessFilter\("current"\)/);
  assert.match(api, /requestFreshnessFilter\("expired"\)/);
  assert.match(api, /status=eq\.open&and=\(\$\{currentRequestFilter\}\)/);
  assert.match(api, /status=eq\.open&and=\(\$\{expiredRequestFilter\}\)/);
  assert.match(api, /countRows\("requests\?select=id&status=eq\.open"\)/);

  assert.match(page, /Joriy ochiq so‘rovlar/);
  assert.match(page, /Muddati o‘tgan ochiq/);
  assert.match(page, /Jami ochiq so‘rovlar/);
  assert.match(page, /stats\.openRequests/);
  assert.match(page, /stats\.expiredOpenRequests/);
  assert.match(page, /stats\.totalOpenRequests/);
});
