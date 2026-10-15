const crypto = require('crypto');
const { waitUntil } = require('@vercel/functions');
const { processEvent } = require('../lib/market');
const {
  vkApi,
  sendMessage,
  messageRef,
  deleteMessageRefs,
  pinMessage,
  unpinMessage,
  getInviteLink,
} = require('../lib/vk');
const storage = require('../lib/storage');
const { privateHome, adminHome } = require('../lib/ui');

const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const ADMIN_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();
const ADMIN_SECRET = String(process.env.VK_ADMIN_PUSH_SECRET || '');
const CALLBACK_URL = 'https://project-xj41n.vercel.app/api/vk-callback?v=2';
const PRIVATE_BOT_TITLE = '🔒 AVIA MARKET — SHAXSIY BOT';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function secretOk(event) {
  if (!event?.secret) return false;
  if (CALLBACK_SECRET_HASH) return sha256(event.secret) === CALLBACK_SECRET_HASH;
  return Boolean(process.env.VK_SECRET && event.secret === process.env.VK_SECRET);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function protectedGetOk(req) {
  const key = String(req.query?.key || '');
  return Boolean(ADMIN_SECRET && safeEqual(key, ADMIN_SECRET));
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

async function pushAdminMenu() {
  if (!ADMIN_USER_ID) throw new Error('admin_user_id_missing');
  const home = privateHome();
  const admin = adminHome();
  await sendMessage(ADMIN_USER_ID, home.text, home.keyboard);
  await sendMessage(ADMIN_USER_ID, admin.text, admin.keyboard);
  return { sent: true };
}

async function renamePrivateBot() {
  const result = await vkApi('groups.edit', {
    group_id: VK_GROUP_ID,
    title: PRIVATE_BOT_TITLE,
  });
  return { renamed: Boolean(result), title: PRIVATE_BOT_TITLE };
}

async function runSelfTest() {
  const checks = {};
  const failures = [];
  const warnings = [];

  const run = async (name, fn, { required = true } = {}) => {
    try {
      const details = await fn();
      checks[name] = { ok: true, ...(details && typeof details === 'object' ? details : { value: details }) };
      return details;
    } catch (error) {
      const result = { ok: false, code: error?.code || null, message: error?.message || String(error) };
      checks[name] = result;
      (required ? failures : warnings).push(name);
      return null;
    }
  };

  await run('config', async () => {
    const missing = [];
    if (!VK_GROUP_ID) missing.push('VK_GROUP_ID');
    if (!PRIMARY_PEER_ID) missing.push('VK_PRIMARY_PEER_ID');
    if (!ADMIN_USER_ID) missing.push('VK_CLEANUP_USER_ID');
    if (!CALLBACK_SECRET_HASH && !process.env.VK_SECRET) missing.push('VK callback secret');
    if (!ADMIN_SECRET) missing.push('VK_ADMIN_PUSH_SECRET');
    if (!process.env.VK_TOKEN) missing.push('VK_TOKEN');
    if (!process.env.SUPABASE_URL) missing.push('SUPABASE_URL');
    if (!process.env.SUPABASE_BOT_SECRET) missing.push('SUPABASE_BOT_SECRET');
    if (missing.length) {
      const error = new Error(`Missing configuration: ${missing.join(', ')}`);
      error.code = 'config';
      throw error;
    }
    return { configured: true };
  });

  await run('storage_health', async () => {
    const result = await storage.health();
    return { service: result?.service || null, version: result?.version || null };
  });

  await run('storage_read', async () => {
    const [stats, cleanup] = await Promise.all([
      storage.stats(ADMIN_USER_ID),
      storage.listCleanupTargets(10),
    ]);
    return {
      stats_ok: Boolean(stats?.ok),
      cleanup_targets_ok: Boolean(cleanup?.ok),
      cleanup_targets: Array.isArray(cleanup?.items) ? cleanup.items.length : null,
    };
  });

  await run('callback_server', async () => {
    const servers = await vkApi('groups.getCallbackServers', { group_id: VK_GROUP_ID });
    const items = Array.isArray(servers?.items) ? servers.items : [];
    const server = items.find((item) => String(item?.url || '').includes('/api/vk-callback')) || items[0];
    if (!server?.id || String(server?.status || '') !== 'ok') {
      const error = new Error(`Callback server status: ${server?.status || 'missing'}`);
      error.code = 'callback_not_ok';
      throw error;
    }
    return { status: String(server.status), url_ok: String(server.url || '').startsWith('https://project-xj41n.vercel.app/api/vk-callback') };
  });

  await run('community_identity', async () => {
    const response = await vkApi('groups.getById', { group_id: VK_GROUP_ID });
    const group = Array.isArray(response?.groups) ? response.groups[0] : Array.isArray(response) ? response[0] : response;
    const title = String(group?.name || '');
    if (title !== PRIVATE_BOT_TITLE) {
      const error = new Error(`Unexpected bot title: ${title || 'unknown'}`);
      error.code = 'title_mismatch';
      throw error;
    }
    return { title_ok: true };
  });

  await run('invite_link', async () => {
    const link = await getInviteLink(PRIMARY_PEER_ID);
    if (!link) {
      const error = new Error('VK did not return an invite link');
      error.code = 'invite_unavailable';
      throw error;
    }
    return { available: true };
  }, { required: false });

  await run('private_dm', async () => {
    const sent = await sendMessage(ADMIN_USER_ID, '🧪 AVIA MARKET TEXNIK TEST — SHAXSIY BOT\nBu xabar avtomatik test uchun yuborildi va o‘chiriladi.');
    const ref = messageRef(sent);
    if (!ref.message_id && !ref.conversation_message_id) {
      const error = new Error('DM send returned no message reference');
      error.code = 'missing_message_ref';
      throw error;
    }
    try {
      await deleteMessageRefs(ADMIN_USER_ID, [ref]);
    } catch (error) {
      warnings.push('private_dm_cleanup');
      checks.private_dm_cleanup = { ok: false, code: error?.code || null, message: error?.message || String(error) };
    }
    return { send_ok: true, cleanup_attempted: true, ref_type: ref.message_id ? 'message_id' : 'conversation_message_id' };
  });

  let groupProbeRef = null;
  let groupProbeSent = null;
  await run('group_send', async () => {
    groupProbeSent = await sendMessage(PRIMARY_PEER_ID, '🧪 AVIA MARKET TEXNIK TEST — UMUMIY CHAT\nBu xabar avtomatik test uchun yuborildi va o‘chiriladi.');
    groupProbeRef = messageRef(groupProbeSent);
    if (!groupProbeRef.message_id && !groupProbeRef.conversation_message_id) {
      const error = new Error('Group send returned no message reference');
      error.code = 'missing_message_ref';
      throw error;
    }
    await storage.trackBotMessage('selftest', groupProbeRef);
    return { send_ok: true, ref_type: groupProbeRef.message_id ? 'message_id' : 'conversation_message_id' };
  });

  if (groupProbeSent) {
    await run('group_pin', async () => {
      const pinned = await pinMessage(PRIMARY_PEER_ID, groupProbeSent);
      if (!pinned) {
        const error = new Error('VK did not allow pinning the test message');
        error.code = 'pin_unavailable';
        throw error;
      }
      return { pinned: true };
    }, { required: false });

    if (checks.group_pin?.ok) {
      await run('group_unpin', async () => {
        const unpinned = await unpinMessage(PRIMARY_PEER_ID);
        if (!unpinned) {
          const error = new Error('VK did not allow unpinning');
          error.code = 'unpin_unavailable';
          throw error;
        }
        return { unpinned: true };
      }, { required: false });
    }
  }

  if (groupProbeRef) {
    await run('group_delete', async () => {
      const deleted = await deleteMessageRefs(PRIMARY_PEER_ID, [groupProbeRef]);
      if (!Number(deleted?.deleted || 0)) {
        const error = new Error('No group test message was deleted');
        error.code = 'delete_failed';
        throw error;
      }
      return { deleted: Number(deleted.deleted) };
    });
  }

  return {
    ok: failures.length === 0,
    version: '2.2.0',
    failures,
    warnings,
    checks,
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
    await pushAdminMenu();
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
      if (!protectedGetOk(req)) return json(res, 403, { ok: false, error: 'forbidden' });
      try {
        const result = await repairCallbackServer();
        return json(res, 200, { ok: true, repair: result });
      } catch (error) {
        return json(res, 500, { ok: false, error: 'repair_failed', code: error?.code || null, message: error?.message || String(error) });
      }
    }

    if (String(req.query?.push_admin || '') === '1') {
      if (!protectedGetOk(req)) return json(res, 403, { ok: false, error: 'forbidden' });
      try {
        const result = await pushAdminMenu();
        return json(res, 200, { ok: true, ...result });
      } catch (error) {
        return json(res, 500, { ok: false, error: 'admin_push_failed', code: error?.code || null, message: error?.message || String(error) });
      }
    }

    if (String(req.query?.rename_bot || '') === '1') {
      if (!protectedGetOk(req)) return json(res, 403, { ok: false, error: 'forbidden' });
      try {
        const result = await renamePrivateBot();
        return json(res, 200, { ok: true, ...result });
      } catch (error) {
        return json(res, 500, { ok: false, error: 'rename_failed', code: error?.code || null, message: error?.message || String(error) });
      }
    }

    if (String(req.query?.selftest || '') === '1') {
      if (!protectedGetOk(req)) return json(res, 403, { ok: false, error: 'forbidden' });
      try {
        const result = await runSelfTest();
        return json(res, result.ok ? 200 : 503, result);
      } catch (error) {
        return json(res, 500, { ok: false, error: 'selftest_failed', code: error?.code || null, message: error?.message || String(error) });
      }
    }

    return json(res, 200, {
      ok: true,
      service: 'vk-avia-market-bot',
      version: '2.2.0',
      architecture: 'protected-edge-storage',
      duplicate_guard_hours: 24,
      stale_pending_recovery_minutes: 5,
      rate_limit_seconds: 30,
      fast_ack: true,
      dynamic_confirmation: true,
      admin_ui: 'private-only',
      cleanup_strategy: 'tracked-message-refs',
      selftest: true,
      group_configured: VK_GROUP_ID > 0,
      security: CALLBACK_SECRET_HASH ? 'sha256-callback+separate-admin-key' : 'legacy-secret+separate-admin-key',
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
