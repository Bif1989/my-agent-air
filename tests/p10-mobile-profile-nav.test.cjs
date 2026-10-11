const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appShell = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/components/app-shell.tsx'), 'utf8');

test('mobile navigation always exposes profile in Uzbek and Russian', () => {
  assert.match(appShell, /\["Profil", "\/profile", "◉"\]/);
  assert.match(appShell, /\["Профиль", "\/profile", "◉"\]/);
  assert.match(appShell, /grid-cols-6/);
});
