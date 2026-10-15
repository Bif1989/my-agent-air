const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const BOT_SECRET = process.env.SUPABASE_BOT_SECRET || '';
const STORAGE_URL = `${SUPABASE_URL}/functions/v1/avia-market-storage`;

function configError() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!BOT_SECRET) missing.push('SUPABASE_BOT_SECRET');
  if (!missing.length) return null;
  const error = new Error(`Storage is not configured: ${missing.join(', ')}`);
  error.code = 'storage_config';
  return error;
}

async function callStorage(action, params = {}, timeoutMs = 6000) {
  const config = configError();
  if (config) throw config;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(STORAGE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bot-secret': BOT_SECRET,
      },
      body: JSON.stringify({ action, ...params }),
      signal: controller.signal,
    });
  } catch (cause) {
    const error = new Error(`Storage ${action} network timeout`);
    error.code = 'storage_network';
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Storage ${action} HTTP ${response.status}`);
    error.code = data?.code || data?.error || `storage_http_${response.status}`;
    throw error;
  }
  return data;
}

async function setMode(userId, mode) {
  return callStorage('set_mode', { user_id: Number(userId), mode: String(mode) });
}

async function createListing(userId, text) {
  return callStorage('create_listing', { user_id: Number(userId), text: String(text || '') });
}

async function finalizeListing(listingId, userId, state, vkMessageId = null, failureCode = null) {
  return callStorage('finalize_listing', {
    listing_id: Number(listingId),
    user_id: Number(userId),
    state: String(state),
    vk_message_id: vkMessageId == null ? null : Number(vkMessageId),
    failure_code: failureCode == null ? null : String(failureCode).slice(0, 120),
  });
}

async function listUser(userId, kind = null, limit = 10) {
  return callStorage('list_user', { user_id: Number(userId), kind: kind || null, limit: Number(limit) || 10 });
}

async function listRecent(kind = null, limit = 10) {
  return callStorage('list_recent', { kind: kind || null, limit: Number(limit) || 10 });
}

async function stats(userId) {
  return callStorage('stats', { user_id: Number(userId) });
}

module.exports = { callStorage, setMode, createListing, finalizeListing, listUser, listRecent, stats };
