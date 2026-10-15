const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';

function randomId() {
  return Math.floor(Math.random() * 2147483647);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function retryableVkError(code, httpStatus) {
  const numeric = Number(code || 0);
  return numeric === 6 || numeric === 10 || Number(httpStatus) === 429 || Number(httpStatus) >= 500;
}

async function vkApi(method, params = {}, attempts = 3) {
  if (!process.env.VK_TOKEN) {
    const error = new Error('VK_TOKEN is not configured');
    error.code = 'config';
    throw error;
  }

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...params, access_token: process.env.VK_TOKEN, v: VK_API_VERSION })) {
      if (value !== undefined && value !== null) body.set(key, String(value));
    }

    let response;
    try {
      response = await fetchWithTimeout(`https://api.vk.com/method/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      }, 7000);
    } catch (cause) {
      const error = new Error(`VK ${method} network timeout`);
      error.code = 'network';
      error.cause = cause;
      lastError = error;
      if (attempt >= attempts) throw error;
      await sleep(150 * attempt);
      continue;
    }

    const data = await response.json().catch(() => null);
    if (response.ok && !data?.error) return data?.response;

    const error = new Error(data?.error?.error_msg || `VK ${method} HTTP ${response.status}`);
    error.code = data?.error?.error_code || response.status;
    error.httpStatus = response.status;
    lastError = error;
    if (!retryableVkError(error.code, response.status) || attempt >= attempts) throw error;
    await sleep(150 * attempt);
  }
  throw lastError;
}

function messageRef(result) {
  if (typeof result === 'number') {
    return { message_id: Number(result) || null, conversation_message_id: null };
  }
  return {
    message_id: Number(result?.message_id || 0) || null,
    conversation_message_id: Number(result?.conversation_message_id || 0) || null,
  };
}

async function sendMessage(peerId, message, keyboard) {
  const params = {
    peer_id: Number(peerId),
    random_id: randomId(),
    message: String(message).slice(0, 4000),
    disable_mentions: 1,
  };
  if (keyboard) params.keyboard = JSON.stringify(keyboard);
  return vkApi('messages.send', params);
}

async function answerEvent(obj, text) {
  if (!obj?.event_id || !obj?.user_id || !obj?.peer_id) return false;
  try {
    await vkApi('messages.sendMessageEventAnswer', {
      event_id: obj.event_id,
      user_id: obj.user_id,
      peer_id: obj.peer_id,
      event_data: JSON.stringify({ type: 'show_snackbar', text: String(text).slice(0, 90) }),
    });
    return true;
  } catch (error) {
    console.warn('event_answer_failed', { code: error?.code || null });
    return false;
  }
}

async function deleteMessage(peerId, conversationMessageId) {
  if (!conversationMessageId) return false;
  try {
    await vkApi('messages.delete', {
      peer_id: Number(peerId),
      cmids: Number(conversationMessageId),
      delete_for_all: 1,
    });
    return true;
  } catch (error) {
    console.warn('delete_message_failed', { code: error?.code || null });
    return false;
  }
}

async function deleteMessageRefs(peerId, refs = []) {
  const valid = Array.isArray(refs) ? refs.filter(Boolean) : [];
  const messageIds = valid.filter((ref) => Number(ref?.message_id || 0) > 0).map((ref) => Number(ref.message_id));
  const cmids = valid.filter((ref) => !Number(ref?.message_id || 0) && Number(ref?.conversation_message_id || 0) > 0).map((ref) => Number(ref.conversation_message_id));

  if (messageIds.length) {
    await vkApi('messages.delete', {
      message_ids: messageIds.join(','),
      delete_for_all: 1,
    });
  }
  if (cmids.length) {
    await vkApi('messages.delete', {
      peer_id: Number(peerId),
      cmids: cmids.join(','),
      delete_for_all: 1,
    });
  }
  return { deleted: messageIds.length + cmids.length, message_ids: messageIds, cmids };
}

async function getHistory(peerId, count = 50, offset = 0) {
  const response = await vkApi('messages.getHistory', {
    peer_id: Number(peerId),
    count: Math.min(Math.max(Number(count) || 50, 1), 200),
    offset: Math.max(Number(offset) || 0, 0),
    rev: 0,
  });
  return Array.isArray(response?.items) ? response.items : [];
}

async function getUserName(userId) {
  if (!userId) return 'Agent';
  try {
    const response = await vkApi('users.get', { user_ids: Number(userId) });
    const user = Array.isArray(response) ? response[0] : null;
    const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
    return name || `ID ${userId}`;
  } catch {
    return `ID ${userId}`;
  }
}

async function getInviteLink(peerId) {
  try {
    const response = await vkApi('messages.getInviteLink', { peer_id: Number(peerId), reset: 0 });
    return response?.link || null;
  } catch (error) {
    console.warn('invite_link_failed', { code: error?.code || null });
    return null;
  }
}

async function getPinnedMessage(peerId) {
  try {
    const response = await vkApi('messages.getConversationsById', { peer_ids: Number(peerId), extended: 0 });
    const item = Array.isArray(response?.items) ? response.items[0] : null;
    return item?.chat_settings?.pinned_message || null;
  } catch (error) {
    console.warn('pinned_message_check_failed', { code: error?.code || null });
    return null;
  }
}

async function pinMessage(peerId, sendResult, options = {}) {
  const ref = messageRef(sendResult);
  const primaryPeerId = Number(process.env.VK_PRIMARY_PEER_ID || 0);
  const force = Boolean(options?.force);
  try {
    // Diagnostics should not replace the permanent public rules pin.
    // Explicit admin refresh passes force=true and must replace the old pin.
    if (!force && primaryPeerId > 0 && Number(peerId) === primaryPeerId) {
      const current = await getPinnedMessage(peerId);
      if (current) return true;
    }
    if (ref.conversation_message_id) {
      await vkApi('messages.pin', {
        peer_id: Number(peerId),
        conversation_message_id: ref.conversation_message_id,
      });
      return true;
    }
    if (ref.message_id) {
      await vkApi('messages.pin', {
        peer_id: Number(peerId),
        message_id: ref.message_id,
      });
      return true;
    }
  } catch (error) {
    console.warn('pin_message_failed', { code: error?.code || null });
  }
  return false;
}

async function unpinMessage(peerId) {
  const primaryPeerId = Number(process.env.VK_PRIMARY_PEER_ID || 0);
  // The primary market chat keeps one permanent pinned rules message.
  if (primaryPeerId > 0 && Number(peerId) === primaryPeerId) return true;
  try {
    await vkApi('messages.unpin', { peer_id: Number(peerId) });
    return true;
  } catch (error) {
    console.warn('unpin_message_failed', { code: error?.code || null });
    return false;
  }
}

module.exports = {
  vkApi,
  messageRef,
  sendMessage,
  answerEvent,
  deleteMessage,
  deleteMessageRefs,
  getHistory,
  getUserName,
  getInviteLink,
  getPinnedMessage,
  pinMessage,
  unpinMessage,
};
