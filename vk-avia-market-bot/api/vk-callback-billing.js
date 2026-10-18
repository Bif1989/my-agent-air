const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const legacyHandler = require('./vk-callback');
const { processBillingEvent } = require('../lib/billing');
const { answerEvent, deleteMessage } = require('../lib/vk');

const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function secretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH && sha256(event.secret) === CALLBACK_SECRET_HASH) return true;
  return Boolean(process.env.VK_SECRET && event.secret === process.env.VK_SECRET);
}

function text(res, status, value) {
  res.status(status).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(String(value));
}

function textButtonMessage(event) {
  if (event?.type !== 'message_new') return null;
  const msg = event?.object?.message || {};
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  const conversationMessageId = Number(msg?.conversation_message_id || 0);
  if (!msg?.payload || !userId || peerId !== userId || Number(msg?.out || 0) === 1) return null;
  return { msg, userId, peerId, conversationMessageId };
}

function routeTextButton(event) {
  const button = textButtonMessage(event);
  if (!button) return event;

  // VK text buttons send a normal message_new event. Re-route only the
  // structured payload into the existing command dispatcher so no
  // sendMessageEventAnswer callback is required and no loading spinner remains.
  return {
    ...event,
    type: 'message_event',
    object: {
      user_id: button.userId,
      peer_id: button.peerId,
      payload: button.msg.payload,
      conversation_message_id: button.conversationMessageId || null,
    },
  };
}

async function hideTextButtonMessage(event) {
  const button = textButtonMessage(event);
  if (!button?.conversationMessageId) return false;
  try {
    return await deleteMessage(button.peerId, button.conversationMessageId);
  } catch (error) {
    console.warn('text_button_cleanup_failed', {
      code: error?.code || null,
      peerId: button.peerId,
      cmid: button.conversationMessageId,
    });
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return legacyHandler(req, res);

  const event = req.body || {};
  if (event.type === 'confirmation') return legacyHandler(req, res);
  if (Number(event.group_id || 0) !== VK_GROUP_ID) return legacyHandler(req, res);
  if (!secretOk(event)) {
    console.warn('callback_secret_rejected', { type: event?.type || null, group_id: Number(event?.group_id || 0) || null });
    return legacyHandler(req, res);
  }

  // VK Callback API itself must be acknowledged immediately.
  text(res, 200, 'ok');

  const task = (async () => {
    // Keep legacy callback buttons functional for old messages, but all new
    // menus use text+payload and therefore never depend on callback ACK.
    if (event.type === 'message_event') {
      await answerEvent(event.object || {}, '⏳ Bajarilmoqda...').catch(() => {});
    }

    // Text buttons intentionally create message_new events. Hide only those
    // structured button-command messages so the private dialog stays clean.
    // Ordinary user text and listing content are never touched.
    await hideTextButtonMessage(event);
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