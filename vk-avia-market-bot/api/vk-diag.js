const crypto = require('crypto');

const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);
const CALLBACK_SECRET_HASH = String(process.env.VK_SECRET_SHA256 || '').trim().toLowerCase();

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function normalizeCommand(text) {
  return String(text || '')
    .replace(/^\[club\d+\|@[^\]]+\]\s*/i, '')
    .trim()
    .toLowerCase();
}

async function vkApi(method, params = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, access_token: process.env.VK_TOKEN, v: VK_API_VERSION })) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    const err = new Error(data?.error?.error_msg || `HTTP ${response.status}`);
    err.code = data?.error?.error_code || response.status;
    throw err;
  }
  return data?.response;
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }

  const out = {
    ok: true,
    group_id: VK_GROUP_ID,
    primary_peer_id: PRIMARY_PEER_ID,
    cleanup_user_configured: CLEANUP_USER_ID > 0,
    callback_secret_hash_configured: Boolean(CALLBACK_SECRET_HASH),
    callback_secret_hash_matches: null,
    callback_servers: null,
    callback_settings: [],
    recent_cleanup: null,
  };

  try {
    const servers = await vkApi('groups.getCallbackServers', { group_id: VK_GROUP_ID });
    const items = Array.isArray(servers?.items) ? servers.items : [];
    out.callback_servers = {
      count: Number(servers?.count || items.length || 0),
      items: items.map((item) => ({
        id: item?.id || null,
        title: item?.title || null,
        creator_id: item?.creator_id || null,
        url: item?.url || null,
        status: item?.status || null,
      })),
    };

    if (CALLBACK_SECRET_HASH && items[0]?.secret_key) {
      out.callback_secret_hash_matches = sha256(items[0].secret_key) === CALLBACK_SECRET_HASH;
    }

    for (const item of items) {
      if (!item?.id) continue;
      try {
        const settings = await vkApi('groups.getCallbackSettings', { group_id: VK_GROUP_ID, server_id: item.id });
        out.callback_settings.push({ server_id: item.id, settings });
      } catch (error) {
        out.callback_settings.push({ server_id: item.id, error_code: error.code || null, error: error.message });
      }
    }

    try {
      const history = await vkApi('messages.getHistory', { peer_id: PRIMARY_PEER_ID, count: 100, rev: 0 });
      const messages = Array.isArray(history?.items) ? history.items : [];
      const hit = messages.find((item) => normalizeCommand(item?.text) === '/cleanall');
      out.recent_cleanup = hit ? {
        found: true,
        from_id: Number(hit?.from_id || 0),
        conversation_message_id: Number(hit?.conversation_message_id || 0),
        date: Number(hit?.date || 0),
        outgoing: Number(hit?.out || 0) === 1,
        owner_match: CLEANUP_USER_ID > 0 && Number(hit?.from_id || 0) === CLEANUP_USER_ID,
      } : { found: false };
    } catch (error) {
      out.recent_cleanup = { found: false, error_code: error.code || null, error: error.message };
    }
  } catch (error) {
    out.ok = false;
    out.callback_error = { code: error.code || null, message: error.message };
  }

  return res.end(JSON.stringify(out));
};
