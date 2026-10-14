const API_VERSION = process.env.VK_API_VERSION || '5.199';
const GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const TOKEN = process.env.VK_TOKEN || '';
const CANONICAL_URL = 'https://project-xj41n.vercel.app/api/vk-callback';

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
    console.log('VK_REPAIR skipped missing_config');
    return;
  }
  try {
    const servers = await vkApi('groups.getCallbackServers', { group_id: GROUP_ID });
    const items = Array.isArray(servers?.items) ? servers.items : [];
    const server = items.find((item) => String(item?.url || '').replace(/\/$/, '') === CANONICAL_URL);
    if (!server) {
      console.log(`VK_REPAIR server_missing total=${items.length}`);
      return;
    }
    console.log(`VK_REPAIR server_id=${Number(server.id)} status=${String(server.status || 'unknown')}`);

    let before = null;
    try {
      before = await vkApi('groups.getCallbackSettings', { group_id: GROUP_ID, server_id: Number(server.id) });
      console.log(`VK_REPAIR before message_new=${Number(before?.events?.message_new || 0)} message_event=${Number(before?.events?.message_event || 0)} api_version=${String(before?.api_version || '')}`);
    } catch (error) {
      console.log(`VK_REPAIR get_settings_failed code=${error?.code || 'unknown'}`);
    }

    await vkApi('groups.setCallbackSettings', {
      group_id: GROUP_ID,
      server_id: Number(server.id),
      api_version: API_VERSION,
      message_new: 1,
      message_event: 1,
      message_allow: 1,
      message_deny: 1,
    });

    const after = await vkApi('groups.getCallbackSettings', { group_id: GROUP_ID, server_id: Number(server.id) });
    console.log(`VK_REPAIR after message_new=${Number(after?.events?.message_new || 0)} message_event=${Number(after?.events?.message_event || 0)} api_version=${String(after?.api_version || '')}`);
  } catch (error) {
    console.log(`VK_REPAIR failed code=${error?.code || 'unknown'} message=${String(error?.message || error).slice(0, 220)}`);
  }
})();
