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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    error.retryable = true;
    error.cause = cause;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Storage ${action} HTTP ${response.status}`);
    error.code = data?.code || data?.error || `storage_http_${response.status}`;
    error.status = response.status;
    error.retryable = response.status >= 500;
    throw error;
  }
  return data;
}

async function callStorageSafe(action, params = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await callStorage(action, params);
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt >= attempts) throw error;
      await sleep(150 * attempt);
    }
  }
  throw lastError;
}

async function health(timeoutMs = 4000) {
  const config = configError();
  if (config) throw config;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(STORAGE_URL, { signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const error = new Error(`Storage health HTTP ${response.status}`);
      error.code = `storage_health_${response.status}`;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function setMode(userId, mode) {
  return callStorageSafe('set_mode', { user_id: Number(userId), mode: String(mode) });
}

async function getMode(userId) {
  return callStorageSafe('get_mode', { user_id: Number(userId) });
}

async function clearMode(userId) {
  return callStorageSafe('clear_mode', { user_id: Number(userId) });
}

async function createListing(userId, text) {
  return callStorage('create_listing', { user_id: Number(userId), text: String(text || '') });
}

async function finalizeListing(listingId, userId, state, refs = {}, failureCode = null) {
  return callStorageSafe('finalize_listing', {
    listing_id: Number(listingId),
    user_id: Number(userId),
    state: String(state),
    vk_message_id: refs?.message_id == null ? null : Number(refs.message_id),
    vk_conversation_message_id: refs?.conversation_message_id == null ? null : Number(refs.conversation_message_id),
    failure_code: failureCode == null ? null : String(failureCode).slice(0, 120),
  });
}

async function listUser(userId, kind = null, limit = 10) {
  return callStorageSafe('list_user', { user_id: Number(userId), kind: kind || null, limit: Number(limit) || 10 });
}

async function listRecent(kind = null, limit = 10) {
  return callStorageSafe('list_recent', { kind: kind || null, limit: Number(limit) || 10 });
}

async function stats(userId) {
  return callStorageSafe('stats', { user_id: Number(userId) });
}

async function getProfile(userId) {
  return callStorageSafe('get_profile', { user_id: Number(userId) });
}

async function setProfile(userId, profile = {}) {
  return callStorageSafe('set_profile', {
    user_id: Number(userId),
    company: profile?.company == null ? null : String(profile.company),
    phone: profile?.phone == null ? null : String(profile.phone),
    telegram: profile?.telegram == null ? null : String(profile.telegram),
  });
}

async function getOwnListing(userId, listingId) {
  return callStorageSafe('get_listing_owner', { user_id: Number(userId), listing_id: Number(listingId) });
}

async function updateOwnListing(userId, listingId, text, refs = {}) {
  return callStorageSafe('update_own_listing', {
    user_id: Number(userId),
    listing_id: Number(listingId),
    text: String(text || ''),
    vk_message_id: refs?.message_id == null ? null : Number(refs.message_id),
    vk_conversation_message_id: refs?.conversation_message_id == null ? null : Number(refs.conversation_message_id),
  });
}

async function deleteOwnListing(userId, listingId) {
  return callStorageSafe('delete_own_listing', { user_id: Number(userId), listing_id: Number(listingId) });
}

async function trackBotMessage(purpose, refs = {}) {
  return callStorageSafe('track_bot_message', {
    purpose: String(purpose || 'menu').slice(0, 40),
    vk_message_id: refs?.message_id == null ? null : Number(refs.message_id),
    vk_conversation_message_id: refs?.conversation_message_id == null ? null : Number(refs.conversation_message_id),
  });
}

async function listCleanupTargets(limit = 500) {
  return callStorageSafe('list_cleanup_targets', { limit: Number(limit) || 500 });
}

async function markDeleted(listingIds = [], botMessageIds = []) {
  return callStorageSafe('mark_deleted', {
    listing_ids: Array.isArray(listingIds) ? listingIds.map(Number).filter((x) => Number.isFinite(x) && x > 0) : [],
    bot_message_ids: Array.isArray(botMessageIds) ? botMessageIds.map(Number).filter((x) => Number.isFinite(x) && x > 0) : [],
  });
}

async function checkChatDuplicate(userId, peerId, text) {
  return callStorageSafe('check_chat_duplicate', {
    user_id: Number(userId),
    peer_id: Number(peerId),
    text: String(text || ''),
  });
}

module.exports = {
  callStorage,
  health,
  setMode,
  getMode,
  clearMode,
  createListing,
  finalizeListing,
  listUser,
  listRecent,
  stats,
  getProfile,
  setProfile,
  getOwnListing,
  updateOwnListing,
  deleteOwnListing,
  trackBotMessage,
  listCleanupTargets,
  markDeleted,
  checkChatDuplicate,
};
