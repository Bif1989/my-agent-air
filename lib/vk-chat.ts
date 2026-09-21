import bridge from "@vkontakte/vk-bridge";

export function getVkLaunchParams() {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  const params = new URLSearchParams(window.location.search);

  if (!params.has("vk_chat_id") && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
    hashParams.forEach((value, key) => params.set(key, value));
  }

  return params;
}

export function isVkCurrentChatAvailable() {
  if (typeof window === "undefined") return false;
  const chatId = getVkLaunchParams().get("vk_chat_id");
  if (!chatId) return false;
  const numeric = Number(chatId);
  return Number.isFinite(numeric) && numeric >= 0;
}

export function sendTextToCurrentVkChat(text: string) {
  if (typeof window === "undefined") return false;
  const chatId = getVkLaunchParams().get("vk_chat_id");
  if (!chatId) return false;
  const peerId = 2000000000 + Number(chatId);
  if (!Number.isFinite(peerId)) return false;

  void bridge.send("VKWebAppShowMessageBox", {
    peer_id: peerId,
    message: text,
  });

  return true;
}
