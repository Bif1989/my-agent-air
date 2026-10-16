const assert = require('assert');
const {
  parseFields,
  expectedSignature,
  processClick,
  buildPaymentUrl,
  endpointHealth,
} = require('../lib/click');

const env = {
  CLICK_SERVICE_ID: '777',
  CLICK_SECRET_KEY: 'test-secret-only',
  CLICK_MERCHANT_ID: '888',
  CLICK_PAYMENT_URL: 'https://my.click.uz/services/pay',
  CLICK_RETURN_URL: 'https://vk.me/aviamarketbot',
  CLICK_ENABLED: 'false',
};

function signedPrepare(overrides = {}) {
  const fields = {
    click_trans_id: '123456',
    service_id: '777',
    click_paydoc_id: '654321',
    merchant_trans_id: 'amw_0123456789abcdef0123456789abcdef',
    merchant_prepare_id: '',
    amount: '1000.00',
    action: '0',
    error: '0',
    error_note: 'Success',
    sign_time: '2026-10-16 18:00:00',
    sign_string: '',
    ...overrides,
  };
  fields.sign_string = expectedSignature(fields, env.CLICK_SECRET_KEY, false);
  return fields;
}

function signedComplete(overrides = {}) {
  const fields = {
    ...signedPrepare(),
    merchant_prepare_id: '42',
    action: '1',
    ...overrides,
  };
  fields.sign_string = expectedSignature(fields, env.CLICK_SECRET_KEY, true);
  return fields;
}

(async () => {
  const parsed = parseFields('click_trans_id=1&service_id=2&error=0&error_note=OK');
  assert.strictEqual(parsed.click_trans_id, '1');
  assert.strictEqual(parsed.service_id, '2');
  assert.strictEqual(parsed.error, '0');

  const calls = [];
  const storageApi = {
    async prepareClickTopup(orderRef, transId, paydocId, amount) {
      calls.push(['prepare', orderRef, transId, paydocId, amount]);
      return { ok: true, merchant_prepare_id: 42 };
    },
    async completeClickTopup(orderRef, transId, paydocId, prepareId, amount) {
      calls.push(['complete', orderRef, transId, paydocId, prepareId, amount]);
      return { ok: true, merchant_confirm_id: 99 };
    },
    async cancelClickTopup(orderRef, transId, error, note) {
      calls.push(['cancel', orderRef, transId, error, note]);
      return { ok: true, status: 'cancelled' };
    },
  };

  const prepare = signedPrepare();
  const prepareReply = await processClick('prepare', prepare, { env, storageApi });
  assert.strictEqual(prepareReply.error, 0);
  assert.strictEqual(prepareReply.merchant_prepare_id, 42);
  assert.strictEqual(calls[0][0], 'prepare');
  assert.strictEqual(calls[0][4], 1000);

  const wrongSign = { ...prepare, sign_string: '00000000000000000000000000000000' };
  const wrongSignReply = await processClick('prepare', wrongSign, { env, storageApi });
  assert.strictEqual(wrongSignReply.error, -1);

  const complete = signedComplete();
  const completeReply = await processClick('complete', complete, { env, storageApi });
  assert.strictEqual(completeReply.error, 0);
  assert.strictEqual(completeReply.merchant_confirm_id, 99);
  assert.strictEqual(calls.some((item) => item[0] === 'complete'), true);

  const cancelled = signedComplete({ error: '-501', error_note: 'Provider cancelled' });
  const cancelledReply = await processClick('complete', cancelled, { env, storageApi });
  assert.strictEqual(cancelledReply.error, -9);
  assert.strictEqual(calls.some((item) => item[0] === 'cancel'), true);

  const health = endpointHealth('prepare', env);
  assert.strictEqual(health.configured, true);
  assert.strictEqual(health.payment_initiation_enabled, false);
  assert.throws(() => buildPaymentUrl('amw_test', 1000, env), /disabled|incomplete/i);

  const enabledEnv = { ...env, CLICK_ENABLED: 'true' };
  const paymentUrl = new URL(buildPaymentUrl('amw_test', 1000, enabledEnv));
  assert.strictEqual(paymentUrl.searchParams.get('service_id'), '777');
  assert.strictEqual(paymentUrl.searchParams.get('merchant_id'), '888');
  assert.strictEqual(paymentUrl.searchParams.get('amount'), '1000');
  assert.strictEqual(paymentUrl.searchParams.get('transaction_param'), 'amw_test');

  console.log('click tests: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
