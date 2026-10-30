const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyRelease } = require('../.github/scripts/verify-production-release.cjs');
const sha = 'a'.repeat(40);
const response = (value, status = 200) => new Response(null, { status, headers: value ? { 'x-release-commit': value } : {} });

test('production smoke accepts only the intended successful release', () => {
  verifyRelease(sha, response(sha));
  assert.throws(() => verifyRelease(sha, response('b'.repeat(40))), /different or unidentified/);
  assert.throws(() => verifyRelease(sha, response(null)), /different or unidentified/);
  assert.throws(() => verifyRelease(sha, response(sha, 500)), /HTTP 200/);
  assert.throws(() => verifyRelease('main', response(sha)), /full Git SHA/);
});

test('build headers include the validated build commit without requiring runtime state', async () => {
  const configPath = require.resolve('../next.config.ts');
  const oldRelease = process.env.RELEASE_COMMIT_SHA;
  const oldVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    process.env.RELEASE_COMMIT_SHA = sha;
    delete require.cache[configPath];
    const config = require(configPath).default;
    assert.equal((await config.headers())[0].headers.find(h => h.key === 'X-Release-Commit').value, sha);
    delete process.env.RELEASE_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete require.cache[configPath];
    assert.equal((await require(configPath).default.headers())[0].headers.some(h => h.key === 'X-Release-Commit'), false);
    process.env.RELEASE_COMMIT_SHA = 'invalid';
    delete require.cache[configPath];
    assert.throws(() => require(configPath), /full 40-character/);
  } finally {
    if (oldRelease === undefined) delete process.env.RELEASE_COMMIT_SHA; else process.env.RELEASE_COMMIT_SHA = oldRelease;
    if (oldVercel === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = oldVercel;
    delete require.cache[configPath];
  }
});
