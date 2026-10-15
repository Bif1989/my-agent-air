const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const { processEvent } = require('../lib/market');
const { vkApi, sendMessage } = require('../lib/vk');
const { privateHome, adminHome } = require('../lib/ui');

const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const ADMIN_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();
const CALLBACK_URL = 'https://project-xj41n.vercel.app/api/vk-callback?v=2';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function secretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH) return sha256(event.secret) === CALLBACK_SECRET_HASH;
  return Boolean(process.env.VK_SECRET && event.secret === process.env.VK_SECRET);
}

function text(res, status, value) {
  res.status(status).setHeader('content-type', 'text/plain; charset=utf-8');
  res.end(String(value));
}

function json(res, status, body) {
  res.status(status).setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function getConfirmationCode() {
  const result = await vkApi('groups.getCallbackConfirmationCode', { group_id: VK_GROUP_ID });
  return String(result?.code || process.env.VK_CONFIRMATION_STRING || '');
}

async function repairCallbackServer() {
  const servers = await vkApi('groups.getCallbackServers', { group_id: VK_GROUP_ID });
  const items = Array.isArray(servers?.items) ? servers.items : [];
  const server = items[0];
  if (!server?.id) throw new Error('callback_server_missing');

  await vkApi('groups.editCallbackServer', {
    group_id: VK_GROUP_ID,
    server_id: Number(server.id),
    url: CALLBACK_URL,
    title: 'AviaMarket v2',
  });

  await vkApi('groups.setCallbackSettings', {
    group_id: VK_GROUP_ID,
    server_id: Number(server.id),
    api_version: process.env.VK_API_VERSION || '5.199',
    message_new: 1,
    message_event: 1,
    message_allow: 1,
    message_deny: 1,
  });

  const after = await vkApi('groups.getCallbackServers', {
    group_id: VK_GROUP_ID,
    server_ids: Number(server.id),
  });
  const current = Array.isArray(after?.items) ? after.items[0] : null;
  return {
    server_id: Number(server.id),
    status: String(current?.status || 'unknown'),
    url: String(current?.url || ''),
  };
}

function adminPrivateCommand(event) {
  if (event?.type !== 'message_new' || !ADMIN_USER_ID) return null;
  const msg = event?.object?.message || {};
  const userId = Number(msg?.from_id || 0);
  const peerId = Number(msg?.peer_id || 0);
  if (!userId || userId !== ADMIN_USER_ID || peerId !== userId || Number(msg?.out || 0) === 1) return null;
  const command = String(msg?.text || '').trim().toLowerCase();
  if (['/start', '/menu', '/help', 'menu'].includes(command)) return 'home';
  if (command === '/admin') return 'admin';
  return null;
}

async function processEventWithAdminUi(event) {
  const adminCommand = adminPrivateCommand(event);
  if (adminCommand === 'home') {
    const home = privateHome();
    const admin = adminHome();
    await sendMessage(ADMIN_USER_ID, home.text, home.keyboard);
    await sendMessage(ADMIN_USER_ID, admin.text, admin.keyboard);
    return;
  }
  if (adminCommand === 'admin') {
    const admin = adminHome();
    await sendMessage(ADMIN_USER_ID, admin.text, admin.keyboard);
    return;
  }
  return processEvent(event);
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    if (String(req.query?.repair || '') === '1') {
      const key = String(req.query?.key || '').trim().toLowerCase();
      if (!CALLBACK_SECRET_HASH || key !== CALLBACK_SECRET_HASH) {
        return json(res, 403, { ok: false, error: 'forbidden' });
      }
      try {
        const result = await repairCallbackServer();
        return json(res, 200, { ok: true, repair: result });
      } catch (error) {
        return json(res, 500, {
          ok: false,
          error: 'repair_failed',
          code: error?.code || null,
          message: error?.message || String(error),
        });
      }
    }

    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: '2.1.1',
      architecture: 'protected-edge-storage',
      duplicate_guard_hours: 24,
      rate_limit_seconds: 30,
      fast_ack: true,
      dynamic_confirmation: true,
      admin_ui: 'private-only',
      group_configured: VK_GROUP_ID > 0,
      security: CALLBACK_SECRET_HASH ? 'sha256' : 'legacy-secret',
    });
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });
  const event = req.body || {};
  if (Number(event.group_id || 0) !== VK_GROUP_ID) return text(res, 200, 'ok');

  if (event.type === 'confirmation') {
    try {
      return text(res, 200, await getConfirmationCode());
    } catch (error) {
      console.error('confirmation_code_failed', { code: error?.code || null, message: error?.message || String(error) });
      return text(res, 200, process.env.VK_CONFIRMATION_STRING || '');
    }
  }

  if (!secretOk(event)) return json(res, 403, { ok: false, error: 'forbidden' });

  text(res, 200, 'ok');
  waitUntil(Promise.resolve(processEventWithAdminUi(event)).catch((error) => {
    console.error('event_processing_failed', {
      type: event?.type || null,
      code: error?.code || null,
      message: error?.message || String(error),
    });
  }));
};
