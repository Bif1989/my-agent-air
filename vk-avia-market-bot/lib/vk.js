const VK_API_VERSION = process.env.VK_API_VERSION || '5.199';

function randomId() {
  return Math.floor(Math.random() * 2147483647);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function vkApi(method, params = {}) {
  if (!process.env.VK_TOKEN) {
    const error = new Error('VK_TOKEN is not configured');
    error.code = 'config';
    throw error;
  }
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
    }, 6000);
  } catch (cause) {
    const error = new Error(`VK ${method} network timeout`);
    error.code = 'network';
    error.cause = cause;
    throw error;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error) {
    const error = new Error(data?.error?.error_msg || `VK ${method} HTTP ${response.status}`);
    error.code = data?.error?.error_code || response.status;
    throw error;
  }
  return data?.response;
}

async function sendMessage(peerId, message, keyboard) {
  const params = { peer_id: Number(peerId), random_id: randomId(), message: String(message).slice(0, 4000), disable_mentions: 1 };
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
    await vkApi('messages.delete', { peer_id: Number(peerId), cmids: Number(conversationMessageId), delete_for_all: 1 });
    return true;
  } catch (error) {
    console.warn('delete_message_failed', { code: error?.code || null });
    return false;
  }
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
  } catch {
    return null;
  }
}

async function pinMessage(peerId, sendResult) {
  const cmid = Number(sendResult?.conversation_message_id || 0);
  const messageId = typeof sendResult === 'number' ? Number(sendResult) : Number(sendResult?.message_id || 0);
  try {
    if (cmid) {
      await vkApi('messages.pin', { peer_id: Number(peerId), conversation_message_id: cmid });
      return true;
    }
    if (messageId) {
      await vkApi('messages.pin', { peer_id: Number(peerId), message_id: messageId });
      return true;
    }
  } catch (error) {
    console.warn('pin_message_failed', { code: error?.code || null });
  }
  return false;
}

module.exports = { vkApi, sendMessage, answerEvent, deleteMessage, getHistory, getUserName, getInviteLink, pinMessage };
