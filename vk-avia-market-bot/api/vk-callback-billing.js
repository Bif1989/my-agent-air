const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const legacyHandler = require('./vk-callback');
const { processBillingEvent } = require('../lib/billing');
const { answerEvent } = require('../lib/vk');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return legacyHandler(req, res);

  const event = req.body || {};
  if (event.type === 'confirmation') return legacyHandler(req, res);
  if (Number(event.group_id || 0) !== VK_GROUP_ID || !secretOk(event)) return legacyHandler(req, res);

  // VK expects the Callback API request itself to be acknowledged first.
  // Return "ok" immediately, then answer callback buttons before any
  // storage/list/billing work so the event_id is still fresh.
  text(res, 200, 'ok');

  const task = (async () => {
    if (event.type === 'message_event') {
      await answerEvent(event.object || {}, '⏳ Bajarilmoqda...').catch(() => {});
    }
    await processBillingEvent(event);
  })().catch((error) => {
    console.error('billing_event_processing_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  });

  try { waitUntil(task); } catch { task.catch(() => {}); }
};
