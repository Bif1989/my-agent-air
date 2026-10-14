const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const STRICT_MARKET_CHAT = process.env.VK_STRICT_MARKET_CHAT !== 'false';
const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';

const REQUIRED = ['VK_TOKEN','VK_SECRET','VK_CONFIRMATION_STRING','SUPABASE_URL','VK_INGEST_SECRET'];

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
  const token = process.env.VK_TOKEN;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, access_token: token, v: VK_API_VERSION })) {
    if (v !== undefined && v !== null) body.set(k, String(v));
  }
  const r = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const data = await r.json();
  if (!r.ok || data.error) {
    const code = data?.error?.error_code || r.status;
    const msg = data?.error?.error_msg || `HTTP ${r.status}`;
    const e = new Error(`VK ${method} failed: ${code} ${msg}`);
    e.code = code;
    throw e;
  }
  return data.response;
}

async function sbRpc(fn, payload) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error('Supabase configuration missing');
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify(payload)
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(`Supabase RPC ${fn} failed: ${r.status}`);
  return data;
}

async function getMenuData(action, userId, limit = 5) {
  return sbRpc('get_vk_aviation_menu_data_v2', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_action: action,
    p_limit: limit,
    p_from_id: userId || null
  });
}

async function setSession(userId, mode) {
  return sbRpc('set_vk_market_session', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_user_id: userId,
    p_mode: mode
  });
}

async function getSession(userId) {
  return sbRpc('get_vk_market_session', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_user_id: userId
  });
}

async function createListing(userId, kind, text) {
  return sbRpc('create_vk_market_listing', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_from_id: userId,
    p_kind: kind,
    p_text: text,
    p_peer_id: PRIMARY_PEER_ID
  });
}

const privateMenu = {
  one_time: false,
  inline: false,
  buttons: [
    [
      { action: { type: 'callback', label: '➕ Taklif berish', payload: JSON.stringify({cmd:'new_offer'}) }, color: 'primary' },
      { action: { type: 'callback', label: '🔎 So‘rov berish', payload: JSON.stringify({cmd:'new_search'}) }, color: 'primary' }
    ],
    [
      { action: { type: 'callback', label: '📦 Mening takliflarim', payload: JSON.stringify({cmd:'my_offers'}) }, color: 'secondary' },
      { action: { type: 'callback', label: '📋 Mening so‘rovlarim', payload: JSON.stringify({cmd:'my_searches'}) }, color: 'secondary' }
    ],
    [
      { action: { type: 'callback', label: '🌐 Barcha takliflar', payload: JSON.stringify({cmd:'offers'}) }, color: 'secondary' },
      { action: { type: 'callback', label: '👥 Barcha so‘rovlar', payload: JSON.stringify({cmd:'searches'}) }, color: 'secondary' }
    ],
    [
      { action: { type: 'callback', label: '📊 Statistika', payload: JSON.stringify({cmd:'stats'}) }, color: 'secondary' }
    ]
  ]
};

const groupMenu = {
  one_time: false,
  inline: true,
  buttons: [
    [
      { action: { type: 'callback', label: '➕ Taklif', payload: JSON.stringify({cmd:'new_offer'}) }, color: 'primary' },
      { action: { type: 'callback', label: '🔎 So‘rov', payload: JSON.stringify({cmd:'new_search'}) }, color: 'primary' }
    ],
    [
      { action: { type: 'callback', label: '🌐 Takliflar', payload: JSON.stringify({cmd:'offers'}) }, color: 'secondary' },
      { action: { type: 'callback', label: '👥 So‘rovlar', payload: JSON.stringify({cmd:'searches'}) }, color: 'secondary' }
    ],
    [
      { action: { type: 'callback', label: '📦 Mening takliflarim', payload: JSON.stringify({cmd:'my_offers'}) }, color: 'secondary' },
      { action: { type: 'callback', label: '📋 Mening so‘rovlarim', payload: JSON.stringify({cmd:'my_searches'}) }, color: 'secondary' }
    ],
    [
      { action: { type: 'open_link', label: '💬 Shaxsiy bot', link: BOT_OPEN_URL }, color: 'secondary' }
    ]
  ]
};

