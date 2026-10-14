const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const communityEntry = require('./vk-community-entry');

const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();
const PIPELINE_DEADLINE_MS = 20000;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function callbackSecretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH && sha256(event.secret) === CALLBACK_SECRET_HASH) return true;
  if (process.env.VK_SECRET && event.secret === process.env.VK_SECRET) return true;
  return false;
}

function sendText(res, status, text) {
  res.status(status).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(text);
}

function sendJson(res, status, body) {
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

async function withDeadline(task, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`VK background pipeline exceeded ${timeoutMs}ms`);
          error.code = 'pipeline_timeout';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function runInBackground(event) {
  const requestSnapshot = { method: 'POST', body: event };
  return withDeadline(
    () => communityEntry(requestSnapshot, sinkResponse()),
    PIPELINE_DEADLINE_MS,
  ).catch((error) => {
    console.error('vk_pipeline_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'canonical-fast-entry-v1',
      fast_ack: true,
      pipeline_deadline_ms: PIPELINE_DEADLINE_MS,
      group_configured: VK_GROUP_ID > 0,
      callback_security: CALLBACK_SECRET_HASH ? 'sha256' : (process.env.VK_SECRET ? 'plaintext-fallback' : 'missing'),
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID) {
    return sendText(res, 200, 'ok');
  }

  if (!callbackSecretOk(event)) {
    return sendJson(res, 403, { ok: false, error: 'invalid_callback_secret' });
  }

  if (event.type === 'confirmation') {
    return sendText(res, 200, process.env.VK_CONFIRMATION_STRING || '');
  }

  // VK Callback API expects a prompt acknowledgement. Acknowledge first, then
  // execute the existing business flow in the background. This keeps buttons,
  // market posts, cabinet, stats and admin actions compatible while removing
  // network/Supabase latency from the callback response path.
  sendText(res, 200, 'ok');
  waitUntil(runInBackground(event));
};
