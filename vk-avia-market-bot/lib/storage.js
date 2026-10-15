const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const BOT_SECRET = process.env.SUPABASE_BOT_SECRET || '';

function configError() {
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_KEY) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (!BOT_SECRET) missing.push('SUPABASE_BOT_SECRET');
  if (!missing.length) return null;
  const error = new Error(`Storage is not configured: ${missing.join(', ')}`);
  error.code = 'storage_config';
  return error;
}

async function rpc(name, params = {}, timeoutMs = 5000) {
  const config = configError();
  if (config) throw config;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${SUPABASE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(params),
      signal: controller.signal,
    });
  } catch (cause) {
    const error = new Error(`Storage ${name} network timeout`);
    error.code = 'storage_network';
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || `Storage ${name} HTTP ${response.status}`);
    error.code = data?.code || `storage_http_${response.status}`;
    throw error;
  }
  return data;
}

const secretParams = (params = {}) => ({ p_secret: BOT_SECRET, ...params });

async function setMode(userId, mode) {
  return rpc('am_set_mode', secretParams({ p_user_id: Number(userId), p_mode: String(mode) }));
}

async function createListing(userId, text) {
  return rpc('am_create_listing', secretParams({ p_user_id: Number(userId), p_text: String(text || '') }));
}

async function finalizeListing(listingId, userId, state, vkMessageId = null, failureCode = null) {
  return rpc('am_finalize_listing', secretParams({
    p_listing_id: Number(listingId),
    p_user_id: Number(userId),
    p_state: String(state),
    p_vk_message_id: vkMessageId == null ? null : Number(vkMessageId),
    p_failure_code: failureCode == null ? null : String(failureCode).slice(0, 120),
  }));
}

async function listUser(userId, kind = null, limit = 10) {
  return rpc('am_list_user', secretParams({
    p_user_id: Number(userId),
    p_kind: kind || null,
    p_limit: Number(limit) || 10,
  }));
}

async function listRecent(kind = null, limit = 10) {
  return rpc('am_list_recent', secretParams({ p_kind: kind || null, p_limit: Number(limit) || 10 }));
}

async function stats(userId) {
  return rpc('am_stats', secretParams({ p_user_id: Number(userId) }));
}

module.exports = { rpc, setMode, createListing, finalizeListing, listUser, listRecent, stats };
