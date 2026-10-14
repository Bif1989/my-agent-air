const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const { processEvent } = require('../lib/market');

const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function secretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH) return sha256(event.secret) === CALLBACK_SECRET_HASH;
  return Boolean(process.env.VK_SECRET && event.secret === process.env.VK_SECRET);
}

function text(res, status, value) {
  res.status(status).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(String(value));
}

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: '2.0.0-zero-db',
      architecture: 'vk-history-source-of-truth',
      fast_ack: true,
      group_configured: VK_GROUP_ID > 0,
      security: CALLBACK_SECRET_HASH ? 'sha256' : 'legacy-secret',
    });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID) return text(res, 200, 'ok');
  if (event.type === 'confirmation') return text(res, 200, process.env.VK_CONFIRMATION_STRING || '');
  if (!secretOk(event)) return json(res, 403, { ok: false, error: 'forbidden' });

  text(res, 200, 'ok');
  waitUntil(Promise.resolve(processEvent(event)).catch((error) => {
    console.error('event_processing_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }));
};
