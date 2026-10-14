const legacyHandler = require('./vk-callback-legacy');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 2000000003);
const BOT_OPEN_URL = process.env.VK_BOT_OPEN_URL || 'https://vk.me/aviamarketbot';

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
  if (!r.ok) throw new Error(`Supabase RPC ${fn} failed: ${r.status}`);
  const text = await r.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

async function diagnostic(stage, context = {}, error = null) {
  try {
    const details = {
      command: context.command || null,
      secret_present: context.secretPresent === true,
      secret_match: context.secretMatch === true,
      has_keyboard: context.hasKeyboard === true,
      fallback: context.fallback === true,
      event_id: context.eventId ? String(context.eventId).slice(0, 100) : null,
    };
    await sbRpc('log_vk_bot_diagnostic', {
      p_secret: process.env.VK_INGEST_SECRET,
      p_event_type: context.eventType || null,
      p_peer_id: Number(context.peerId || 0) || null,
      p_from_id: Number(context.fromId || 0) || null,
      p_stage: stage,
      p_error_code: error?.code != null ? String(error.code) : null,
      p_error_message: error?.message ? String(error.message).slice(0, 1000) : null,
      p_details: details,
    });
  } catch (_) {
    // Diagnostics must never break the VK callback response.
  }
}

async function vkApi(method, params = {}) {
  const token = process.env.VK_TOKEN;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, access_token: token, v: VK_API_VERSION })) {
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
      { action: { type: 'open_link', label: '💬 Shaxsiy bot', link: BOT_OPEN_URL }, color: 'secondary' },
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

async function handleMenu(event, res) {
  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  const context = {
    eventType: event.type,
    peerId,
    fromId,
    command: '/menu',
    eventId: event.event_id,
    secretPresent: Boolean(event.secret),
    secretMatch: Boolean(process.env.VK_SECRET && event.secret === process.env.VK_SECRET),
  };

  await diagnostic('menu_received', context);

  const menuText = '✈️ Avia Market\n\nBu chat — umumiy bozor lentasi. Taklif va so‘rovlarni tugmalar orqali kiriting. Shaxsiy amallar bot bilan alohida dialogda bajariladi.';

  try {
    await sendVkMessage(peerId, menuText, groupMenu);
    await diagnostic('menu_keyboard_sent', { ...context, hasKeyboard: true });
    return sendOk(res);
  } catch (keyboardError) {
    await diagnostic('menu_keyboard_send_failed', { ...context, hasKeyboard: true }, keyboardError);
    try {
      await sendVkMessage(peerId, `${menuText}\n\n⚙️ Tugmalar vaqtincha tekshirilmoqda.`, null);
      await diagnostic('menu_plain_fallback_sent', { ...context, fallback: true });
      return sendOk(res);
    } catch (plainError) {
      await diagnostic('menu_plain_send_failed', { ...context, fallback: true }, plainError);
      return sendOk(res);
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'chat-migration-diagnostic-v3',
      primary_peer_id: PRIMARY_PEER_ID,
      strict_market_chat: false,
      token_configured: Boolean(process.env.VK_TOKEN),
      callback_secret_configured: Boolean(process.env.VK_SECRET),
      diagnostics_configured: Boolean(process.env.VK_INGEST_SECRET && process.env.SUPABASE_URL),
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
  const secretConfigured = Boolean(process.env.VK_SECRET);
  const secretMatch = !secretConfigured || event.secret === process.env.VK_SECRET;
  const isPrimaryMenu = (
    event.type === 'message_new' &&
    Number(msg.out || 0) !== 1 &&
    peerId === PRIMARY_PEER_ID &&
    (command === '/menu' || command.startsWith('/menu '))
  );

  if (!secretMatch) {
    await diagnostic('callback_secret_mismatch', {
      eventType: event.type,
      peerId,
      fromId,
      command: command.startsWith('/') ? command.slice(0, 40) : null,
      eventId: event.event_id,
      secretPresent: Boolean(event.secret),
      secretMatch: false,
    });

    // Temporary, narrowly scoped migration diagnostic: allow only /menu in the one
    // configured Avia Market chat so we can distinguish secret mismatch from VK_TOKEN
    // or messages.send permission errors. All other events remain blocked.
    if (!isPrimaryMenu) return json(res, 403, { ok: false });

    await diagnostic('menu_secret_mismatch_bypass', {
      eventType: event.type,
      peerId,
      fromId,
      command: '/menu',
      eventId: event.event_id,
      secretPresent: Boolean(event.secret),
      secretMatch: false,
    });
  }

  if (isPrimaryMenu) return handleMenu(event, res);

  await diagnostic('event_forwarded_to_legacy', {
    eventType: event.type,
    peerId,
    fromId,
    command: command.startsWith('/') ? command.slice(0, 40) : null,
    eventId: event.event_id,
    secretPresent: Boolean(event.secret),
    secretMatch: true,
  });
  return legacyHandler(req, res);
};
