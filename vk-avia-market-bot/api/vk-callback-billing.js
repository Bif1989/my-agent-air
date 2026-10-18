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

function routeTextButton(event) {
  if (event?.type !== 'message_new') return event;
  const msg = event?.object?.message || {};
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  if (!msg?.payload || !userId || peerId !== userId || Number(msg?.out || 0) === 1) return event;

  // VK text buttons send a normal message_new event. Re-route only the
  // structured payload into the existing command dispatcher so no
  // sendMessageEventAnswer callback is required and no loading spinner remains.
  return {
    ...event,
    type: 'message_event',
    object: {
      user_id: userId,
      peer_id: peerId,
      payload: msg.payload,
      conversation_message_id: Number(msg?.conversation_message_id || 0) || null,
    },
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return legacyHandler(req, res);

  const event = req.body || {};
  if (event.type === 'confirmation') return legacyHandler(req, res);
  if (Number(event.group_id || 0) !== VK_GROUP_ID || !secretOk(event)) return legacyHandler(req, res);

  // VK Callback API itself must be acknowledged immediately.
  text(res, 200, 'ok');

  const task = (async () => {
    // Keep legacy callback buttons functional for old messages, but all new
    // menus use text+payload and therefore never depend on callback ACK.
    if (event.type === 'message_event') {
      await answerEvent(event.object || {}, '⏳ Bajarilmoqda...').catch(() => {});
    }
    await processBillingEvent(routeTextButton(event));
  })().catch((error) => {
    console.error('billing_event_processing_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  });

  try { waitUntil(task); } catch { task.catch(() => {}); }
};
