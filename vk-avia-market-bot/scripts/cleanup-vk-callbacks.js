const API_VERSION = process.env.VK_API_VERSION || '5.199';
const GROUP_ID = Number(process.env.VK_GROUP_ID || 0);
const TOKEN = process.env.VK_TOKEN || '';
const CANONICAL_URL = 'https://project-xj41n.vercel.app/api/vk-callback';

async function vkApi(method, params = {}) {
  const body = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    access_token: TOKEN,
    v: API_VERSION,
  });
  const response = await fetch(`https://api.vk.com/method/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const code = data?.error?.error_code || response.status;
    const message = data?.error?.error_msg || `HTTP ${response.status}`;
    const error = new Error(`${method}: ${code} ${message}`);
    error.code = code;
    throw error;
  }
  return data.response;
}

const normalize = (url) => String(url || '').replace(/\/$/, '');

function isOldAviaMarketServer(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (normalize(`${parsed.origin}${parsed.pathname}`) === CANONICAL_URL) return false;
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const aviaHost = host.endsWith('.vercel.app') && (
      host.includes('vk-avia-market') || host.includes('my-agent-air') || host.includes('project-xj41n')
    );
    return aviaHost && path.includes('/api/vk-');
  } catch {
    return false;
  }
}

(async () => {
  if (!GROUP_ID || !TOKEN) {
    console.log('VK_CALLBACK_MIGRATION skipped: VK_GROUP_ID or VK_TOKEN missing');
    return;
  }

  try {
    let result = await vkApi('groups.getCallbackServers', { group_id: GROUP_ID });
    let items = Array.isArray(result?.items) ? result.items : [];
    console.log(`VK_CALLBACK_MIGRATION found=${items.length}`);

    let canonical = items.filter((item) => normalize(item?.url) === CANONICAL_URL);
    console.log(`VK_CALLBACK_MIGRATION canonical_before=${canonical.length}`);

    if (!canonical.length && items.length === 1) {
      const current = items[0];
      await vkApi('groups.editCallbackServer', {
        group_id: GROUP_ID,
        server_id: Number(current.id),
        url: CANONICAL_URL,
        title: 'Avia Market Bot v2',
      });
      console.log(`VK_CALLBACK_MIGRATION edited_server_id=${Number(current.id)}`);

      result = await vkApi('groups.getCallbackServers', { group_id: GROUP_ID });
      items = Array.isArray(result?.items) ? result.items : [];
      canonical = items.filter((item) => normalize(item?.url) === CANONICAL_URL);
    }

    if (!canonical.length) {
      console.log('VK_CALLBACK_MIGRATION stopped: canonical server still missing; nothing deleted');
      return;
    }

    const stale = items.filter((item) => isOldAviaMarketServer(item?.url));
    console.log(`VK_CALLBACK_MIGRATION stale=${stale.length}`);
    for (const item of stale) {
      await vkApi('groups.deleteCallbackServer', {
        group_id: GROUP_ID,
        server_id: Number(item.id),
      });
      console.log(`VK_CALLBACK_MIGRATION deleted_server_id=${Number(item.id)}`);
    }

    const after = await vkApi('groups.getCallbackServers', { group_id: GROUP_ID });
    const afterItems = Array.isArray(after?.items) ? after.items : [];
    const canonicalAfter = afterItems.filter((item) => normalize(item?.url) === CANONICAL_URL);
    const staleAfter = afterItems.filter((item) => isOldAviaMarketServer(item?.url));
    console.log(`VK_CALLBACK_MIGRATION verified canonical=${canonicalAfter.length} stale=${staleAfter.length} total=${afterItems.length}`);
  } catch (error) {
    console.log(`VK_CALLBACK_MIGRATION failed code=${error?.code || 'unknown'} message=${String(error?.message || error).slice(0, 240)}`);
  }
})();
