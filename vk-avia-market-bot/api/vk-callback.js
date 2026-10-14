const crypto = require('crypto');
const legacyHandler = require('./vk-callback-legacy');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);

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

async function sbRpc(fn, payload) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error('Supabase configuration missing');
  const r = await fetch(`${base}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
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

  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
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

async function userNames(ids) {
  const unique = [...new Set(ids.filter((x) => Number(x) > 0))].slice(0, 100);
  if (!unique.length) return new Map();
  try {
    const users = await vkApi('users.get', { user_ids: unique.join(',') });
    return new Map((users || []).map((u) => [Number(u.id), `${u.first_name || ''} ${u.last_name || ''}`.trim()]));
  } catch {
    return new Map();
  }
}

async function publishListing(userId, kind, text) {
  const names = await userNames([userId]);
  const name = names.get(userId) || `ID ${userId}`;
  const header = kind === 'offer' ? '✈️ TAKLIF' : '🔎 SO‘ROV';
  const body = `${header}\n👤 [id${userId}|${name}]\n🕒 ${fmtTime(new Date().toISOString())}\n\n${text}\n\n#AviaMarket`;
  await sendVkMessage(PRIMARY_PEER_ID, body);
}

async function handleMenu(event, res) {
  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const menuText = '✈️ Avia Market\n\n➕ Taklif yoki 🔎 So‘rov tugmasini bosing va ma’lumotni shu chatning o‘ziga yozing. Bot xabaringizni avtomatik formatlab bozor lentasiga joylaydi.\n\nRo‘yxatlar shaxsiy botga yuboriladi.';

  try {
    await sendVkMessage(peerId, menuText, groupMenu);
  } catch {
    await sendVkMessage(peerId, menuText, null);
  }
  return sendOk(res);
}

async function startGroupEntry(event, mode) {
  const userId = Number(event?.user_id || 0);
  if (!userId) return;
  await setSession(userId, mode);
  await eventAnswer(
    event,
    mode === 'offer'
      ? 'Taklifni shu chatga bitta xabarda yozing'
      : 'So‘rovni shu chatga bitta xabarda yozing'
  );
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
    await deleteChatMessage(peerId, cmid);
    try { await sendVkMessage(userId, '⚠️ Ma’lumotni saqlab bo‘lmadi. Qayta urinib ko‘ring.'); } catch (_) {}
    return sendOk(res);
  }

  await deleteChatMessage(peerId, cmid);

  if (result?.duplicate) {
    await setSession(userId, kind);
    const noun = kind === 'offer' ? 'taklif' : 'so‘rov';
    try {
      await sendVkMessage(userId, `⚠️ Bu ${noun}ni bugun allaqachon joylashtirgansiz.\n\nBugun boshqa ${noun} kiritishingiz mumkin, yoki shu ${noun}ni ertaga qayta joylashtirishingiz mumkin.`);
    } catch (_) {}
    return sendOk(res);
  }

  if (!result?.stored) {
    try { await sendVkMessage(userId, '⚠️ Ma’lumotni saqlab bo‘lmadi. Qayta urinib ko‘ring.'); } catch (_) {}
    return sendOk(res);
  }

  try { await clearSession(userId); } catch (_) {}

  try {
    await publishListing(userId, kind, text);
  } catch {
    try { await sendVkMessage(userId, '⚠️ Ma’lumot saqlandi, lekin chatga chiqarishda xato bo‘ldi.'); } catch (_) {}
  }
  return sendOk(res);
}

async function deleteCmidBatch(peerId, cmids) {
  const list = [...new Set(cmids.map(Number).filter(Boolean))];
  if (!list.length) return { deleted: 0, failed: 0 };

  try {
    await vkApi('messages.delete', {
      peer_id: peerId,
      cmids: list.join(','),
      delete_for_all: 1,
    });
    return { deleted: list.length, failed: 0 };
  } catch {
    if (list.length === 1) return { deleted: 0, failed: 1 };
    const middle = Math.ceil(list.length / 2);
    const left = await deleteCmidBatch(peerId, list.slice(0, middle));
    const right = await deleteCmidBatch(peerId, list.slice(middle));
    return {
      deleted: left.deleted + right.deleted,
      failed: left.failed + right.failed,
    };
  }
}

async function cleanChatHistory(peerId) {
  let deleted = 0;
  let failed = 0;
  let previousSignature = '';

  for (let pass = 0; pass < 20; pass += 1) {
    const history = await vkApi('messages.getHistory', {
      peer_id: peerId,
      count: 200,
      rev: 0,
    });
    const items = Array.isArray(history?.items) ? history.items : [];
    const cmids = items
      .map((item) => Number(item?.conversation_message_id || 0))
      .filter(Boolean);

    if (!cmids.length) break;
    const signature = cmids.join(',');
    if (signature === previousSignature) break;
    previousSignature = signature;

    const result = await deleteCmidBatch(peerId, cmids);
    deleted += result.deleted;
    failed += result.failed;
    if (!result.deleted) break;
  }

  return { deleted, failed };
}

async function verifyCallbackSecret(event, fromId, allowPin) {
  if (!event.secret) return { ok: false };
  return sbRpc('verify_vk_callback_secret', {
    p_secret: process.env.VK_INGEST_SECRET,
    p_group_id: VK_GROUP_ID,
    p_from_id: fromId || null,
    p_event_secret_hash: sha256(event.secret),
    p_allow_pin: Boolean(allowPin),
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'same-chat-cleanup-v7',
      primary_peer_id: PRIMARY_PEER_ID,
      cleanup_enabled: CLEANUP_USER_ID > 0,
      callback_security: 'pinned_sha256',
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
  const isPrimaryMessage = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId === PRIMARY_PEER_ID
  );
  const isPrimaryMenu = isPrimaryMessage && (command === '/menu' || command.startsWith('/menu '));
  const isCleanup = isPrimaryMessage && command === '/cleanall';

  let verification;
  try {
    verification = await verifyCallbackSecret(event, fromId, isPrimaryMenu || isCleanup);
  } catch {
    return json(res, 503, { ok: false });
  }
  if (!verification?.ok) return json(res, 403, { ok: false });

  if (isPrimaryMenu) return handleMenu(event, res);

  if (isCleanup) {
    if (!CLEANUP_USER_ID || fromId !== CLEANUP_USER_ID) return sendOk(res);

    try { await clearSession(fromId); } catch (_) {}

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
    const cmd = String(payload.cmd || '');
    if (cmd === 'new_offer' || cmd === 'new_search') {
      await startGroupEntry(event.object, cmd === 'new_offer' ? 'offer' : 'search');
      return sendOk(res);
    }
  }

  if (isPrimaryMessage) {
    const handled = await handleGroupDraft(event, res);
    if (handled !== false) return handled;
  }

  const legacyEvent = {
    ...event,
    secret: process.env.VK_SECRET || event.secret,
  };
  return legacyHandler({ method: req.method, body: legacyEvent }, res);
};
