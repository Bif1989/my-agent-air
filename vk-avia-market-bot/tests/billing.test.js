const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.CLICK_SERVICE_ID = '113792';
process.env.CLICK_MERCHANT_ID = '18796';
process.env.CLICK_MERCHANT_USER_ID = '93023';
process.env.CLICK_SECRET_KEY = 'test-secret-never-production';
process.env.CLICK_PAYMENT_URL = 'https://my.click.uz/services/pay';
process.env.CLICK_RETURN_URL = 'https://vk.me/aviamarketbot';
process.env.CLICK_ENABLED = 'true';

const billing = require('../lib/billing');

assert.strictEqual(billing.parseUserAmount('100000'), 100000);
assert.strictEqual(billing.parseUserAmount('100 000'), 100000);
assert.strictEqual(billing.parseUserAmount("100'000"), 100000);
assert.strictEqual(billing.parseUserAmount('100000.50'), null);
assert.strictEqual(billing.parseUserAmount('-1000'), null);

assert.deepStrictEqual(billing.parseProfileInput('BIF AVIA | +998 91 292 40 10 | @bif89'), {
  company: 'BIF AVIA',
  phone: '+998 91 292 40 10',
  telegram: '@bif89',
});

const prepare = {
  click_trans_id: '123456789',
  service_id: '113792',
  click_paydoc_id: '987654',
  merchant_trans_id: 'amw_0123456789abcdef0123456789abcdef',
  amount: '100000.00',
  action: '0',
  error: '0',
  error_note: 'Success',
  sign_time: '2026-10-16 18:00:00',
  sign_string: '',
};
const expectedPrepare = crypto.createHash('md5').update(
  prepare.click_trans_id + prepare.service_id + process.env.CLICK_SECRET_KEY + prepare.merchant_trans_id + prepare.amount + prepare.action + prepare.sign_time,
  'utf8',
).digest('hex');
prepare.sign_string = expectedPrepare;
assert.strictEqual(billing.expectedClickSignature(prepare), expectedPrepare);
assert.strictEqual(billing.verifyClickSignature(prepare), true);

const complete = {
  ...prepare,
  action: '1',
  merchant_prepare_id: '42',
  sign_time: '2026-10-16 18:01:00',
  sign_string: '',
};
const expectedComplete = crypto.createHash('md5').update(
  complete.click_trans_id + complete.service_id + process.env.CLICK_SECRET_KEY + complete.merchant_trans_id + complete.merchant_prepare_id + complete.amount + complete.action + complete.sign_time,
  'utf8',
).digest('hex');
complete.sign_string = expectedComplete;
assert.strictEqual(billing.expectedClickSignature(complete), expectedComplete);
assert.strictEqual(billing.verifyClickSignature(complete), true);
assert.strictEqual(billing.verifyClickSignature({ ...complete, sign_string: '0'.repeat(32) }), false);

assert.strictEqual(billing.parseClickAmount('100000'), 100000);
assert.strictEqual(billing.parseClickAmount('100000.00'), 100000);
assert.strictEqual(billing.parseClickAmount('100000.10'), null);
assert.strictEqual(billing.parseClickAmount('1e5'), null);

const parsedPrepare = billing.normalizeClickFields(new URLSearchParams(prepare).toString(), false);
assert.strictEqual(parsedPrepare.merchant_trans_id, prepare.merchant_trans_id);
assert.strictEqual(billing.normalizeClickFields(new URLSearchParams(prepare).toString(), true), null, 'Complete must require merchant_prepare_id');
assert.strictEqual(billing.normalizeClickFields(new URLSearchParams(complete).toString(), true).merchant_prepare_id, '42');

const paymentUrl = new URL(billing.buildClickPaymentUrl({
  orderRef: prepare.merchant_trans_id,
  amount: 100000,
}));
assert.strictEqual(paymentUrl.origin + paymentUrl.pathname, 'https://my.click.uz/services/pay');
assert.strictEqual(paymentUrl.searchParams.get('service_id'), '113792');
assert.strictEqual(paymentUrl.searchParams.get('merchant_id'), '18796');
assert.strictEqual(paymentUrl.searchParams.get('merchant_user_id'), '93023');
assert.strictEqual(paymentUrl.searchParams.get('amount'), '100000');
assert.strictEqual(paymentUrl.searchParams.get('transaction_param'), prepare.merchant_trans_id);
assert.strictEqual(paymentUrl.searchParams.get('return_url'), 'https://vk.me/aviamarketbot');

const health = billing.clickHealth();
assert.strictEqual(health.enabled, true);
assert.strictEqual(health.configured, true);
assert.strictEqual(health.secret_configured, true);
assert(!JSON.stringify(health).includes(process.env.CLICK_SECRET_KEY), 'health output must never expose CLICK_SECRET_KEY');

const apiRoot = path.join(__dirname, '..', 'api');
const apiFiles = fs.readdirSync(apiRoot).filter((name) => name.endsWith('.js'));
assert.deepStrictEqual(apiFiles, ['vk-callback.js'], 'billing must reuse the existing single Vercel Function');
const callbackSource = fs.readFileSync(path.join(apiRoot, 'vk-callback.js'), 'utf8');
assert(callbackSource.includes('billing.handleClickWebhook'));
assert(callbackSource.includes('billing.handleVkEvent'));
assert(callbackSource.includes("req.query?.click"));

const storageSource = fs.readFileSync(path.join(__dirname, '..', 'lib', 'storage.js'), 'utf8');
for (const action of ['billing_status','create_click_topup','prepare_click_topup','complete_click_topup','cancel_click_topup','buy_tariff','billing_history']) {
  assert(storageSource.includes(`'${action}'`), `storage must call ${action}`);
}

console.log('billing tests: OK');
