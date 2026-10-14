const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const worker = require('./vk-callback');

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

function sinkResponse() {
  return {
    statusCode: 200,
    headers: {},
    finished: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
    getHeader(name) { return this.headers[String(name).toLowerCase()]; },
    end(body) { this.body = body; this.finished = true; return this; },
    send(body) { this.body = body; this.finished = true; return this; },
    json(body) { this.body = body; this.finished = true; return this; },
  };
}

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

function chunks(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function fetchWithTimeout(url, options, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
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

  let response;
  try {
    response = await fetchWithTimeout(`https://api.vk.com/method/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    }, 6000);
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

async function sbClearSession(userId) {
  const base = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key || !process.env.VK_INGEST_SECRET || !userId) return;
  try {
    await fetchWithTimeout(`${base}/rest/v1/rpc/clear_vk_market_session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        p_secret: process.env.VK_INGEST_SECRET,
        p_user_id: userId,
      }),
    }, 4000);
  } catch (_) {}
}

async function deleteDirect(peerId, cmids) {
  const list = [...new Set(cmids.map(Number).filter(Boolean))];
  if (!list.length) return { deleted: 0, failed: 0, failedIds: [] };
  try {
    await vkApi('messages.delete', {
      peer_id: peerId,
      cmids: list.join(','),
      delete_for_all: 1,
    });
    return { deleted: list.length, failed: 0, failedIds: [] };
  } catch (error) {
    return {
      deleted: 0,
      failed: list.length,
      failedIds: list,
      error: { code: error.code || null, message: error.message || 'delete failed' },
    };
  }
}

async function deleteRobust(peerId, cmids) {
  const list = [...new Set(cmids.map(Number).filter(Boolean))];
  if (!list.length) return { deleted: 0, failed: 0, firstError: null };

  const first = await deleteDirect(peerId, list);
  if (!first.failed) return { deleted: first.deleted, failed: 0, firstError: null };

  let deleted = 0;
  let failed = 0;
  let firstError = first.error || null;

  const tens = chunks(list, 10);
  const coarse = await Promise.all(tens.map((part) => deleteDirect(peerId, part)));
  const retrySingles = [];
  for (const result of coarse) {
    deleted += result.deleted;
    if (result.failedIds?.length) retrySingles.push(...result.failedIds);
    if (!firstError && result.error) firstError = result.error;
  }

  if (retrySingles.length) {
    const singles = await Promise.all(retrySingles.map((cmid) => deleteDirect(peerId, [cmid])));
    for (const result of singles) {
      deleted += result.deleted;
      failed += result.failed;
      if (!firstError && result.error) firstError = result.error;
    }
  }

  return { deleted, failed, firstError };
}

async function cleanChatHistory(peerId) {
  let found = 0;
  let deleted = 0;
  let failed = 0;
  let passes = 0;
  let firstError = null;
  let previousSignature = '';

  for (let pass = 0; pass < 8; pass += 1) {
    const history = await vkApi('messages.getHistory', {
      peer_id: peerId,
      count: 200,
      rev: 0,
    });
    const cmids = [...new Set((Array.isArray(history?.items) ? history.items : [])
      .map((item) => Number(item?.conversation_message_id || 0))
      .filter(Boolean))];

    if (!cmids.length) break;
    const signature = cmids.join(',');
    if (signature === previousSignature) break;
    previousSignature = signature;
    passes += 1;
    found += cmids.length;

    const batches = chunks(cmids, 50);
    const results = await Promise.all(batches.map((batch) => deleteRobust(peerId, batch)));
    let passDeleted = 0;
    for (const result of results) {
      passDeleted += result.deleted;
      deleted += result.deleted;
      failed += result.failed;
      if (!firstError && result.firstError) firstError = result.firstError;
    }

    if (!passDeleted || cmids.length < 200) break;
  }

  return { found, deleted, failed, passes, firstError };
}

