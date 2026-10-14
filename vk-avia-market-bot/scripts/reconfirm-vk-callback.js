const API_VERSION = process.env.VK_API_VERSION || '5.199';
const GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const TOKEN = process.env.VK_TOKEN || '';
const URL = 'https://project-xj41n.vercel.app/api/vk-callback?v=2';

async function vkApi(method, params = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, access_token: TOKEN, v: API_VERSION })) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok || data?.error) {
    const error = new Error(data?.error?.error_msg || `HTTP ${response.status}`);
    error.code = data?.error?.error_code || response.status;
    throw error;
  }
  return data?.response;
}

(async () => {
  if (!GROUP_ID || !TOKEN) {
    console.log('VK_RECONFIRM skipped missing_config');
    return;
  }
  try {
    const servers = await vkApi('groups.getCallbackServers', { group_id: GROUP_ID });
    const items = Array.isArray(servers?.items) ? servers.items : [];
    const server = items[0];
    if (!server?.id) {
      console.log('VK_RECONFIRM server_missing');
      return;
    }

    await vkApi('groups.editCallbackServer', {
      group_id: GROUP_ID,
      server_id: Number(server.id),
      url: URL,
      title: 'AviaMarket v2',
    });

    await vkApi('groups.setCallbackSettings', {
      group_id: GROUP_ID,
      server_id: Number(server.id),
      api_version: API_VERSION,
      message_new: 1,
      message_event: 1,
      message_allow: 1,
      message_deny: 1,
    });

    const after = await vkApi('groups.getCallbackServers', { group_id: GROUP_ID, server_ids: Number(server.id) });
    const current = Array.isArray(after?.items) ? after.items[0] : null;
    console.log(`VK_RECONFIRM status=${String(current?.status || 'unknown')} server_id=${Number(server.id)}`);
  } catch (error) {
    console.log(`VK_RECONFIRM failed code=${error?.code || 'unknown'} message=${String(error?.message || error).slice(0, 180)}`);
  }
})();