async function sendMessage(peerId, message, keyboard) {
  const params = {
    peer_id: peerId,
    random_id: randomId(),
    message,
    disable_mentions: 1
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
      delete_for_all: 1
    });
    return true;
  } catch (e) {
    console.warn('delete_failed', { peerId, cmid, code: e.code || null });
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
      event_data: JSON.stringify({ type: 'show_snackbar', text: String(text).slice(0, 90) })
    });
  } catch (e) {
    console.warn('event_answer_failed', { code: e.code || null });
  }
}

async function userNames(ids) {
  const unique = [...new Set(ids.filter(x => Number(x) > 0))].slice(0, 100);
  if (!unique.length) return new Map();
  try {
    const users = await vkApi('users.get', { user_ids: unique.join(',') });
    return new Map((users || []).map(u => [Number(u.id), `${u.first_name || ''} ${u.last_name || ''}`.trim()]));
  } catch {
    return new Map();
  }
}

function formatItems(title, items, names) {
  if (!items?.length) return `${title}\n\nHozircha ma’lumot yo‘q.`;
  const blocks = items.map((it, i) => {
    const uid = Number(it.from_id || 0);
    const name = names.get(uid) || (uid ? `ID ${uid}` : 'Agent');
    const who = uid ? `[id${uid}|${name}]` : name;
    const icon = it.message_kind === 'search' ? '🔎' : (it.message_kind === 'sold' ? '🔴' : '✈️');
    const when = fmtTime(it.sent_at || it.sort_at);
    return `${i + 1}. ${icon} ${who}${when ? `\n🕒 ${when}` : ''}\n${String(it.text || '').trim()}`;
  });
  return `${title}\n\n${blocks.join('\n\n────────\n\n')}`.slice(0, 3900);
}

async function sendListToUser(userId, action) {
  const data = await getMenuData(action, userId, 5);
  const items = data?.items || [];
  const names = await userNames(items.map(x => x.from_id));
  const titles = {
    offers: '🌐 Barcha takliflar',
    searches: '👥 Barcha so‘rovlar',
    my_offers: '📦 Mening takliflarim',
    my_searches: '📋 Mening so‘rovlarim'
  };
  await sendMessage(userId, formatItems(titles[action] || 'Avia Market', items, names), privateMenu);
}

async function sendStatsToUser(userId) {
  const data = await getMenuData('stats', userId, 5);
  const s = data?.stats || {};
  const text = [
    '📊 Avia Market statistikasi',
    '',
    `✈️ Faol takliflar: ${Number(s.offers || 0)}`,
    `🔎 Faol so‘rovlar: ${Number(s.searches || 0)}`,
    `🕒 So‘nggi 24 soat: ${Number(s.last_24h || 0)}`,
    `📦 Mening takliflarim: ${Number(s.my_offers || 0)}`,
    `📋 Mening so‘rovlarim: ${Number(s.my_searches || 0)}`
  ].join('\n');
  await sendMessage(userId, text, privateMenu);
}

async function startEntry(userId, mode) {
  await setSession(userId, mode);
  const isOffer = mode === 'offer';
  const text = isOffer
    ? '✈️ Taklifingizni bitta xabarda yozing.\n\nMasalan:\nTAS–MOW 20 oktabr HY 4 ta joy bor, 220$\n\nBir xil taklifni bugun ikkinchi marta joylab bo‘lmaydi.'
    : '🔎 So‘rovingizni bitta xabarda yozing.\n\nMasalan:\nTAS–MOW 20 oktabrga 3 ta joy kerak\n\nBir xil so‘rovni bugun ikkinchi marta joylab bo‘lmaydi.';
  await sendMessage(userId, text);
}

async function publishListing(userId, kind, text) {
  const names = await userNames([userId]);
  const name = names.get(userId) || `ID ${userId}`;
  const header = kind === 'offer' ? '✈️ TAKLIF' : '🔎 SO‘ROV';
  const body = `${header}\n👤 [id${userId}|${name}]\n🕒 ${fmtTime(new Date().toISOString())}\n\n${text}\n\n#AviaMarket`;
  await sendMessage(PRIMARY_PEER_ID, body);
}

