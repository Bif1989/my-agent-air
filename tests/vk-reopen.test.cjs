const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('VK Mini App reuses or refreshes a stored session before issuing a new VK login', () => {
  const source = read('app/components/vk-launch-auth.tsx');
  assert.match(source, /getStoredSession, refreshSession, saveSession, sessionNeedsRefresh/);
  assert.doesNotMatch(source, /if \(getStoredSession\(\)\) return;/);
  assert.match(source, /if \(sessionNeedsRefresh\(stored\)\)/);
  assert.match(source, /active = await refreshSession\(\)\.catch\(\(\) => null\)/);
  assert.match(source, /if \(active\) \{/);
  assert.match(source, /window\.location\.replace\("\/dashboard"\)/);
});

test('VK bridge initialization failure does not block signed server-side authentication', () => {
  const source = read('app/components/vk-launch-auth.tsx');
  assert.match(source, /try \{\s*await bridge\.send\("VKWebAppInit"\);\s*\} catch \{/s);
  assert.match(source, /fetch\("\/api\/auth\/vk"/);
});
