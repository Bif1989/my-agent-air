const crypto = require('crypto');
const marketUi = require('./vk-market-ui');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
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

function safePayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try { return JSON.parse(payload); } catch { return {}; }
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

async function getMarketChatLink() {
  try {
    const result = await vkApi('messages.getInviteLink', {
      peer_id: PRIMARY_PEER_ID,
      reset: 0,
    });
    if (result?.link) return result.link;
  } catch (error) {
    console.warn('safe_entry_chat_invite_link_failed', { code: error?.code || null });
  }

  const chatId = PRIMARY_PEER_ID - 2000000000;
  return `https://vk.ru/im?sel=c${chatId > 0 ? chatId : 1}`;
}

async function sendPrivateChatLink(userId) {
  const link = await getMarketChatLink();
  await vkApi('messages.send', {
    peer_id: userId,
    random_id: randomId(),
    message: `🌐 AVIA MARKET — UMUMIY CHAT\n\n👉 ${link}\n\nBu havola umumiy chatga olib o‘tadi.`,
    disable_mentions: 1,
  });
}

async function answerEvent(obj, text) {
  if (!obj?.event_id || !obj?.user_id || !obj?.peer_id) return;
  try {
    await vkApi('messages.sendMessageEventAnswer', {
      event_id: obj.event_id,
      user_id: obj.user_id,
      peer_id: obj.peer_id,
      event_data: JSON.stringify({ type: 'show_snackbar', text: String(text).slice(0, 90) }),
    });
  } catch (error) {
    console.warn('safe_entry_event_answer_failed', { code: error?.code || null });
  }
}

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

module.exports = async function handler(req, res) {
  // Callback health checks are read-only. Never rename/mutate the VK chat here.
  if (req.method === 'GET') {
    res.status(200).setHeader('content-type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'safe-entry-v1',
      primary_peer_id: PRIMARY_PEER_ID,
      strict_market_chat: process.env.VK_STRICT_MARKET_CHAT !== 'false',
    }));
  }

  if (req.method !== 'POST') return marketUi(req, res);

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID || !callbackSecretOk(event)) {
    return marketUi(req, res);
  }

  if (event.type === 'message_event') {
    const obj = event.object || {};
    const payload = safePayload(obj.payload);
    const cmd = String(payload.cmd || '');
    const userId = Number(obj.user_id || 0);

    if (cmd === 'open_market_chat' && userId > 0) {
      try {
        await sendPrivateChatLink(userId);
        await answerEvent(obj, 'Umumiy chat havolasi yuborildi');
      } catch (error) {
        console.error('safe_entry_open_market_chat_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
        await answerEvent(obj, 'Umumiy chat havolasini yuborishda xatolik');
      }
      return sendOk(res);
    }
  }

  return marketUi(req, res);
};
