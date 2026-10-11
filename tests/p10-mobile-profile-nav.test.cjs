const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appShell = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/components/app-shell.tsx'), 'utf8');
const profilePage = fs.readFileSync(path.join(process.cwd(), 'app/profile/page.tsx'), 'utf8');

test('mobile navigation exposes account and tariff in Uzbek and Russian', () => {
  assert.match(appShell, /\["Hisob va tarif", "\/profile", "◉"\]/);
  assert.match(appShell, /\["Счёт и тариф", "\/profile", "◉"\]/);
  assert.match(appShell, /grid-cols-6/);
  assert.match(appShell, /h-20/);
});

test('account hub links profile users to billing and Unlimited tariff', () => {
  assert.match(profilePage, />Hisob va tarif<\/h1>/);
  assert.match(profilePage, /href="\/billing"/);
  assert.match(profilePage, /href="\/billing\/subscription"/);
});
