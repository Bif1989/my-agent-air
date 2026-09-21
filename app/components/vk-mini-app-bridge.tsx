"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import bridge from "@vkontakte/vk-bridge";
import { getStoredSession, saveSession } from "@/lib/supabase-auth";

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
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    window.setTimeout(() => {
      const launchParams = getLaunchParams();
      const vkAppId = launchParams.get("vk_app_id");
      const vkUserId = launchParams.get("vk_user_id");

      if (vkAppId !== VK_APP_ID || !vkUserId) {
        return;
      }

      // Already authenticated in this browser — avoid re-triggering VK login.
      if (getStoredSession()) {
        return;
      }

      void (async () => {
        await bridge.send("VKWebAppInit");
        const userInfo = await bridge.send("VKWebAppGetUserInfo");

        const launchParamsObject = Object.fromEntries(launchParams.entries());
        const loginResponse = await fetch("/api/auth/vk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...launchParamsObject,
            first_name: userInfo.first_name,
            last_name: userInfo.last_name,
            photo_url: userInfo.photo_200 ?? userInfo.photo_100 ?? "",
          }),
        });
        const loginResult = await loginResponse.json();

        if (!loginResponse.ok || loginResult?.ok !== true) {
          throw new Error("VK_LOGIN_FAILED");
        }

        saveSession(loginResult);
        router.push("/dashboard");
      })().catch((error: unknown) => {
        console.error("VK Mini App auto-login failed", error);
        setErrorMessage("VK orqali kirishda xatolik");
      });
    }, 0);
  }, [router]);

  if (!errorMessage) {
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
        background: "#c0392b",
        color: "#fff",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {errorMessage}
    </div>
  );
}