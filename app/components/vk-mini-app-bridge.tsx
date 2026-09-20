"use client";

import { useEffect } from "react";
import bridge from "@vkontakte/vk-bridge";

const VK_APP_ID = "54781128";

function getLaunchParams() {
  const params = new URLSearchParams(window.location.search);

  if (!params.has("vk_app_id") && window.location.hash) {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#\??/, ""));
    hashParams.forEach((value, key) => params.set(key, value));
  }

  return params;
}

export default function VkMiniAppBridge() {
  useEffect(() => {
    const launchParams = getLaunchParams();
    const vkAppId = launchParams.get("vk_app_id");
    const vkUserId = launchParams.get("vk_user_id");

    if (vkAppId !== VK_APP_ID || !vkUserId) {
      return;
    }

    void (async () => {
      await bridge.send("VKWebAppInit");
      const userInfo = await bridge.send("VKWebAppGetUserInfo");

      console.log("VK Mini App user", {
        vk_user_id: vkUserId,
        first_name: userInfo.first_name,
        last_name: userInfo.last_name,
      });
    })().catch((error: unknown) => {
      console.error("VK Mini App bridge initialization failed", error);
    });
  }, []);

  return null;
}