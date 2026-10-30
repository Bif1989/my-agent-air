/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');

function verifyRelease(expected, response) {
  assert.match(expected || '', /^[0-9a-f]{40}$/, 'Expected release must be a full Git SHA');
  assert.equal(response.status, 200, 'Production homepage must return HTTP 200');
  assert.equal(response.headers.get('x-release-commit'), expected, 'Production is serving a different or unidentified release');
}

async function main() {
  const expected = process.env.EXPECTED_RELEASE_SHA;
  assert.match(expected || '', /^[0-9a-f]{40}$/, 'Expected release must be a full Git SHA');
  const url = new URL('https://agent.bifavia.uz/');
  url.searchParams.set('release_check', `${expected}-${Date.now()}`);
  const response = await fetch(url, {
    redirect: 'error',
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(20000),
  });
  verifyRelease(expected, response);
  await response.body?.cancel();
  console.log(`Production release verified: ${expected}`);
}

module.exports = { verifyRelease };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
