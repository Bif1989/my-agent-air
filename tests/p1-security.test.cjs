const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('production responses use baseline browser security headers', () => {
  const source = read('next.config.ts');
  assert.match(source, /X-Content-Type-Options/);
  assert.match(source, /nosniff/);
  assert.match(source, /X-Frame-Options/);
  assert.match(source, /DENY/);
  assert.match(source, /Referrer-Policy/);
  assert.match(source, /Permissions-Policy/);
  assert.match(source, /microphone=\(self\)/);
  assert.match(source, /Strict-Transport-Security/);
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
