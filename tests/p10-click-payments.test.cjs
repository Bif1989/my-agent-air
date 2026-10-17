const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildClickPaymentUrl,
  expectedClickSignature,
  parseClickAmountUzs,
  parseClickForm,
  verifyClickSignature,
} = require('../lib/server/click-shop.ts');

const root = path.resolve(__dirname, '..');

function md5(value) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

test('CLICK Prepare signature matches the documented concatenation order', () => {
  const fields = {
    click_trans_id: '123456789', service_id: '26530', click_paydoc_id: '456789',
    merchant_trans_id: 'maa_0123456789abcdef0123456789abcdef', amount: '99000.00',
    action: '0', error: '0', error_note: 'Success', sign_time: '2026-10-16 16:00:00', sign_string: '',
  };
  const secret = 'test-secret-never-production';
  const expected = md5(fields.click_trans_id + fields.service_id + secret + fields.merchant_trans_id + fields.amount + fields.action + fields.sign_time);
  assert.equal(expectedClickSignature(fields, secret), expected);
  fields.sign_string = expected;
  assert.equal(verifyClickSignature(fields, secret), true);
});

test('CLICK Complete signature includes merchant_prepare_id', () => {
  const fields = {
    click_trans_id: '123456789', service_id: '26530', click_paydoc_id: '456789',
    merchant_trans_id: 'maa_0123456789abcdef0123456789abcdef', merchant_prepare_id: '42', amount: '99000',
    action: '1', error: '0', error_note: 'Success', sign_time: '2026-10-16 16:01:00', sign_string: '',
  };
  const secret = 'another-test-secret';
  const expected = md5(fields.click_trans_id + fields.service_id + secret + fields.merchant_trans_id + fields.merchant_prepare_id + fields.amount + fields.action + fields.sign_time);
  fields.sign_string = expected;
  assert.equal(expectedClickSignature(fields, secret), expected);
  assert.equal(verifyClickSignature(fields, secret), true);
});

test('CLICK amount parser accepts only positive whole UZS values', () => {
  assert.equal(parseClickAmountUzs('99000'), 99000);
  assert.equal(parseClickAmountUzs('99000.00'), 99000);
  assert.equal(parseClickAmountUzs('99000.0'), 99000);
  assert.equal(parseClickAmountUzs('99000.10'), null);
  assert.equal(parseClickAmountUzs('-1'), null);
  assert.equal(parseClickAmountUzs('1e5'), null);
});

test('CLICK form parser requires merchant_prepare_id only for Complete', () => {
  const base = new URLSearchParams({
    click_trans_id: '1', service_id: '26530', click_paydoc_id: '2', merchant_trans_id: 'maa_0123456789abcdef0123456789abcdef',
    amount: '99000', action: '0', error: '0', error_note: 'Success', sign_time: '2026-10-16 16:00:00', sign_string: '0'.repeat(32),
  }).toString();
  assert.ok(parseClickForm(base, false));
  assert.equal(parseClickForm(base, true), null);
});

test('CLICK payment URL uses server order reference and configured merchant values', () => {
  const url = new URL(buildClickPaymentUrl({
    paymentUrl: 'https://my.click.uz/services/pay', serviceId: '26530', merchantId: '18796', merchantUserId: '30277',
    orderRef: 'maa_0123456789abcdef0123456789abcdef', amount: 99000,
    returnUrl: 'https://agent.bifavia.uz/billing/subscription?payment=click',
  }));
  assert.equal(url.searchParams.get('service_id'), '26530');
  assert.equal(url.searchParams.get('merchant_id'), '18796');
  assert.equal(url.searchParams.get('merchant_user_id'), '30277');
  assert.equal(url.searchParams.get('amount'), '99000');
  assert.equal(url.searchParams.get('transaction_param'), 'maa_0123456789abcdef0123456789abcdef');
});

test('CLICK route stays server-only and supports both subscription and wallet top-up orders', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/payments/click/[stage]/route.ts'), 'utf8');
  assert.match(route, /process\.env\[name\]/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_CLICK/);
  assert.match(route, /requestIsCrossSite/);
  assert.match(route, /sec-fetch-site/);
  assert.match(route, /pendingSubscriptionOrder/);
  assert.match(route, /pendingWalletOrder/);
  assert.match(route, /purpose: PaymentPurpose/);
  assert.match(route, /wallet_topup/);
  assert.match(route, /billing_settings/);
  assert.match(route, /wallet_mode_enabled/);
  assert.match(route, /wallet_topup_min/);
  assert.match(route, /wallet_topup_max/);
  assert.match(route, /plan_code: planCode/);
  assert.match(route, /prepare_billing_click_order/);
  assert.match(route, /complete_billing_click_order/);
  assert.match(route, /cancel_billing_click_order/);
  assert.match(route, /CLICK_ENABLED/);
  assert.match(route, /verifyClickSignature/);
  assert.match(route, /CLICK_WALLET_RETURN_URL/);
});

test('wallet top-up cannot be exposed before the database release switch is enabled', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/payments/click/[stage]/route.ts'), 'utf8');
  assert.match(route, /if \(!settings\.wallet_mode_enabled\).*WALLET_MODE_DISABLED/);
  assert.match(route, /Number\.isSafeInteger\(amount\)/);
  assert.match(route, /amount < settings\.wallet_topup_min/);
  assert.match(route, /amount > settings\.wallet_topup_max/);
});
