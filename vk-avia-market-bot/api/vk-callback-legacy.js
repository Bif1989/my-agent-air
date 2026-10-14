const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const STRICT_MARKET_CHAT = process.env.VK_STRICT_MARKET_CHAT !== 'false';
const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';
const COMMON_CHAT_TITLE = '✈️ AVIA MARKET — UMUMIY CHAT';

const REQUIRED = ['VK_TOKEN', 'VK_SECRET', 'VK_CONFIRMATION_STRING', 'SUPABASE_URL', 'VK_INGEST_SECRET'];

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

function safePayload(payload) {
  if (!payload) return {};
  if (typeof payload === 'object') return payload;
  try { return JSON.parse(payload); } catch { return {}; }
}

function randomId() {
  return Math.floor(Math.random() * 2147483647);
}

function fmtTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(value));
  } catch { return ''; }
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
    const code = data?.error?.error_code || response.status;
    const message = data?.error?.error_msg || `HTTP ${response.status}`;
    const error = new Error(`VK ${method} failed: ${code} ${message}`);
    error.code = code;
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

async function getMenuData(action, userId, limit = 5) {
  return sbRpc('get_vk_aviation_menu_data_v2', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_action: action,
    p_limit: limit,
    p_from_id: userId || null,
  });
}

async function setSession(userId, mode) {
  return sbRpc('set_vk_market_session', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_user_id: userId,
    p_mode: mode,
  });
}

async function getSession(userId) {
  return sbRpc('get_vk_market_session', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_user_id: userId,
  });
}

async function clearSession(userId) {
  return sbRpc('clear_vk_market_session', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_user_id: userId,
  });
}

async function createListing(userId, kind, text) {
  return sbRpc('create_vk_market_listing', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_from_id: userId,
    p_kind: kind,
    p_text: text,
    p_peer_id: PRIMARY_PEER_ID,
  });
}

function privateMenuFor(userId) {
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

  return { one_time: false, inline: false, buttons };
}

const groupMenu = {
  one_time: false,
  inline: true,
  buttons: [
    [
      { action: { type: 'callback', label: '➕ Taklif', payload: JSON.stringify({ cmd: 'new_offer' }) }, color: 'primary' },
      { action: { type: 'callback', label: '🔎 So‘rov', payload: JSON.stringify({ cmd: 'new_search' }) }, color: 'primary' },
    ],
    [
      { action: { type: 'callback', label: '🌐 Takliflar', payload: JSON.stringify({ cmd: 'offers' }) }, color: 'secondary' },
      { action: { type: 'callback', label: '👥 So‘rovlar', payload: JSON.stringify({ cmd: 'searches' }) }, color: 'secondary' },
    ],
    [
      { action: { type: 'callback', label: '📦 Mening takliflarim', payload: JSON.stringify({ cmd: 'my_offers' }) }, color: 'secondary' },
      { action: { type: 'callback', label: '📋 Mening so‘rovlarim', payload: JSON.stringify({ cmd: 'my_searches' }) }, color: 'secondary' },
    ],
    [
      { action: { type: 'open_link', label: '🤖 SHAXSIY BOT', link: BOT_OPEN_URL }, color: 'secondary' },
    ],
  ],
};

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

async function deleteChatMessage(peerId, cmid) {
  if (!cmid) return false;
  try {
    await vkApi('messages.delete', {
      peer_id: peerId,
      cmids: cmid,
      delete_for_all: 1,
    });
    return true;
  } catch (error) {
    console.warn('delete_failed', { peerId, cmid, code: error.code || null });
    return false;
  }
}

async function eventAnswer(event, text) {
  if (!event?.event_id || !event?.user_id || !event?.peer_id) return;
  try {
    await vkApi('messages.sendMessageEventAnswer', {
      event_id: event.event_id,
      user_id: event.user_id,
      peer_id: event.peer_id,
      event_data: JSON.stringify({ type: 'show_snackbar', text: String(text).slice(0, 90) }),
    });
  } catch (error) {
    console.warn('event_answer_failed', { code: error.code || null });
  }
}

async function ensureMarketChatTitle() {
  const chatId = PRIMARY_PEER_ID - 2000000000;
  if (chatId <= 0) return false;
  try {
    await vkApi('messages.editChat', { chat_id: chatId, title: COMMON_CHAT_TITLE });
    return true;
  } catch (error) {
    console.warn('chat_title_update_failed', { code: error.code || null });
    return false;
  }
}

async function getMarketChatLink() {
  try {
    const result = await vkApi('messages.getInviteLink', {
      peer_id: PRIMARY_PEER_ID,
      reset: 0,
    });
    if (result?.link) return result.link;
  } catch (error) {
    console.warn('chat_invite_link_failed', { code: error.code || null });
  }

  const chatId = PRIMARY_PEER_ID - 2000000000;
  return `https://vk.ru/im?sel=c${chatId > 0 ? chatId : 1}`;
}

