const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appShell = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/components/app-shell.tsx'), 'utf8');
const profilePage = fs.readFileSync(path.join(process.cwd(), 'app/profile/page.tsx'), 'utf8');

test('mobile navigation stays compact while account and tariff live inside cabinet', () => {
  assert.match(appShell, /\["Kabinet", "\/deals", "◉"\]/);
  assert.match(appShell, /\["Кабинет", "\/deals", "◉"\]/);
  assert.match(appShell, /label: isRu \? "Счёт и тариф" : "Hisob va tarif", href: "\/billing"/);
  assert.match(appShell, /label: isRu \? "Профиль" : "Profil", href: "\/profile"/);
  assert.match(appShell, /grid-cols-5/);
  assert.match(appShell, /h-20/);
  assert.doesNotMatch(appShell, /grid-cols-6/);
});

test('account hub links profile users to billing and Unlimited tariff', () => {
  assert.match(profilePage, />Hisob va tarif<\/h1>/);
  assert.match(profilePage, /href="\/billing"/);
  assert.match(profilePage, /href="\/billing\/subscription"/);
});
