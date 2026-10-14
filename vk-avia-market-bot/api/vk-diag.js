const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';
const VK_GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const PRIMARY_PEER_ID = Number(process.env.VK_PRIMARY_PEER_ID || 0);
const CLEANUP_USER_ID = Number(process.env.VK_CLEANUP_USER_ID || 0);

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
    callback_servers: null,
    callback_settings: [],
  };

  try {
    const servers = await vkApi('groups.getCallbackServers', { group_id: VK_GROUP_ID });
    out.callback_servers = servers;
    const items = Array.isArray(servers?.items) ? servers.items : [];
    for (const item of items) {
      if (!item?.id) continue;
      try {
        const settings = await vkApi('groups.getCallbackSettings', { group_id: VK_GROUP_ID, server_id: item.id });
        out.callback_settings.push({ server_id: item.id, settings });
      } catch (error) {
        out.callback_settings.push({ server_id: item.id, error_code: error.code || null, error: error.message });
      }
    }
  } catch (error) {
    out.ok = false;
    out.callback_error = { code: error.code || null, message: error.message };
  }

  return res.end(JSON.stringify(out));
};