async function userNames(ids) {
  const unique = [...new Set(ids.filter((id) => Number(id) > 0))].slice(0, 100);
  if (!unique.length) return new Map();
  try {
    const users = await vkApi('users.get', { user_ids: unique.join(',') });
    return new Map((users || []).map((user) => [Number(user.id), `${user.first_name || ''} ${user.last_name || ''}`.trim()]));
  } catch {
    return new Map();
  }
}

function formatItems(title, items, names) {
  if (!items?.length) return `${title}\n\nHozircha ma’lumot yo‘q.`;
  const blocks = items.map((item, index) => {
    const userId = Number(item.from_id || 0);
    const name = names.get(userId) || (userId ? `ID ${userId}` : 'Agent');
    const who = userId ? `[id${userId}|${name}]` : name;
    const icon = item.message_kind === 'search' ? '🔎' : (item.message_kind === 'sold' ? '🔴' : '✈️');
    const when = fmtTime(item.sent_at || item.sort_at);
    return `${index + 1}. ${icon} ${who}${when ? `\n🕒 ${when}` : ''}\n${String(item.text || '').trim()}`;
  });
  return `${title}\n\n${blocks.join('\n\n────────\n\n')}`.slice(0, 3900);
}

async function sendListToUser(userId, action) {
  const data = await getMenuData(action, userId, 5);
  const items = data?.items || [];
  const names = await userNames(items.map((item) => item.from_id));
  const titles = {
    offers: '🌐 Barcha takliflar',
    searches: '👥 Barcha so‘rovlar',
    my_offers: '📦 Mening takliflarim',
    my_searches: '📋 Mening so‘rovlarim',
  };
  await sendMessage(userId, formatItems(titles[action] || 'Avia Market', items, names), privateMenuFor(userId));
}

async function sendStatsToUser(userId) {
  const data = await getMenuData('stats', userId, 5);
  const stats = data?.stats || {};
  const text = [
    '📊 Avia Market statistikasi',
    '',
    `✈️ Faol takliflar: ${Number(stats.offers || 0)}`,
    `🔎 Faol so‘rovlar: ${Number(stats.searches || 0)}`,
    `🕒 So‘nggi 24 soat: ${Number(stats.last_24h || 0)}`,
    `📦 Mening takliflarim: ${Number(stats.my_offers || 0)}`,
    `📋 Mening so‘rovlarim: ${Number(stats.my_searches || 0)}`,
  ].join('\n');
  await sendMessage(userId, text, privateMenuFor(userId));
}

async function startEntry(userId, mode) {
  await setSession(userId, mode);
  const isOffer = mode === 'offer';
  const text = isOffer
    ? '✈️ Taklifingizni bitta xabarda yozing.\n\nMasalan:\nTAS–MOW 20 oktabr HY 4 ta joy bor, 220$\n\nYuborilgach, taklif 🌐 UMUMIY CHATga joylashtiriladi.'
    : '🔎 So‘rovingizni bitta xabarda yozing.\n\nMasalan:\nTAS–MOW 20 oktabrga 3 ta joy kerak\n\nYuborilgach, so‘rov 🌐 UMUMIY CHATga joylashtiriladi.';
  await sendMessage(userId, text, privateMenuFor(userId));
}

async function publishListing(userId, kind, text) {
  const names = await userNames([userId]);
  const name = names.get(userId) || `ID ${userId}`;
  const header = kind === 'offer' ? '✈️ TAKLIF' : '🔎 SO‘ROV';
  const body = `${header}\n👤 [id${userId}|${name}]\n🕒 ${fmtTime(new Date().toISOString())}\n\n${text}\n\n#AviaMarket`;
  await sendMessage(PRIMARY_PEER_ID, body);
}

async function sendPrivateHome(userId) {
  const text = [
    '🤖 AVIA MARKET — SHAXSIY BOT',
    '',
    'Bu chat faqat siz va bot o‘rtasidagi shaxsiy ishlar uchun.',
    'Taklif/so‘rov yuborishingiz, o‘zingizning e’lonlaringiz va statistikani ko‘rishingiz mumkin.',
    '',
    '🌐 Barcha agentlar ko‘radigan bozor esa alohida — UMUMIY CHAT.',
  ].join('\n');
  await sendMessage(userId, text, privateMenuFor(userId));
}

async function sendMarketChatLink(userId) {
  await ensureMarketChatTitle();
  const link = await getMarketChatLink();
  await sendMessage(
    userId,
    `🌐 AVIA MARKET — UMUMIY CHAT\n\nBu barcha agentlar ko‘radigan umumiy bozor chati.\n\n👉 ${link}`,
    privateMenuFor(userId),
  );
}

