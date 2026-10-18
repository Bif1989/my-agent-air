const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const legacyHandler = require('./vk-callback');
const { processBillingEvent } = require('../lib/billing');
const { vkApi, deleteMessage } = require('../lib/vk');

const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();
const CALLBACK_URL = 'https://project-xj41n.vercel.app/api/vk-callback?v=4';
const CALLBACK_REPAIR_COOLDOWN_MS = 60_000;
let lastCallbackRepairAt = 0;

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

function keepAlive(task) {
  try { waitUntil(task); }
  catch { task.catch(() => {}); }
}

async function repairCallbackSecret() {
  const now = Date.now();
  if (now - lastCallbackRepairAt < CALLBACK_REPAIR_COOLDOWN_MS) return { skipped: true, reason: 'cooldown' };
  lastCallbackRepairAt = now;

  const callbackSecret = String(process.env.VK_SECRET || '');
  if (!callbackSecret) throw new Error('vk_secret_missing');

  const servers = await vkApi('groups.getCallbackServers', { group_id: VK_GROUP_ID });
  const items = Array.isArray(servers?.items) ? servers.items : [];
  const server = items.find((item) => String(item?.url || '').includes('/api/vk-callback')) || items[0];
  if (!server?.id) throw new Error('callback_server_missing');

  await vkApi('groups.editCallbackServer', {
    group_id: VK_GROUP_ID,
    server_id: Number(server.id),
    url: CALLBACK_URL,
    title: 'AviaMarket v4',
    secret_key: callbackSecret,
  });
  await vkApi('groups.setCallbackSettings', {
    group_id: VK_GROUP_ID,
    server_id: Number(server.id),
    api_version: process.env.VK_API_VERSION || '5.199',
    message_new: 1,
    message_event: 1,
    message_allow: 1,
    message_deny: 1,
  });

  return { repaired: true, server_id: Number(server.id) };
}

function legacyTextButtonMessage(event) {
  if (event?.type !== 'message_new') return null;
  const msg = event?.object?.message || {};
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  const conversationMessageId = Number(msg?.conversation_message_id || 0);
  if (!msg?.payload || !userId || peerId !== userId || Number(msg?.out || 0) === 1) return null;
  return { msg, userId, peerId, conversationMessageId };
}

function routeLegacyTextButton(event) {
  const button = legacyTextButtonMessage(event);
  if (!button) return event;

  // Old v2/v3 keyboards used type=text and therefore wrote the button label
  // into the dialog. Keep those already-sent keyboards functional by routing
  // their payload through the same action dispatcher as callback buttons.
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

async function hideLegacyTextButtonMessage(event) {
  const button = legacyTextButtonMessage(event);
  if (!button?.conversationMessageId) return false;
  try {
    return await deleteMessage(button.peerId, button.conversationMessageId);
  } catch (error) {
    console.warn('legacy_text_button_cleanup_failed', {
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
    console.warn('callback_secret_drift_detected', {
      type: event?.type || null,
      group_id: Number(event?.group_id || 0) || null,
    });
    text(res, 200, 'ok');
    keepAlive(
      repairCallbackSecret()
        .then((result) => console.info('callback_secret_repair_result', result))
        .catch((error) => console.error('callback_secret_repair_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        })),
    );
    return;
  }

  // Acknowledge the VK Callback HTTP request immediately. This is different
  // from messages.sendMessageEventAnswer: the latter is sent exactly once by
  // the action handler after it completes, so VK code 100 from duplicate event
  // answers cannot be produced by this wrapper.
  text(res, 200, 'ok');

  const task = (async () => {
    await hideLegacyTextButtonMessage(event);
    await processBillingEvent(routeLegacyTextButton(event));
  })().catch((error) => {
    console.error('billing_event_processing_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  });

  keepAlive(task);
};