async function sendOwnerMessage(userId, message) {
  if (!userId) return;
  try {
    await vkApi('messages.send', {
      peer_id: userId,
      random_id: randomId(),
      message,
      disable_mentions: 1,
    });
  } catch (_) {}
}

async function sendCleanupSummary(userId, result) {
  const details = [
    '🧹 Avia Market chat tozalash yakunlandi.',
    `✅ O‘chirildi: ${Number(result.deleted || 0)}`,
    result.failed ? `⚠️ O‘chmagan: ${Number(result.failed || 0)}` : null,
  ].filter(Boolean).join('\n');
  await sendOwnerMessage(userId, details);
}

async function runCleanup(event, targetPeerId = PRIMARY_PEER_ID) {
  const msg = event.object?.message || {};
  const sourcePeerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  const peerId = Number(targetPeerId || PRIMARY_PEER_ID);

  await sendOwnerMessage(fromId, '🧹 Avia Market umumiy chatini tozalash boshlandi…');
  await sbClearSession(fromId);
  const result = await cleanChatHistory(peerId);
  await sendCleanupSummary(fromId, result);
  console.log('cleanall_completed', {
    peerId,
    sourcePeerId,
    fromId,
    found: result.found,
    deleted: result.deleted,
    failed: result.failed,
    passes: result.passes,
    firstErrorCode: result.firstError?.code || null,
  });
}

function getCleanupTarget(event) {
  const msg = event.object?.message || {};
  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  const command = normalizeCommand(msg.text);
  const privateOwnerChat = peerId > 0 && peerId === fromId;

  const authorized = (
    event.type === 'message_new' &&
    Number(event.group_id || 0) === VK_GROUP_ID &&
    Number(msg.out || 0) !== 1 &&
    command === '/cleanall' &&
    CLEANUP_USER_ID > 0 &&
    fromId === CLEANUP_USER_ID &&
    callbackSecretOk(event)
  );

  if (!authorized) return 0;
  if (peerId === PRIMARY_PEER_ID || privateOwnerChat) return PRIMARY_PEER_ID;
  return 0;
}

function logRejectedCleanAll(event) {
  const msg = event.object?.message || {};
  const command = normalizeCommand(msg.text);
  if (command !== '/cleanall') return;
  const peerId = Number(msg.peer_id || 0);
  const fromId = Number(msg.from_id || 0);
  console.warn('cleanall_rejected', {
    eventType: event.type || null,
    groupMatch: Number(event.group_id || 0) === VK_GROUP_ID,
    outgoing: Number(msg.out || 0) === 1,
    peerId,
    primaryPeerId: PRIMARY_PEER_ID,
    privateOwnerChat: peerId > 0 && peerId === fromId,
    fromId,
    ownerConfigured: CLEANUP_USER_ID > 0,
    ownerMatch: CLEANUP_USER_ID > 0 && fromId === CLEANUP_USER_ID,
    secretMatch: callbackSecretOk(event),
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'fast-ack-cleanall-v2',
      primary_peer_id: PRIMARY_PEER_ID,
      cleanup_enabled: CLEANUP_USER_ID > 0,
      private_owner_cleanall: true,
      fast_ack: true,
    });
  }

  if (req.method !== 'POST') return worker(req, res);

  const event = req.body || {};
  if (event.type === 'confirmation') return worker(req, res);

  // VK receives the acknowledgement immediately. All existing business logic
  // continues through waitUntil so network/Supabase latency cannot trigger
  // callback retries or make the bot feel frozen.
  sendOk(res);

  const cleanupTarget = getCleanupTarget(event);
  if (cleanupTarget) {
    waitUntil(runCleanup(event, cleanupTarget).catch((error) => {
      console.error('cleanall_failed', {
        message: error?.message || String(error),
        code: error?.code || null,
      });
    }));
    return;
  }

  logRejectedCleanAll(event);
  waitUntil(Promise.resolve(worker(req, sinkResponse())).catch((error) => {
    console.error('vk_background_worker_failed', {
      type: event.type || null,
      message: error?.message || String(error),
      code: error?.code || null,
    });
  }));
};
