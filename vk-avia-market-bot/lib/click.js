const crypto = require('crypto');
const storage = require('./storage');

const SUCCESS = 'Success';

function safeEqualHex(a, b) {
  if (!/^[0-9a-f]{32}$/i.test(String(a || '')) || !/^[0-9a-f]{32}$/i.test(String(b || ''))) return false;
  const left = Buffer.from(String(a).toLowerCase(), 'ascii');
  const right = Buffer.from(String(b).toLowerCase(), 'ascii');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizeFields(input) {
  const source = input && typeof input === 'object' ? input : {};
  const get = (key) => {
    const value = source[key];
    if (Array.isArray(value)) return value.length ? String(value[0] ?? '') : '';
    return value == null ? '' : String(value);
  };
  return {
    click_trans_id: get('click_trans_id'),
    service_id: get('service_id'),
    click_paydoc_id: get('click_paydoc_id'),
    merchant_trans_id: get('merchant_trans_id'),
    merchant_prepare_id: get('merchant_prepare_id'),
    amount: get('amount'),
    action: get('action'),
    error: get('error'),
    error_note: get('error_note'),
    sign_time: get('sign_time'),
    sign_string: get('sign_string'),
  };
}

function parseFields(body) {
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    const params = new URLSearchParams(body);
    return normalizeFields(Object.fromEntries(params.entries()));
  }
  return normalizeFields(body || {});
}

function signatureSource(fields, secret, isComplete) {
  return isComplete
    ? `${fields.click_trans_id}${fields.service_id}${secret}${fields.merchant_trans_id}${fields.merchant_prepare_id}${fields.amount}${fields.action}${fields.sign_time}`
    : `${fields.click_trans_id}${fields.service_id}${secret}${fields.merchant_trans_id}${fields.amount}${fields.action}${fields.sign_time}`;
}

function expectedSignature(fields, secret, isComplete) {
  return crypto.createHash('md5').update(signatureSource(fields, secret, isComplete), 'utf8').digest('hex');
}

function validSignature(fields, secret, isComplete) {
  if (!secret) return false;
  return safeEqualHex(expectedSignature(fields, secret, isComplete), fields.sign_string);
}

