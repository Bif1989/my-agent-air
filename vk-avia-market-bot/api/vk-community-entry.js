const crypto = require('crypto');
const safeEntry = require('./vk-safe-entry');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function callbackSecretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH && sha256(event.secret) === CALLBACK_SECRET_HASH) return true;
  if (process.env.VK_SECRET && event.secret === process.env.VK_SECRET) return true;
  return false;
}

function normalizeCommand(text) {
  return String(text || '')
    .replace(/^\[club\d+\|@[^\]]+\]\s*/i, '')
    .trim()
    .toLowerCase();
}

function safePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function randomId() {
  return Math.floor(Math.random() * 2147483647);
}

async function vkApi(method, params = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries({
    ...params,
    access_token: process.env.VK_TOKEN,
    v: VK_API_VERSION,
  })) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }

  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    const error = new Error(data?.error?.error_msg || `HTTP ${response.status}`);
    error.code = data?.error?.error_code || response.status;
    throw error;
  }
  return data?.response;
}

function payload(cmd) {
  return JSON.stringify({ cmd, v: 2 });
}

function groupMenu() {
  return {
    inline: true,
    buttons: [
      [
        { action: { type: 'open_link', label: '🤖 SHAXSIY CHAT / KABINET', link: BOT_OPEN_URL } },
      ],
      [
        { action: { type: 'callback', label: '➕ TAKLIF', payload: payload('new_offer') }, color: 'primary' },
        { action: { type: 'callback', label: '🔎 SO‘ROV', payload: payload('new_search') }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '🌐 TAKLIFLAR', payload: payload('offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '👥 SO‘ROVLAR', payload: payload('searches') }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📊 STATISTIKA', payload: payload('stats') }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📦 MENING TAKLIFLARIM', payload: payload('my_offers') }, color: 'secondary' },
        { action: { type: 'callback', label: '📋 MENING SO‘ROVLARIM', payload: payload('my_searches') }, color: 'secondary' },
      ],
    ],
  };
}

async function sendGroupMenu() {
  const message = [
    '🌐 AVIA MARKET — UMUMIY CHAT',
    '',
    `🤖 SHAXSIY CHAT / KABINET: ${BOT_OPEN_URL}`,
    '',
    '➕ TAKLIF yoki 🔎 SO‘ROV tugmasini bosing.',
    'Bot turli aviakassa/GDS yozuvlarini qabul qiladi.',
    '',
    'Namuna formatlar:',
    '1) TASMOW25OCT ADT1 HK1 220USD',
    '2) 25OCT TASMOW HY601 HK2 220$ BAG20',
    '3) TAS-MOW 25OCT 2ADT Y HK2 20KG 230USD',
    '4) TAS MOW 25.10 ADT1 CHD1 HK2 450USD',
    '',
    '📊 Statistika va shaxsiy ro‘yxatlar ham shu menyuda.',
  ].join('\n');

  return vkApi('messages.send', {
    peer_id: PRIMARY_PEER_ID,
    random_id: randomId(),
    message,
    disable_mentions: 1,
    keyboard: JSON.stringify(groupMenu()),
  });
}

async function pinSentMessage(sendResult) {
  const messageId = typeof sendResult === 'number'
    ? Number(sendResult)
    : Number(sendResult?.message_id || 0);
  const conversationMessageId = Number(sendResult?.conversation_message_id || 0);

  if (conversationMessageId) {
    try {
      await vkApi('messages.pin', {
        peer_id: PRIMARY_PEER_ID,
        conversation_message_id: conversationMessageId,
      });
      return true;
    } catch (error) {
      console.warn('community_pin_by_cmid_failed', { code: error?.code || null });
    }
  }

  if (messageId) {
    try {
      await vkApi('messages.pin', {
        peer_id: PRIMARY_PEER_ID,
        message_id: messageId,
      });
      return true;
    } catch (error) {
      console.warn('community_pin_by_message_id_failed', { code: error?.code || null });
    }
  }

  return false;
}

async function deleteCommand(msg) {
  const cmid = Number(msg?.conversation_message_id || 0);
  if (!cmid) return false;
  try {
    await vkApi('messages.delete', {
      peer_id: PRIMARY_PEER_ID,
      cmids: cmid,
      delete_for_all: 1,
    });
    return true;
  } catch (error) {
    console.warn('community_command_delete_failed', { code: error?.code || null });
    return false;
  }
}

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return safeEntry(req, res);

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID || !callbackSecretOk(event)) {
    return safeEntry(req, res);
  }

  if (event.type === 'message_event') {
    const object = event.object || {};
    const peerId = Number(object.peer_id || 0);
    const eventPayload = safePayload(object.payload);
    const version = Number(eventPayload.v || 0);

    if (peerId === PRIMARY_PEER_ID && version < 2) {
      try {
        await sendGroupMenu();
        console.log('legacy_group_menu_refreshed', { cmd: eventPayload.cmd || null });
      } catch (error) {
        console.error('legacy_group_menu_refresh_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
      }
      return sendOk(res);
    }

    return safeEntry(req, res);
  }

  const isMessageEvent = event.type === 'message_new' || event.type === 'message_reply';
  const msg = event.object?.message || event.object || {};
  const peerId = Number(msg?.peer_id || 0);
  const fromId = Number(msg?.from_id || 0);
  const command = normalizeCommand(msg?.text);
  const out = Number(msg?.out || 0);

  const menuCommand = (
    isMessageEvent &&
    peerId === PRIMARY_PEER_ID &&
    ['/menu', 'menu', '/pinmenu'].includes(command)
  );

  if (!menuCommand) return safeEntry(req, res);

  const sentByCommunity = event.type === 'message_reply' || out === 1 || fromId === -VK_GROUP_ID;
  const owner = CLEANUP_USER_ID > 0 && fromId === CLEANUP_USER_ID;
  const shouldPin = command === '/pinmenu' && (owner || sentByCommunity);

  try {
    const sent = await sendGroupMenu();
    const pinned = shouldPin ? await pinSentMessage(sent) : false;
    await deleteCommand(msg);
    console.log('community_menu_command_handled', {
      eventType: event.type,
      command,
      fromCommunity: sentByCommunity,
      pinRequested: command === '/pinmenu',
      pinned: shouldPin ? pinned : null,
    });
  } catch (error) {
    console.error('community_menu_command_failed', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }

  return sendOk(res);
};
