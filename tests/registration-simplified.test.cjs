const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

test('registration starts with only phone or email plus password and defers business profile fields', () => {
  const register = read('app/register/page.tsx');
  assert.match(register, /type SignupMethod = "phone" \| "email"/);
  assert.match(register, /name="identifier"/);
  assert.match(register, /name="password"/);
  assert.doesNotMatch(register, /name="fullName"/);
  assert.doesNotMatch(register, /name="company"/);
  assert.doesNotMatch(register, /name="city"/);
  assert.doesNotMatch(register, /name="agentType"/);
  assert.match(register, /router\.replace\("\/profile\?complete=1"\)/);
});

test('unsafe password is checked before an SMS code is sent instead of after OTP entry', () => {
  const client = read('lib/public-auth.ts');
  const route = read('lib/server/auth-actions/signup-sms.ts');
  assert.match(client, /requestSignupSmsProtected\(phone: string, password: string, captchaToken: string\)/);
  const passwordCheck = route.indexOf('passwordCheck = await passwordIsAcceptable(password)');
  const smsSend = route.indexOf('await sendEskizCode(phone, code)');
  assert.ok(passwordCheck >= 0, 'password security check must exist');
  assert.ok(smsSend >= 0, 'SMS send must exist');
  assert.ok(passwordCheck < smsSend, 'password must be checked before SMS is sent');
});

test('phone signup creates an incomplete account without forcing email or company questionnaire', () => {
  const route = read('lib/server/auth-actions/signup-sms.ts');
  assert.match(route, /phoneSyntheticEmail\(phone\)/);
  assert.match(route, /auth_source: "phone"/);
  assert.match(route, /phone_verified: true/);
  assert.match(route, /email_confirm: true/);
  assert.doesNotMatch(route, /AGENT_TYPES/);
  assert.doesNotMatch(route, /company_name: company/);
});

test('email signup creates credentials first and leaves profile completion for after verification', () => {
  const route = read('lib/server/auth-actions/signup.ts');
  assert.match(route, /data: \{ auth_source: "email" \}/);
  assert.doesNotMatch(route, /AGENT_TYPES/);
  assert.doesNotMatch(route, /!fullName/);
  assert.doesNotMatch(route, /!company/);
  assert.doesNotMatch(route, /!city/);
});

test('password login accepts either email or Uzbekistan phone without adding a new serverless route', () => {
  const login = read('app/login/page.tsx');
  const client = read('lib/password-auth.ts');
  const route = read('lib/server/auth-actions/password.ts');
  assert.match(login, /Email yoki telefon/);
  assert.match(client, /identifier: identifier\.trim\(\)/);
  assert.match(route, /function normalizeUzPhone/);
  assert.match(route, /phone_\$\{phone\}@\$\{PHONE_EMAIL_DOMAIN\}/);
  assert.match(route, /body: JSON\.stringify\(\{ email: resolved\.email, password \}\)/);
});