function chunks(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

async function cleanPrimaryChat(userId) {
  if (!CLEANUP_USER_ID || Number(userId) !== CLEANUP_USER_ID) {
    await sendMessage(userId, '⛔ Bu amal faqat admin uchun.');
    return;
  }

  try { await clearSession(userId); } catch (_) {}

  let found = 0;
  let deleted = 0;
  let failed = 0;
  try {
    const history = await vkApi('messages.getHistory', {
      peer_id: PRIMARY_PEER_ID,
      count: 200,
      rev: 0,
    });
    const cmids = [...new Set((Array.isArray(history?.items) ? history.items : [])
      .map((item) => Number(item?.conversation_message_id || 0))
      .filter(Boolean))];
    found = cmids.length;

    for (const batch of chunks(cmids, 50)) {
      try {
        await vkApi('messages.delete', {
          peer_id: PRIMARY_PEER_ID,
          cmids: batch.join(','),
          delete_for_all: 1,
        });
        deleted += batch.length;
      } catch {
        failed += batch.length;
      }
    }
  } catch (error) {
    await sendMessage(userId, `❌ Tozalashda xato: ${error.code || 'VK API'}`, privateMenuFor(userId));
    return;
  }

  await sendMessage(
    userId,
    `🧹 UMUMIY CHAT tozalash yakunlandi.\n\nTopildi: ${found}\n✅ O‘chirildi: ${deleted}${failed ? `\n⚠️ O‘chmagan: ${failed}` : ''}`,
    privateMenuFor(userId),
  );
}

async function handlePrivateText(msg) {
  const userId = Number(msg.from_id || 0);
  const text = String(msg.text || '').trim();
  if (!userId) return;

  const normalized = text.toLowerCase().replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim();

  if (normalized === '/cleanall') {
    await cleanPrimaryChat(userId);
    return;
  }

  if (/^\/(start|menu|help)\b/.test(normalized) || !text) {
    await sendPrivateHome(userId);
    return;
  }

  const session = await getSession(userId);
  if (!session?.active) {
    await sendMessage(
      userId,
      '🤖 AVIA MARKET — SHAXSIY BOT\n\nHozir siz SHAXSIY BOTdasiz. Taklif yoki so‘rov kiritish uchun tugmalardan foydalaning.\n\n🌐 Umumiy bozor chatiga o‘tish uchun yuqoridagi “UMUMIY CHATGA O‘TISH” tugmasini bosing.',
      privateMenuFor(userId),
    );
    return;
  }

  const kind = session.mode === 'search' ? 'search' : 'offer';
  const result = await createListing(userId, kind, text);

  if (result?.duplicate) {
    const noun = kind === 'offer' ? 'taklif' : 'so‘rov';
    await setSession(userId, kind);
    await sendMessage(
      userId,
      `⚠️ Bu ${noun}ni bugun allaqachon joylashtirgansiz.\n\nBugun boshqa ${noun} kiritishingiz mumkin, yoki shu ${noun}ni ertaga qayta joylashtirishingiz mumkin.`,
      privateMenuFor(userId),
    );
    return;
  }

  if (!result?.stored) {
    await sendMessage(userId, '⚠️ Ma’lumotni saqlab bo‘lmadi. Qayta urinib ko‘ring.', privateMenuFor(userId));
    return;
  }

  try { await clearSession(userId); } catch (_) {}
  await publishListing(userId, kind, text);
  await sendMessage(
    userId,
    kind === 'offer'
      ? '✅ Taklif 🌐 AVIA MARKET — UMUMIY CHATga joylashtirildi.'
      : '✅ So‘rov 🌐 AVIA MARKET — UMUMIY CHATga joylashtirildi.',
    privateMenuFor(userId),
  );
}

async function handleAction(userId, cmd, eventObj) {
  const isGroup = Number(eventObj?.peer_id || 0) === PRIMARY_PEER_ID;
  try {
    if (cmd === 'open_market_chat') {
      await sendMarketChatLink(userId);
      if (eventObj) await eventAnswer(eventObj, 'Umumiy chat havolasi yuborildi');
      return;
    }

    if (cmd === 'admin_cleanall') {
      await cleanPrimaryChat(userId);
      if (eventObj) await eventAnswer(eventObj, 'Tozalash bajarilmoqda');
      return;
    }

    if (cmd === 'new_offer' || cmd === 'new_search') {
      const mode = cmd === 'new_offer' ? 'offer' : 'search';
      await startEntry(userId, mode);
      if (eventObj) await eventAnswer(eventObj, 'Shaxsiy botga yuborildi');
      return;
    }

    if (['offers', 'searches', 'my_offers', 'my_searches'].includes(cmd)) {
      await sendListToUser(userId, cmd);
      if (eventObj) await eventAnswer(eventObj, 'Natija shaxsiy botga yuborildi');
      return;
    }

    if (cmd === 'stats') {
      await sendStatsToUser(userId);
      if (eventObj) await eventAnswer(eventObj, 'Statistika shaxsiy botga yuborildi');
      return;
    }

    if (eventObj) await eventAnswer(eventObj, 'Noma’lum amal');
  } catch (error) {
    const cannotDm = [901, 902, 914].includes(Number(error.code));
    if (eventObj) {
      await eventAnswer(eventObj, cannotDm || isGroup ? 'Avval “🤖 SHAXSIY BOT”ni oching' : 'Xatolik. Qayta urinib ko‘ring');
    }
    if (!cannotDm) console.error('action_failed', { cmd, code: error.code || null, message: error.message });
  }
}

function parseLegacyCommand(text) {
  const value = String(text || '').replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim().toLowerCase();
  if (value.startsWith('/menu') || value === 'menu') return 'menu';
  if (value.includes('takliflar') || value.startsWith('/offers')) return 'offers';
  if (value.includes('qidirish') || value.startsWith('/search')) return 'new_search';
  if (value.includes('bugungi') || value.startsWith('/today')) return 'offers';
  if (value.includes('status') || value.includes('statistika') || value.startsWith('/stats')) return 'stats';
  return null;
}

async function handleGroupMessage(msg, rawEvent) {
  const peerId = Number(msg.peer_id || 0);
  const userId = Number(msg.from_id || 0);
  const cmid = Number(msg.conversation_message_id || 0);
  const cmd = parseLegacyCommand(msg.text);

  if (cmd === 'menu') {
    await ensureMarketChatTitle();
    await sendMessage(
      peerId,
      '🌐 AVIA MARKET — UMUMIY CHAT\n\nBu chat barcha agentlar ko‘radigan umumiy bozor lentasi.\n\nTaklif va so‘rovlarni tugmalar orqali kiriting. Shaxsiy ma’lumotlar va o‘zingizning e’lonlaringiz uchun “🤖 SHAXSIY BOT”dan foydalaning.',
      groupMenu,
    );
    await deleteChatMessage(peerId, cmid);
    return;
  }

  if (cmd) {
    await deleteChatMessage(peerId, cmid);
    await handleAction(userId, cmd, null);
    return;
  }

  if (STRICT_MARKET_CHAT) {
    await deleteChatMessage(peerId, cmid);
    return;
  }

  try {
    const ingest = await sbRpc('ingest_vk_aviation_message', {
      p_secret: process.env.VK_INGEST_SECRET,
      p_event: rawEvent,
    });
    if (ingest?.duplicate) {
      await sendMessage(userId, '⚠️ Bu ma’lumotni bugun allaqachon joylashtirgansiz.\n\nBugun boshqa taklif kiritishingiz mumkin, yoki shu taklifni ertaga qayta joylashtirishingiz mumkin.');
    }
  } catch (error) {
    console.error('ingest_failed', { message: error.message });
  }
}

async function processEvent(event) {
  if (event.type === 'message_event') {
    const obj = event.object || {};
    const payload = safePayload(obj.payload);
    const cmd = String(payload.cmd || '');
    await handleAction(Number(obj.user_id || 0), cmd, obj);
    return;
  }

  if (event.type !== 'message_new') return;
  const msg = event.object?.message;
  if (!msg || Number(msg.out || 0) === 1) return;

  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);

  if (peerId === PRIMARY_PEER_ID) {
    await handleGroupMessage(msg, event);
    return;
  }

  if (peerId > 0 && peerId === fromId) {
    await handlePrivateText(msg);
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const missing = REQUIRED.filter((key) => !process.env[key]);
    const titleUpdated = await ensureMarketChatTitle();
    return json(res, 200, {
      ok: missing.length === 0,
      service: 'vk-avia-market-bot',
      version: 'marketplace-separated-ui-v2',
      strict_market_chat: STRICT_MARKET_CHAT,
      primary_peer_id: PRIMARY_PEER_ID,
      common_chat_title: COMMON_CHAT_TITLE,
      common_chat_title_updated: titleUpdated,
      admin_menu_enabled: CLEANUP_USER_ID > 0,
      missing_config: missing,
    });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID) return sendOk(res);

  if (event.type === 'confirmation') {
    res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
    return res.end(process.env.VK_CONFIRMATION_STRING || '');
  }

  if (process.env.VK_SECRET && event.secret !== process.env.VK_SECRET) {
    return json(res, 403, { ok: false });
  }

  try {
    await processEvent(event);
  } catch (error) {
    console.error('vk_event_failed', { type: event.type || null, message: error.message, code: error.code || null });
  }
  return sendOk(res);
};
