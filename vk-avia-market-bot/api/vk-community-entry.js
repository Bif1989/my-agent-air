const crypto = require('crypto');
const safeEntry = require('./vk-safe-entry');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
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

function groupMenu() {
  return {
    inline: true,
    buttons: [
      [
        { action: { type: 'open_link', label: '🤖 SHAXSIY CHAT / KABINET', link: BOT_OPEN_URL }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '➕ TAKLIF', payload: JSON.stringify({ cmd: 'new_offer' }) }, color: 'primary' },
        { action: { type: 'callback', label: '🔎 SO‘ROV', payload: JSON.stringify({ cmd: 'new_search' }) }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '🌐 TAKLIFLAR', payload: JSON.stringify({ cmd: 'offers' }) }, color: 'secondary' },
        { action: { type: 'callback', label: '👥 SO‘ROVLAR', payload: JSON.stringify({ cmd: 'searches' }) }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📊 STATISTIKA', payload: JSON.stringify({ cmd: 'stats' }) }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📦 MENING TAKLIFLARIM', payload: JSON.stringify({ cmd: 'my_offers' }) }, color: 'secondary' },
        { action: { type: 'callback', label: '📋 MENING SO‘ROVLARIM', payload: JSON.stringify({ cmd: 'my_searches' }) }, color: 'secondary' },
      ],
    ],
  };
}

async function sendGroupMenu() {
  const message = [
    '🌐 AVIA MARKET — UMUMIY CHAT',
    '',
    'Taklif va so‘rovlar uchun tugmalardan foydalaning.',
    'Oddiy yozishmalar strict rejimda avtomatik o‘chiriladi.',
    '',
    `🤖 SHAXSIY CHAT / KABINET: ${BOT_OPEN_URL}`,
    '',
    'Qisqa format namunalari:',
    'TASMOW25OCT ADT1 HK1 220USD',
    '25OCT TASMOW 2ADT',
    '',
    '➕ TAKLIF yoki 🔎 SO‘ROVni bossangiz, bot 4 xil yozish namunasini ko‘rsatadi.',
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

  const isCommunityMessage = event.type === 'message_reply';
  const msg = event.object?.message || (isCommunityMessage ? event.object : {});
  const peerId = Number(msg?.peer_id || 0);
  const command = normalizeCommand(msg?.text);
  const out = Number(msg?.out || 0);

  const communityMenuCommand = (
    peerId === PRIMARY_PEER_ID &&
    (isCommunityMessage || out === 1) &&
    ['/menu', 'menu', '/pinmenu'].includes(command)
  );

  if (!communityMenuCommand) return safeEntry(req, res);

  try {
    const sent = await sendGroupMenu();
    const shouldPin = command === '/pinmenu';
    const pinned = shouldPin ? await pinSentMessage(sent) : false;
    await deleteCommand(msg);
    console.log('community_menu_command_handled', {
      command,
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
