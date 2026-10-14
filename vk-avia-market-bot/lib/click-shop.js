const crypto = require('crypto');

function readFields(req) {
  let body = req.body || {};
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') body = Object.fromEntries(new URLSearchParams(body));
  return {
    click_trans_id: String(body.click_trans_id || ''),
    service_id: String(body.service_id || ''),
    click_paydoc_id: String(body.click_paydoc_id || ''),
    merchant_trans_id: String(body.merchant_trans_id || ''),
    merchant_prepare_id: String(body.merchant_prepare_id || ''),
    amount: String(body.amount || ''),
    action: String(body.action || ''),
    error: String(body.error ?? ''),
    error_note: String(body.error_note || ''),
    sign_time: String(body.sign_time || ''),
    sign_string: String(body.sign_string || ''),
  };
}

function safeEqualHex(a, b) {
  if (!/^[0-9a-f]{32}$/i.test(a) || !/^[0-9a-f]{32}$/i.test(b)) return false;
  const aa = Buffer.from(a.toLowerCase(), 'ascii');
  const bb = Buffer.from(b.toLowerCase(), 'ascii');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function validSignature(fields, complete) {
  const secret = String(process.env.CLICK_SECRET_KEY || '').trim();
  if (!secret) return false;
  const source = complete
    ? `${fields.click_trans_id}${fields.service_id}${secret}${fields.merchant_trans_id}${fields.merchant_prepare_id}${fields.amount}${fields.action}${fields.sign_time}`
    : `${fields.click_trans_id}${fields.service_id}${secret}${fields.merchant_trans_id}${fields.amount}${fields.action}${fields.sign_time}`;
  const expected = crypto.createHash('md5').update(source, 'utf8').digest('hex');
  return safeEqualHex(expected, fields.sign_string);
}

function integerAmount(value) {
  if (!/^\d+(?:\.0{1,2})?$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function positiveInteger(value) {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function send(res, body) {
  res.status(200);
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store, max-age=0');
  res.end(JSON.stringify(body));
}

function errorReply(res, fields, error, errorNote) {
  send(res, {
    click_trans_id: positiveInteger(fields.click_trans_id) || 0,
    merchant_trans_id: fields.merchant_trans_id || '',
    error,
    error_note: errorNote,
  });
}

function reasonError(reason) {
  if (reason === 'amount_mismatch') return [-2, 'Incorrect parameter amount'];
  if (reason === 'already_paid') return [-4, 'Already paid'];
  if (reason === 'order_not_found' || reason === 'expired') return [-5, 'Order not found'];
  if (reason === 'prepare_mismatch') return [-6, 'Transaction not found'];
  if (reason === 'cancelled') return [-9, 'Transaction cancelled'];
  if (reason === 'transaction_mismatch') return [-4, 'Transaction already exists'];
  return [-8, 'Error in request'];
}

async function sbRpc(fn, payload) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key || !process.env.VK_INGEST_SECRET) throw new Error('Supabase configuration missing');
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ p_secret: process.env.VK_INGEST_SECRET, ...payload }),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new Error(`Supabase RPC ${fn} failed: ${r.status}`);
  return data;
}

function serviceReady(fields, expectedAction, complete) {
  if (process.env.CLICK_ENABLED !== 'true') return [false, -8, 'Service unavailable'];
  const serviceId = String(process.env.CLICK_SERVICE_ID || '').trim();
  if (!serviceId || !process.env.CLICK_SECRET_KEY) return [false, -8, 'Service unavailable'];
  if (fields.service_id !== serviceId) return [false, -8, 'Incorrect service_id'];
  if (fields.action !== expectedAction) return [false, -3, 'Action not found'];
  if (!validSignature(fields, complete)) return [false, -1, 'SIGN CHECK FAILED!'];
  return [true, 0, 'Success'];
}

module.exports = {
  readFields,
  integerAmount,
  positiveInteger,
  send,
  errorReply,
  reasonError,
  sbRpc,
  serviceReady,
};
