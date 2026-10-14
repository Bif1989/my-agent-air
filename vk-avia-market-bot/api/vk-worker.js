const crypto = require('crypto');
const legacyHandler = require('./vk-callback-legacy');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function sendOk(res) {
  res.status(200).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end('ok');
}

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function randomId() {
  return Math.floor(Math.random() * 2147483647);
}

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

function fmtTime(value) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(value));
  } catch { return ''; }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function sbRpc(fn, payload) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error('Supabase configuration missing');
  const r = await fetchWithTimeout(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  }, 5000);
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(`Supabase RPC ${fn} failed: ${r.status}`);
  return data;
}

async function diagnostic(stage, context = {}, error = null) {
  try {
    await sbRpc('log_vk_bot_diagnostic', {
      p_secret: process.env.VK_INGEST_SECRET,
      p_event_type: context.eventType || null,
      p_peer_id: Number(context.peerId || 0) || null,
      p_from_id: Number(context.fromId || 0) || null,
      p_stage: stage,
      p_error_code: error?.code != null ? String(error.code) : null,
      p_error_message: error?.message ? String(error.message).slice(0, 1000) : null,
      p_details: context.details || {},
    });
  } catch (_) {}
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

  let response;
  try {
    response = await fetchWithTimeout(`https://api.vk.com/method/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }, 8000);
  } catch (cause) {
    const error = new Error(`VK ${method} timeout/network error`);
    error.code = 'network';
    error.cause = cause;
    throw error;
  }

  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok || data?.error) {
    const code = data?.error?.error_code || response.status;
    const message = data?.error?.error_msg || `HTTP ${response.status}`;
    const error = new Error(`VK ${method} failed: ${code} ${message}`);
    error.code = code;
    throw error;
  }
  return data?.response;
}

function callbackSecretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH) return sha256(event.secret) === CALLBACK_SECRET_HASH;
  if (process.env.VK_SECRET) return event.secret === process.env.VK_SECRET;
  return false;
}

const groupMenu = {
  inline: true,
  buttons: [
    [
      { action: { type: 'callback', label: '➕ Taklif', payload: '{"cmd":"new_offer"}' } },
      { action: { type: 'callback', label: '🔎 So‘rov', payload: '{"cmd":"new_search"}' } },
    ],
    [
      { action: { type: 'callback', label: '🌐 Takliflar', payload: '{"cmd":"offers"}' } },
      { action: { type: 'callback', label: '👥 So‘rovlar', payload: '{"cmd":"searches"}' } },
    ],
    [
      { action: { type: 'callback', label: '📦 Mening takliflarim', payload: '{"cmd":"my_offers"}' } },
      { action: { type: 'callback', label: '📋 Mening so‘rovlarim', payload: '{"cmd":"my_searches"}' } },
    ],
  ],
};

async function sendVkMessage(peerId, message, keyboard) {
  const params = {
    peer_id: peerId,
    random_id: randomId(),
    message,
    disable_mentions: 1,
  };
  if (keyboard) params.keyboard = JSON.stringify(keyboard);
  return vkApi('messages.send', params);
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
  } catch (_) {}
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
  } catch {
    return false;
  }
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

async function getMenuData(action, userId, limit = 5) {
  return sbRpc('get_vk_aviation_menu_data_v2', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_action: action,
    p_limit: limit,
    p_from_id: userId || null,
  });
}

function formatItems(title, items) {
  if (!items?.length) return `${title}\n\nHozircha ma’lumot yo‘q.`;
  const blocks = items.map((it, index) => {
    const uid = Number(it.from_id || 0);
    const who = uid ? `[id${uid}|Agent]` : 'Agent';
    const icon = it.message_kind === 'search' ? '🔎' : (it.message_kind === 'sold' ? '🔴' : '✈️');
    const when = fmtTime(it.sent_at || it.sort_at);
    return `${index + 1}. ${icon} ${who}${when ? `\n🕒 ${when}` : ''}\n${String(it.text || '').trim()}`;
  });
  return `${title}\n\n${blocks.join('\n\n────────\n\n')}`.slice(0, 3900);
}

async function sendListToUser(userId, action) {
  const data = await getMenuData(action, userId, 5);
  const titles = {
    offers: '🌐 Barcha takliflar',
    searches: '👥 Barcha so‘rovlar',
    my_offers: '📦 Mening takliflarim',
    my_searches: '📋 Mening so‘rovlarim',
  };
  await sendVkMessage(userId, formatItems(titles[action] || 'Avia Market', data?.items || []));
}

async function publishListing(userId, kind, text) {
  const header = kind === 'offer' ? '✈️ TAKLIF' : '🔎 SO‘ROV';
  const body = `${header}\n👤 [id${userId}|Agent]\n🕒 ${fmtTime(new Date().toISOString())}\n\n${text}\n\n#AviaMarket`;
  await sendVkMessage(PRIMARY_PEER_ID, body);
}

async function handleMenu(event, res) {
  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const cmid = Number(msg.conversation_message_id || 0);
  const menuText = '✈️ Avia Market\n\n➕ Taklif yoki 🔎 So‘rov tugmasini bosing va ma’lumotni shu chatning o‘ziga yozing. Bot xabaringizni avtomatik formatlab bozor lentasiga joylaydi.\n\nRo‘yxatlar shaxsiy botga yuboriladi.';

  const [sent] = await Promise.allSettled([
    sendVkMessage(peerId, menuText, groupMenu),
    deleteChatMessage(peerId, cmid),
  ]);
  if (sent.status === 'rejected') {
    try { await sendVkMessage(peerId, menuText); } catch (_) {}
  }
  return sendOk(res);
}

async function startGroupEntry(event, mode) {
  const userId = Number(event?.user_id || 0);
  if (!userId) return;
  await Promise.allSettled([
    setSession(userId, mode),
    eventAnswer(
      event,
      mode === 'offer'
        ? 'Taklifni shu chatga bitta xabarda yozing'
        : 'So‘rovni shu chatga bitta xabarda yozing'
    ),
  ]);
}

async function handleGroupAction(event, cmd) {
  const userId = Number(event?.user_id || 0);
  if (!userId) return;

  if (cmd === 'new_offer' || cmd === 'new_search') {
    await startGroupEntry(event, cmd === 'new_offer' ? 'offer' : 'search');
    return;
  }

  if (['offers', 'searches', 'my_offers', 'my_searches'].includes(cmd)) {
    await Promise.allSettled([
      sendListToUser(userId, cmd),
      eventAnswer(event, 'Natija shaxsiy botga yuborilmoqda'),
    ]);
    return;
  }

  await eventAnswer(event, 'Noma’lum amal');
}

async function handleGroupDraft(event, res) {
  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const userId = Number(msg.from_id || 0);
  const cmid = Number(msg.conversation_message_id || 0);
  const text = String(msg.text || '').trim();
  if (!userId || !text || text.startsWith('/')) return false;

  let session;
  try { session = await getSession(userId); } catch { return false; }
  if (!session?.active) return false;

  const kind = session.mode === 'search' ? 'search' : 'offer';
  let result;
  try {
    result = await createListing(userId, kind, text);
  } catch {
    await Promise.allSettled([
      deleteChatMessage(peerId, cmid),
      sendVkMessage(userId, '⚠️ Ma’lumotni saqlab bo‘lmadi. Qayta urinib ko‘ring.'),
    ]);
    return sendOk(res);
  }

  if (result?.duplicate) {
    const noun = kind === 'offer' ? 'taklif' : 'so‘rov';
    await Promise.allSettled([
      deleteChatMessage(peerId, cmid),
      setSession(userId, kind),
      sendVkMessage(userId, `⚠️ Bu ${noun}ni bugun allaqachon joylashtirgansiz.\n\nBugun boshqa ${noun} kiritishingiz mumkin, yoki shu ${noun}ni ertaga qayta joylashtirishingiz mumkin.`),
    ]);
    return sendOk(res);
  }

  if (!result?.stored) {
    await Promise.allSettled([
      deleteChatMessage(peerId, cmid),
      sendVkMessage(userId, '⚠️ Ma’lumotni saqlab bo‘lmadi. Qayta urinib ko‘ring.'),
    ]);
    return sendOk(res);
  }

  const tasks = await Promise.allSettled([
    deleteChatMessage(peerId, cmid),
    clearSession(userId),
    publishListing(userId, kind, text),
  ]);

  if (tasks[2].status === 'rejected') {
    try { await sendVkMessage(userId, '⚠️ Ma’lumot saqlandi, lekin chatga chiqarishda xato bo‘ldi.'); } catch (_) {}
  }
  return sendOk(res);
}

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function cleanChatHistory(peerId) {
  const history = await vkApi('messages.getHistory', {
    peer_id: peerId,
    count: 200,
    rev: 0,
  });
  const cmids = [...new Set((Array.isArray(history?.items) ? history.items : [])
    .map((item) => Number(item?.conversation_message_id || 0))
    .filter(Boolean))];

  let deleted = 0;
  let failed = 0;
  let firstError = null;

  for (const batch of chunks(cmids, 50)) {
    try {
      await vkApi('messages.delete', {
        peer_id: peerId,
        cmids: batch.join(','),
        delete_for_all: 1,
      });
      deleted += batch.length;
    } catch (error) {
      failed += batch.length;
      if (!firstError) firstError = { code: error.code || null, message: error.message || 'delete failed' };
    }
  }

  return {
    found: cmids.length,
    deleted,
    failed,
    first_error_code: firstError?.code || null,
    first_error_message: firstError?.message ? String(firstError.message).slice(0, 300) : null,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'fast-callback-cleanup-v8',
      primary_peer_id: PRIMARY_PEER_ID,
      cleanup_enabled: CLEANUP_USER_ID > 0,
      callback_security: CALLBACK_SECRET_HASH ? 'local_sha256' : 'legacy_secret',
    });
  }

  if (req.method !== 'POST') return legacyHandler(req, res);

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID) return legacyHandler(req, res);
  if (event.type === 'confirmation') return legacyHandler(req, res);

  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || event.object?.peer_id || 0);
  const fromId = Number(msg.from_id || event.object?.user_id || 0);
  const command = normalizeCommand(msg.text);

  if (!callbackSecretOk(event)) return json(res, 403, { ok: false });

  const isPrimaryMessage = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId === PRIMARY_PEER_ID
  );

  if (isPrimaryMessage && (command === '/menu' || command.startsWith('/menu '))) {
    return handleMenu(event, res);
  }

  if (isPrimaryMessage && command === '/cleanall') {
    if (!CLEANUP_USER_ID || fromId !== CLEANUP_USER_ID) return sendOk(res);

    const cmid = Number(msg.conversation_message_id || 0);
    try { await clearSession(fromId); } catch (_) {}
    try { await deleteChatMessage(peerId, cmid); } catch (_) {}

    try {
      const result = await cleanChatHistory(peerId);
      await diagnostic('cleanup_completed', {
        eventType: event.type,
        peerId,
        fromId,
        details: result,
      });
    } catch (error) {
      await diagnostic('cleanup_failed', {
        eventType: event.type,
        peerId,
        fromId,
      }, error);
    }
    return sendOk(res);
  }

  if (event.type === 'message_event' && Number(event.object?.peer_id || 0) === PRIMARY_PEER_ID) {
    const payload = safePayload(event.object?.payload);
    await handleGroupAction(event.object, String(payload.cmd || ''));
    return sendOk(res);
  }

  if (isPrimaryMessage) {
    const handled = await handleGroupDraft(event, res);
    if (handled !== false) return handled;
  }

  // The legacy handler still validates VK_SECRET. At this point the event has
  // already passed the local SHA-256 verification, so provide a compatibility
  // copy to avoid rejecting valid callbacks because an old plaintext env is stale.
  const legacyEvent = {
    ...event,
    secret: process.env.VK_SECRET || event.secret,
  };
  return legacyHandler({ method: req.method, body: legacyEvent }, res);
};
