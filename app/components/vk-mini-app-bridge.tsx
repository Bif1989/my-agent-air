"use client";

import { useEffect, useState } from "react";
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

type VkDebugUser = {
  firstName: string;
  lastName: string;
  vkUserId: string;
  verified: boolean;
};

export default function VkMiniAppBridge() {
  const [debugUser, setDebugUser] = useState<VkDebugUser | null>(null);

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

      const launchParamsObject = Object.fromEntries(launchParams.entries());
      const verifyResponse = await fetch("/api/auth/vk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(launchParamsObject),
      });
      const verifyResult = await verifyResponse.json();

      console.log("VK launch params verification", verifyResult);

      setDebugUser({
        firstName: userInfo.first_name,
        lastName: userInfo.last_name,
        vkUserId,
        verified: verifyResult?.ok === true,
      });
    })().catch((error: unknown) => {
      console.error("VK Mini App bridge initialization failed", error);
    });
  }, []);

  if (!debugUser) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "6px 12px",
        background: "#2688eb",
        color: "#fff",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {debugUser.verified
        ? `VK xavfsiz tasdiqlandi: ${debugUser.firstName} ${debugUser.lastName} (ID: ${debugUser.vkUserId})`
        : "VK tasdiqlash xatosi"}
    </div>
  );
}