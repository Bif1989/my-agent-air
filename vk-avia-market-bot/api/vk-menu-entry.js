const crypto = require('crypto');
const fastHandler = require('./vk-fast');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function normalizeCommand(text) {
  return String(text || '')
    .replace(/^\[club\d+\|@[^\]]+\]\s*/i, '')
    .trim()
    .toLowerCase();
}

function safePayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try { return JSON.parse(payload); } catch { return {}; }
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

function formatMoney(value) {
  return new Intl.NumberFormat('uz-UZ').format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  } catch {
    return '—';
  }
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

async function sbRpc(fn, payload) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error('Supabase configuration missing');

  const response = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Supabase RPC ${fn} failed: ${response.status}`);
  return data;
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
      { action: { type: 'callback', label: '👤 KABINET', payload: JSON.stringify({ cmd: 'cabinet' }) }, color: 'primary' },
      { action: { type: 'callback', label: '📊 Statistika', payload: JSON.stringify({ cmd: 'stats' }) }, color: 'secondary' },
    ],
    [
      { action: { type: 'callback', label: '🌐 Barcha takliflar', payload: JSON.stringify({ cmd: 'offers' }) }, color: 'secondary' },
      { action: { type: 'callback', label: '👥 Barcha so‘rovlar', payload: JSON.stringify({ cmd: 'searches' }) }, color: 'secondary' },
    ],
  ];

  if (CLEANUP_USER_ID > 0 && Number(userId) === CLEANUP_USER_ID) {
    buttons.push([
      { action: { type: 'callback', label: '📌 UMUMIY MENYUNI PIN QILISH', payload: JSON.stringify({ cmd: 'admin_pinmenu' }) }, color: 'positive' },
    ]);
    buttons.push([
      { action: { type: 'callback', label: '🧹 UMUMIY CHATNI TOZALASH', payload: JSON.stringify({ cmd: 'admin_cleanall' }) }, color: 'negative' },
    ]);
  }

  return { inline: true, buttons };
}

function inlineGroupMenu() {
  return {
    inline: true,
    buttons: [
      [
        { action: { type: 'callback', label: '➕ TAKLIF', payload: JSON.stringify({ cmd: 'new_offer' }) }, color: 'primary' },
        { action: { type: 'callback', label: '🔎 SO‘ROV', payload: JSON.stringify({ cmd: 'new_search' }) }, color: 'primary' },
      ],
      [
        { action: { type: 'callback', label: '🌐 TAKLIFLAR', payload: JSON.stringify({ cmd: 'offers' }) }, color: 'secondary' },
        { action: { type: 'callback', label: '👥 SO‘ROVLAR', payload: JSON.stringify({ cmd: 'searches' }) }, color: 'secondary' },
      ],
      [
        { action: { type: 'callback', label: '📦 MENING TAKLIFLARIM', payload: JSON.stringify({ cmd: 'my_offers' }) }, color: 'secondary' },
        { action: { type: 'callback', label: '📋 MENING SO‘ROVLARIM', payload: JSON.stringify({ cmd: 'my_searches' }) }, color: 'secondary' },
      ],
      [
        { action: { type: 'open_link', label: '🤖 SHAXSIY BOT / KABINET', link: BOT_OPEN_URL }, color: 'secondary' },
      ],
    ],
  };
}

async function sendPrivateMenu(userId) {
  const message = [
    '🤖 AVIA MARKET — SHAXSIY BOT',
    '',
    'Bu yerda shaxsiy amallar bajariladi.',
    '👤 Kabinetda tarif, obuna va balansingizni ko‘rasiz.',
    '🌐 Umumiy bozor uchun “UMUMIY CHATGA O‘TISH” tugmasini bosing.',
  ].join('\n');

  return vkApi('messages.send', {
    peer_id: userId,
    random_id: randomId(),
    message,
    disable_mentions: 1,
    keyboard: JSON.stringify(inlinePrivateMenu(userId)),
  });
}

async function sendCabinet(userId) {
  const data = await sbRpc('get_vk_cabinet_status', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_from_id: userId,
  });

  const plans = Array.isArray(data?.plans) ? data.plans : [];
  const currentCode = String(data?.current_plan || 'free');
  const currentPlan = plans.find((plan) => String(plan?.code || '') === currentCode);
  const planName = currentPlan?.name || currentCode;
  const activePaid = Boolean(data?.subscription_active);
  const balance = Number(data?.balance_amount || 0);
  const currency = String(data?.balance_currency || 'UZS');

  const message = [
    '👤 AVIA MARKET — KABINET',
    '',
    `🆔 VK ID: ${userId}`,
    `📦 Tarif: ${planName}`,
    `✅ Holat: ${activePaid ? 'Faol obuna' : currentCode === 'free' ? 'Bepul tarif' : 'Faol emas'}`,
    `📅 Obuna tugashi: ${activePaid ? formatDate(data?.subscription_ends_at) : '—'}`,
    `💰 Balans: ${formatMoney(balance)} ${currency}`,
    '',
    'Balans va obuna ma’lumotlari faqat sizning shaxsiy botingizda ko‘rinadi.',
  ].join('\n');

  await vkApi('messages.send', {
    peer_id: userId,
    random_id: randomId(),
    message,
    disable_mentions: 1,
    keyboard: JSON.stringify(inlinePrivateMenu(userId)),
  });
}

async function eventAnswer(eventObj, text) {
  if (!eventObj?.event_id || !eventObj?.user_id || !eventObj?.peer_id) return;
  try {
    await vkApi('messages.sendMessageEventAnswer', {
      event_id: eventObj.event_id,
      user_id: eventObj.user_id,
      peer_id: eventObj.peer_id,
      event_data: JSON.stringify({ type: 'show_snackbar', text: String(text).slice(0, 90) }),
    });
  } catch (error) {
    console.warn('menu_event_answer_failed', { code: error?.code || null });
  }
}

async function deleteIncomingCommand(peerId, cmid) {
  if (!cmid) return;
  try {
    await vkApi('messages.delete', {
      peer_id: peerId,
      cmids: cmid,
      delete_for_all: 1,
    });
  } catch (_) {}
}

async function pinSentMessage(peerId, sendResult) {
  const messageId = typeof sendResult === 'number'
    ? Number(sendResult)
    : Number(sendResult?.message_id || 0);
  const cmid = Number(sendResult?.conversation_message_id || 0);

  if (cmid) {
    try {
      await vkApi('messages.pin', { peer_id: peerId, cmid });
      return true;
    } catch (_) {}
  }

  if (messageId) {
    try {
      await vkApi('messages.pin', { peer_id: peerId, message_id: messageId });
      return true;
    } catch (_) {}
  }

  return false;
}

async function sendGroupMenu({ pin = false } = {}) {
  const message = [
    '🌐 AVIA MARKET — UMUMIY CHAT',
    '',
    'Bu chat — tartibli aviabilet bozori.',
    'Oddiy yozishmalar avtomatik o‘chiriladi.',
    'Taklif yoki so‘rovni quyidagi tugmalar orqali kiriting.',
    '',
    '👤 Kabinet, balans va shaxsiy ma’lumotlar — SHAXSIY BOTda.',
  ].join('\n');

  const sent = await vkApi('messages.send', {
    peer_id: PRIMARY_PEER_ID,
    random_id: randomId(),
    message,
    disable_mentions: 1,
    keyboard: JSON.stringify(inlineGroupMenu()),
  });

  const pinned = pin ? await pinSentMessage(PRIMARY_PEER_ID, sent) : false;
  return { sent: true, pinned };
}

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return fastHandler(req, res);

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID || !callbackSecretOk(event)) {
    return fastHandler(req, res);
  }

  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  const command = normalizeCommand(msg.text);

  const isPrivateMenuCommand = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId > 0 &&
    peerId === fromId &&
    ['/menu', '/start', '/help', 'menu'].includes(command)
  );

  const isPrivateCabinetCommand = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId > 0 &&
    peerId === fromId &&
    ['/cabinet', '/kabinet', 'cabinet', 'kabinet'].includes(command)
  );

  const isGroupMenuCommand = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId === PRIMARY_PEER_ID &&
    ['/menu', 'menu', '/pinmenu'].includes(command)
  );

  if (isPrivateMenuCommand) {
    try {
      await sendPrivateMenu(fromId);
    } catch (error) {
      console.error('private_inline_menu_failed', {
        code: error?.code || null,
        message: error?.message || String(error),
      });
    }
    return sendOk(res);
  }

  if (isPrivateCabinetCommand) {
    try {
      await sendCabinet(fromId);
    } catch (error) {
      console.error('cabinet_failed', {
        code: error?.code || null,
        message: error?.message || String(error),
      });
    }
    return sendOk(res);
  }

  if (isGroupMenuCommand) {
    const owner = CLEANUP_USER_ID > 0 && fromId === CLEANUP_USER_ID;
    try {
      const result = await sendGroupMenu({ pin: owner });
      if (owner) {
        await vkApi('messages.send', {
          peer_id: fromId,
          random_id: randomId(),
          message: result.pinned
            ? '📌 Umumiy chat menyusi yuborildi va pin qilindi.'
            : '⚠️ Menyu yuborildi, lekin VK uni avtomatik pin qila olmadi.',
          disable_mentions: 1,
        });
      }
    } catch (error) {
      console.error('group_menu_failed', {
        code: error?.code || null,
        message: error?.message || String(error),
      });
    }
    await deleteIncomingCommand(peerId, Number(msg.conversation_message_id || 0));
    return sendOk(res);
  }

  if (event.type === 'message_event') {
    const obj = event.object || {};
    const payload = safePayload(obj.payload);
    const cmd = String(payload.cmd || '');
    const userId = Number(obj.user_id || 0);

    if (cmd === 'cabinet' && userId > 0) {
      try {
        await sendCabinet(userId);
        await eventAnswer(obj, 'Kabinet shaxsiy chatga yuborildi');
      } catch (error) {
        console.error('cabinet_callback_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
        await eventAnswer(obj, 'Kabinetni ochishda xatolik');
      }
      return sendOk(res);
    }

    if (cmd === 'admin_pinmenu' && userId > 0) {
      if (!CLEANUP_USER_ID || userId !== CLEANUP_USER_ID) {
        await eventAnswer(obj, 'Bu amal faqat admin uchun');
        return sendOk(res);
      }

      try {
        const result = await sendGroupMenu({ pin: true });
        await eventAnswer(obj, result.pinned ? 'Menyu pin qilindi' : 'Menyu yuborildi, pin bo‘lmadi');
        await vkApi('messages.send', {
          peer_id: userId,
          random_id: randomId(),
          message: result.pinned
            ? '✅ 🌐 UMUMIY CHAT menyusi yangilandi va pin qilindi.'
            : '⚠️ Menyu umumiy chatga yuborildi, lekin VK avtomatik pin qilishga ruxsat bermadi.',
          disable_mentions: 1,
          keyboard: JSON.stringify(inlinePrivateMenu(userId)),
        });
      } catch (error) {
        console.error('admin_pinmenu_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
        await eventAnswer(obj, 'Menyuni pin qilishda xatolik');
      }
      return sendOk(res);
    }
  }

  return fastHandler(req, res);
};
