const crypto = require('crypto');
const fastHandler = require('./vk-fast');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function normalizeCommand(text) {
  return String(text || '')
    .replace(/^\[club\d+\|@[^\]]+\]\s*/i, '')
    .trim()
    .toLowerCase();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function callbackSecretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH && sha256(event.secret) === CALLBACK_SECRET_HASH) return true;
  if (process.env.VK_SECRET && event.secret === process.env.VK_SECRET) return true;
  return false;
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

function inlinePrivateMenu(userId) {
  const buttons = [
    [
      { action: { type: 'callback', label: '🌐 UMUMIY CHATGA O‘TISH', payload: JSON.stringify({ cmd: 'open_market_chat' }) }, color: 'primary' },
    ],
    [
      { action: { type: 'callback', label: '➕ Taklif berish', payload: JSON.stringify({ cmd: 'new_offer' }) }, color: 'primary' },
      { action: { type: 'callback', label: '🔎 So‘rov berish', payload: JSON.stringify({ cmd: 'new_search' }) }, color: 'primary' },
    ],
    [
      { action: { type: 'callback', label: '📦 Mening takliflarim', payload: JSON.stringify({ cmd: 'my_offers' }) }, color: 'secondary' },
      { action: { type: 'callback', label: '📋 Mening so‘rovlarim', payload: JSON.stringify({ cmd: 'my_searches' }) }, color: 'secondary' },
    ],
    [
      { action: { type: 'callback', label: '🌐 Barcha takliflar', payload: JSON.stringify({ cmd: 'offers' }) }, color: 'secondary' },
      { action: { type: 'callback', label: '👥 Barcha so‘rovlar', payload: JSON.stringify({ cmd: 'searches' }) }, color: 'secondary' },
    ],
    [
      { action: { type: 'callback', label: '📊 Statistika', payload: JSON.stringify({ cmd: 'stats' }) }, color: 'secondary' },
    ],
  ];

  if (CLEANUP_USER_ID > 0 && Number(userId) === CLEANUP_USER_ID) {
    buttons.push([
      { action: { type: 'callback', label: '🧹 UMUMIY CHATNI TOZALASH', payload: JSON.stringify({ cmd: 'admin_cleanall' }) }, color: 'negative' },
    ]);
  }

  return { inline: true, buttons };
}

async function sendPrivateMenu(userId) {
  const message = [
    '🤖 AVIA MARKET — SHAXSIY BOT',
    '',
    'Bu yerda shaxsiy amallar bajariladi.',
    'Umumiy bozor uchun yuqoridagi “UMUMIY CHATGA O‘TISH” tugmasini bosing.',
  ].join('\n');

  return vkApi('messages.send', {
    peer_id: userId,
    random_id: randomId(),
    message,
    disable_mentions: 1,
    keyboard: JSON.stringify(inlinePrivateMenu(userId)),
  });
}

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fastHandler(req, res);

  const event = req.body || {};
  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  const command = normalizeCommand(msg.text);
  const isPrivateMenuCommand = (
    event.type === 'message_new' &&
    Number(event.group_id || 0) === VK_GROUP_ID &&
    Number(msg.out || 0) !== 1 &&
    peerId > 0 &&
    peerId === fromId &&
    ['/menu', '/start', '/help', 'menu'].includes(command)
  );

  if (!isPrivateMenuCommand || !callbackSecretOk(event)) {
    return fastHandler(req, res);
  }

  try {
    await sendPrivateMenu(fromId);
  } catch (error) {
    console.error('private_inline_menu_failed', {
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }

  return sendOk(res);
};