async function handlePrivateText(msg) {
  const userId = Number(msg.from_id || 0);
  const text = String(msg.text || '').trim();
  if (!userId) return;

  const normalized = text.toLowerCase().replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim();
  if (/^\/(start|menu|help)\b/.test(normalized) || !text) {
    await sendMessage(userId, '✈️ Avia Market\nKerakli bo‘limni tugmadan tanlang.', privateMenu);
    return;
  }

  const session = await getSession(userId);
  if (!session?.active) {
    await sendMessage(userId, '✈️ Avia Market\nTaklif yoki so‘rov kiritish uchun tugmalardan foydalaning.', privateMenu);
    return;
  }

  const kind = session.mode === 'search' ? 'search' : 'offer';
  const result = await createListing(userId, kind, text);

  if (result?.duplicate) {
    const noun = kind === 'offer' ? 'taklif' : 'so‘rov';
    await setSession(userId, kind);
    await sendMessage(userId,
      `⚠️ Bu ${noun}ni bugun allaqachon joylashtirgansiz.\n\nBugun boshqa ${noun} kiritishingiz mumkin, yoki shu ${noun}ni ertaga qayta joylashtirishingiz mumkin.`
    );
    return;
  }

  if (!result?.stored) {
    await sendMessage(userId, '⚠️ Ma’lumotni saqlab bo‘lmadi. Qayta urinib ko‘ring.', privateMenu);
    return;
  }

  await publishListing(userId, kind, text);
  await sendMessage(userId,
    kind === 'offer'
      ? '✅ Taklif Avia Market umumiy chatiga joylashtirildi.'
      : '✅ So‘rov Avia Market umumiy chatiga joylashtirildi.',
    privateMenu
  );
}

async function handleAction(userId, cmd, eventObj) {
  const isGroup = Number(eventObj?.peer_id || 0) === PRIMARY_PEER_ID;
  try {
    if (cmd === 'new_offer' || cmd === 'new_search') {
      const mode = cmd === 'new_offer' ? 'offer' : 'search';
      await startEntry(userId, mode);
      if (eventObj) await eventAnswer(eventObj, 'Shaxsiy botga yuborildi');
      return;
    }
    if (['offers','searches','my_offers','my_searches'].includes(cmd)) {
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
  } catch (e) {
    const cannotDm = [901, 902, 914].includes(Number(e.code));
    if (eventObj) {
      await eventAnswer(eventObj, cannotDm || isGroup ? 'Avval “Shaxsiy bot”ni oching' : 'Xatolik. Qayta urinib ko‘ring');
    }
    if (!cannotDm) console.error('action_failed', { cmd, code: e.code || null, message: e.message });
  }
}

function parseLegacyCommand(text) {
  const t = String(text || '').replace(/^\[club\d+\|@[^\]]+\]\s*/i, '').trim().toLowerCase();
  if (t.startsWith('/menu') || t === 'menu') return 'menu';
  if (t.includes('takliflar') || t.startsWith('/offers')) return 'offers';
  if (t.includes('qidirish') || t.startsWith('/search')) return 'new_search';
  if (t.includes('bugungi') || t.startsWith('/today')) return 'offers';
  if (t.includes('status') || t.includes('statistika') || t.startsWith('/stats')) return 'stats';
  return null;
}

async function handleGroupMessage(msg, rawEvent) {
  const peerId = Number(msg.peer_id || 0);
  const userId = Number(msg.from_id || 0);
  const cmid = Number(msg.conversation_message_id || 0);
  const cmd = parseLegacyCommand(msg.text);

  if (cmd === 'menu') {
    await sendMessage(peerId,
      '✈️ Avia Market\n\nBu chat — umumiy bozor lentasi. Taklif va so‘rovlarni tugmalar orqali kiriting. Shaxsiy amallar bot bilan alohida dialogda bajariladi.',
      groupMenu
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
      p_event: rawEvent
    });
    if (ingest?.duplicate) {
      await sendMessage(userId,
        '⚠️ Bu ma’lumotni bugun allaqachon joylashtirgansiz.\n\nBugun boshqa taklif kiritishingiz mumkin, yoki shu taklifni ertaga qayta joylashtirishingiz mumkin.'
      );
    }
  } catch (e) {
    console.error('ingest_failed', { message: e.message });
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
    const missing = REQUIRED.filter(k => !process.env[k]);
    return json(res, 200, {
      ok: missing.length === 0,
      service: 'vk-avia-market-bot',
      version: 'marketplace-batch-v1',
      strict_market_chat: STRICT_MARKET_CHAT,
      primary_peer_id: PRIMARY_PEER_ID,
      missing_config: missing
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
  } catch (e) {
    console.error('vk_event_failed', { type: event.type || null, message: e.message, code: e.code || null });
  }
  return sendOk(res);
};
