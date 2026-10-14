const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const worker = require('./vk-worker');

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

function text(res, status, value) {
  res.status(status).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(value);
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

async function withDeadline(task, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`VK background worker exceeded ${timeoutMs}ms`);
          error.code = 'pipeline_timeout';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function runWorker(event) {
  const requestSnapshot = { method: 'POST', body: event };
  return withDeadline(
    () => worker(requestSnapshot, sinkResponse()),
    PIPELINE_DEADLINE_MS,
  ).catch((error) => {
    console.error('vk_background_worker_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: 'canonical-fast-callback-v1',
      fast_ack: true,
      pipeline_deadline_ms: PIPELINE_DEADLINE_MS,
      group_configured: VK_GROUP_ID > 0,
      callback_security: CALLBACK_SECRET_HASH ? 'sha256' : (process.env.VK_SECRET ? 'plaintext-fallback' : 'missing'),
    });
  }

  if (req.method !== 'POST') {
    return json(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID) {
    return text(res, 200, 'ok');
  }

  if (!callbackSecretOk(event)) {
    return json(res, 403, { ok: false, error: 'invalid_callback_secret' });
  }

  if (event.type === 'confirmation') {
    return text(res, 200, process.env.VK_CONFIRMATION_STRING || '');
  }

  // Acknowledge VK immediately. The preserved worker executes the existing
  // market, session, listing and admin logic after the HTTP response.
  text(res, 200, 'ok');
  waitUntil(runWorker(event));
};