function integerAmount(value) {
  if (!/^\d+(?:\.0{1,2})?$/.test(String(value || ''))) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function bigintValue(value) {
  if (!/^\d+$/.test(String(value || ''))) return null;
  try { return BigInt(value); } catch { return null; }
}

function reasonError(reason) {
  const code = String(reason || '').toLowerCase();
  if (code.includes('amount_mismatch')) return [-2, 'Incorrect parameter amount'];
  if (code.includes('already_paid')) return [-4, 'Already paid'];
  if (code.includes('order_not_found') || code.includes('expired')) return [-5, 'Order not found'];
  if (code.includes('prepare_mismatch')) return [-6, 'Transaction not found'];
  if (code.includes('cancelled')) return [-9, 'Transaction cancelled'];
  if (code.includes('transaction_mismatch') || code.includes('collision')) return [-4, 'Transaction already exists'];
  return [-8, 'Error in request'];
}

function errorReply(fields, error, errorNote) {
  return {
    click_trans_id: fields?.click_trans_id ? Number(fields.click_trans_id) : 0,
    merchant_trans_id: fields?.merchant_trans_id || '',
    error,
    error_note: errorNote,
  };
}

function configState(env = process.env) {
  return {
    serviceId: String(env.CLICK_SERVICE_ID || '').trim(),
    secret: String(env.CLICK_SECRET_KEY || '').trim(),
    configured: Boolean(String(env.CLICK_SERVICE_ID || '').trim() && String(env.CLICK_SECRET_KEY || '').trim()),
    paymentsEnabled: String(env.CLICK_ENABLED || '').toLowerCase() === 'true',
  };
}

async function processClick(stage, rawFields, options = {}) {
  const storageApi = options.storageApi || storage;
  const env = options.env || process.env;
  const isComplete = stage === 'complete';
  const fields = parseFields(rawFields);

  if (stage !== 'prepare' && stage !== 'complete') return errorReply(fields, -3, 'Action not found');

  const required = [
    fields.click_trans_id,
    fields.service_id,
    fields.click_paydoc_id,
    fields.merchant_trans_id,
    fields.amount,
    fields.action,
    fields.error,
    fields.sign_time,
    fields.sign_string,
  ];
  if (isComplete) required.push(fields.merchant_prepare_id);
  if (required.some((value) => !value)) return errorReply(fields, -8, 'Error in request');

  const { serviceId, secret, configured } = configState(env);
  if (!configured) return errorReply(fields, -8, 'Service unavailable');
  if (fields.service_id !== serviceId) return errorReply(fields, -8, 'Incorrect service_id');
  if (fields.action !== (isComplete ? '1' : '0')) return errorReply(fields, -3, 'Action not found');
  if (!validSignature(fields, secret, isComplete)) return errorReply(fields, -1, 'SIGN CHECK FAILED!');

  const amount = integerAmount(fields.amount);
  const clickTransId = bigintValue(fields.click_trans_id);
  const clickPaydocId = bigintValue(fields.click_paydoc_id);
  const merchantPrepareId = isComplete && /^\d+$/.test(fields.merchant_prepare_id) ? Number(fields.merchant_prepare_id) : null;
  if (amount === null || clickTransId === null || clickPaydocId === null || (isComplete && (!Number.isSafeInteger(merchantPrepareId) || merchantPrepareId <= 0))) {
    return errorReply(fields, -8, 'Incorrect parameters');
  }

  if (!isComplete) {
    try {
      const result = await storageApi.prepareClickTopup(
        fields.merchant_trans_id,
        clickTransId.toString(),
        clickPaydocId.toString(),
        amount,
      );
      if (!result?.ok || !Number.isInteger(Number(result.merchant_prepare_id))) {
        const [code, note] = reasonError(result?.reason || result?.error || result?.code);
        return errorReply(fields, code, note);
      }
      return {
        click_trans_id: Number(fields.click_trans_id),
        merchant_trans_id: fields.merchant_trans_id,
        merchant_prepare_id: Number(result.merchant_prepare_id),
        error: 0,
        error_note: SUCCESS,
      };
    } catch (error) {
      const [code, note] = reasonError(error?.code || error?.message);
      if (code === -8) console.error('click_prepare_storage_failed', { code: error?.code || 'unknown' });
      return errorReply(fields, code, code === -8 ? 'Service unavailable' : note);
    }
  }

  const providerError = Number(fields.error);
  if (!Number.isInteger(providerError)) return errorReply(fields, -8, 'Incorrect error parameter');
  if (providerError < 0) {
    try {
      await storageApi.cancelClickTopup(fields.merchant_trans_id, clickTransId.toString(), providerError, fields.error_note);
    } catch (error) {
      console.error('click_cancel_storage_failed', { code: error?.code || 'unknown' });
    }
    return errorReply(fields, -9, 'Transaction cancelled');
  }

  try {
    const result = await storageApi.completeClickTopup(
      fields.merchant_trans_id,
      clickTransId.toString(),
      clickPaydocId.toString(),
      merchantPrepareId,
      amount,
    );
    if (!result?.ok || !Number.isInteger(Number(result.merchant_confirm_id))) {
      const [code, note] = reasonError(result?.reason || result?.error || result?.code);
      return errorReply(fields, code, note);
    }
    return {
      click_trans_id: Number(fields.click_trans_id),
      merchant_trans_id: fields.merchant_trans_id,
      merchant_confirm_id: Number(result.merchant_confirm_id),
      error: 0,
      error_note: SUCCESS,
    };
  } catch (error) {
    const [code, note] = reasonError(error?.code || error?.message);
    if (code === -8) console.error('click_complete_storage_failed', { code: error?.code || 'unknown' });
    return errorReply(fields, code, code === -8 ? 'Service unavailable' : note);
  }
}

function buildPaymentUrl(orderRef, amount, env = process.env) {
  const { configured, paymentsEnabled, serviceId } = configState(env);
  const merchantId = String(env.CLICK_MERCHANT_ID || '').trim();
  const baseUrl = String(env.CLICK_PAYMENT_URL || 'https://my.click.uz/services/pay').trim();
  const returnUrl = String(env.CLICK_RETURN_URL || 'https://vk.me/aviamarketbot').trim();
  if (!configured || !paymentsEnabled || !merchantId || !baseUrl) {
    const error = new Error('Click payment initiation is disabled or incomplete');
    error.code = 'click_disabled';
    throw error;
  }
  const sum = integerAmount(String(amount));
  if (!sum || !String(orderRef || '')) {
    const error = new Error('Invalid Click order');
    error.code = 'click_order_invalid';
    throw error;
  }
  const url = new URL(baseUrl);
  url.searchParams.set('service_id', serviceId);
  url.searchParams.set('merchant_id', merchantId);
  url.searchParams.set('amount', String(sum));
  url.searchParams.set('transaction_param', String(orderRef));
  url.searchParams.set('return_url', returnUrl);
  return url.toString();
}

function endpointHealth(stage, env = process.env) {
  const config = configState(env);
  return {
    ok: true,
    service: 'avia-market-click',
    stage,
    configured: config.configured,
    payment_initiation_enabled: config.paymentsEnabled,
  };
}

function makeHandler(stage) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (req.method === 'GET') {
      res.status(200).end(JSON.stringify(endpointHealth(stage)));
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
      return;
    }
    try {
      const reply = await processClick(stage, req.body || {});
      res.status(200).end(JSON.stringify(reply));
    } catch (error) {
      console.error('click_callback_unhandled', { stage, code: error?.code || 'unknown' });
      res.status(200).end(JSON.stringify({ click_trans_id: 0, merchant_trans_id: '', error: -8, error_note: 'Service unavailable' }));
    }
  };
}

module.exports = {
  parseFields,
  signatureSource,
  expectedSignature,
  validSignature,
  integerAmount,
  bigintValue,
  reasonError,
  errorReply,
  configState,
  processClick,
  buildPaymentUrl,
  endpointHealth,
  makeHandler,
};
