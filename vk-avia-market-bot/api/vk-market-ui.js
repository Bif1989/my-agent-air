const crypto = require('crypto');
const menuEntry = require('./vk-menu-entry');

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

async function setSession(userId, mode) {
  return sbRpc('set_vk_market_session', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_user_id: userId,
    p_mode: mode,
  });
}

async function getStats(userId) {
  return sbRpc('get_vk_aviation_menu_data_v2', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_action: 'stats',
    p_limit: 5,
    p_from_id: userId || null,
  });
}

async function sendMessage(peerId, message, keyboard) {
  const params = {
    peer_id: peerId,
    random_id: randomId(),
    message,
    disable_mentions: 1,
  };
  if (keyboard) params.keyboard = JSON.stringify(keyboard);
  return vkApi('messages.send', params);
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
    console.warn('market_ui_event_answer_failed', { code: error?.code || null });
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

function enhancedGroupMenu() {
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

function entryExamples(mode, inGroup) {
  const isOffer = mode === 'offer';
  const destination = inGroup
    ? '👉 Endi UMUMIY CHATga qaytib, taklif/so‘rovni BITTA xabarda yozing.'
    : '👉 Endi shu SHAXSIY CHATga BITTA xabarda yozing.';

  const examples = isOffer
    ? [
        '1) TASMOW25OCT ADT1 HK1 220USD',
        '2) 25OCT TASMOW HY601 HK2 220$ BAG20',
        '3) TAS-MOW 25OCT 2ADT Y HK2 20KG 230USD',
        '4) TAS MOW 25.10 ADT1 CHD1 HK2 450USD',
      ]
    : [
        '1) TASMOW25OCT ADT1',
        '2) 25OCT TASMOW 2ADT',
        '3) TAS-MOW 25OCT ADT2 CHD1',
        '4) TAS MOW 25.10 ADT1 INF1 BAG20',
      ];

  return [
    isOffer ? '✈️ TAKLIF KIRITISH' : '🔎 SO‘ROV KIRITISH',
    '',
    'Formatni erkin yozishingiz mumkin. Bot bo‘shliqli/bo‘shliqsiz va sana oldinda/orqada yozilgan variantlarni qabul qiladi.',
    '',
    'NAMUNALAR:',
    ...examples,
    '',
    destination,
  ].join('\n');
}

async function startEntryWithExamples(eventObj, mode) {
  const userId = Number(eventObj?.user_id || 0);
  const peerId = Number(eventObj?.peer_id || 0);
  if (!userId) return;

  await setSession(userId, mode);
  const inGroup = peerId === PRIMARY_PEER_ID;
  const text = entryExamples(mode, inGroup);

  try {
    await sendMessage(userId, text);
    await eventAnswer(
      eventObj,
      inGroup
        ? '4 ta namuna shaxsiy chatga yuborildi. Endi umumiy chatga yozing.'
        : '4 ta namuna yuborildi. Endi xabaringizni yozing.'
    );
  } catch (error) {
    if (inGroup) {
      try {
        await sendMessage(PRIMARY_PEER_ID, `👤 [id${userId}|Siz uchun namuna]\n\n${text}`);
      } catch (_) {}
    }
    await eventAnswer(eventObj, 'Rejim yoqildi. Taklif/so‘rovni bitta xabarda yozing.');
  }
}

async function sendGroupStats(userId) {
  const data = await getStats(userId);
  const stats = data?.stats || {};
  const text = [
    '📊 AVIA MARKET — UMUMIY STATISTIKA',
    '',
    `✈️ Faol takliflar: ${Number(stats.offers || 0)}`,
    `🔎 Faol so‘rovlar: ${Number(stats.searches || 0)}`,
    `🕒 So‘nggi 24 soatdagi e’lonlar: ${Number(stats.last_24h || 0)}`,
  ].join('\n');
  await sendMessage(PRIMARY_PEER_ID, text, enhancedGroupMenu());
}

async function sendEnhancedGroupMenu({ pin = false } = {}) {
  const message = [
    '🌐 AVIA MARKET — UMUMIY CHAT',
    '',
    'Taklif va so‘rovlar uchun tugmalardan foydalaning.',
    'Oddiy yozishmalar strict rejimda avtomatik o‘chiriladi.',
    '',
    `🤖 SHAXSIY CHAT / KABINET: ${BOT_OPEN_URL}`,
    '',
    'Qisqa format namunasi:',
    'TASMOW25OCT ADT1 HK1 220USD',
    '25OCT TASMOW 2ADT',
    '',
    '➕ TAKLIF yoki 🔎 SO‘ROVni bossangiz, bot 4 xil yozish namunasini ko‘rsatadi.',
  ].join('\n');

  const sent = await sendMessage(PRIMARY_PEER_ID, message, enhancedGroupMenu());
  const pinned = pin ? await pinSentMessage(PRIMARY_PEER_ID, sent) : false;
  return { sent: true, pinned };
}

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return menuEntry(req, res);

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID || !callbackSecretOk(event)) {
    return menuEntry(req, res);
  }

  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  const command = normalizeCommand(msg.text);

  const isGroupMenuCommand = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId === PRIMARY_PEER_ID &&
    ['/menu', 'menu', '/pinmenu'].includes(command)
  );

  if (isGroupMenuCommand) {
    const owner = CLEANUP_USER_ID > 0 && fromId === CLEANUP_USER_ID;
    try {
      const result = await sendEnhancedGroupMenu({ pin: owner });
      if (owner) {
        await sendMessage(
          fromId,
          result.pinned
            ? '✅ Yangi umumiy menyu yuborildi va pin qilindi.'
            : '⚠️ Yangi menyu yuborildi, lekin VK avtomatik pin qila olmadi.'
        );
      }
    } catch (error) {
      console.error('enhanced_group_menu_failed', {
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
    const eventPeerId = Number(obj.peer_id || 0);

    if ((cmd === 'new_offer' || cmd === 'new_search') && userId > 0) {
      try {
        await startEntryWithExamples(obj, cmd === 'new_offer' ? 'offer' : 'search');
      } catch (error) {
        console.error('entry_examples_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
        await eventAnswer(obj, 'Rejimni yoqishda xatolik. Qayta urinib ko‘ring.');
      }
      return sendOk(res);
    }

    if (cmd === 'stats' && userId > 0 && eventPeerId === PRIMARY_PEER_ID) {
      try {
        await sendGroupStats(userId);
        await eventAnswer(obj, 'Umumiy statistika chatga chiqarildi');
      } catch (error) {
        console.error('group_stats_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
        await eventAnswer(obj, 'Statistikani olishda xatolik');
      }
      return sendOk(res);
    }

    if (cmd === 'admin_pinmenu' && userId > 0) {
      if (!CLEANUP_USER_ID || userId !== CLEANUP_USER_ID) {
        await eventAnswer(obj, 'Bu amal faqat admin uchun');
        return sendOk(res);
      }

      try {
        const result = await sendEnhancedGroupMenu({ pin: true });
        await eventAnswer(obj, result.pinned ? 'Yangi menyu pin qilindi' : 'Menyu yuborildi, pin bo‘lmadi');
        await sendMessage(
          userId,
          result.pinned
            ? '✅ Yangi 🌐 UMUMIY CHAT menyusi statistika va shaxsiy-chat tugmasi bilan pin qilindi.'
            : '⚠️ Yangi menyu yuborildi, lekin VK avtomatik pin qilishga ruxsat bermadi.'
        );
      } catch (error) {
        console.error('enhanced_admin_pinmenu_failed', {
          code: error?.code || null,
          message: error?.message || String(error),
        });
        await eventAnswer(obj, 'Menyuni pin qilishda xatolik');
      }
      return sendOk(res);
    }
  }

  return menuEntry(req, res);
};
