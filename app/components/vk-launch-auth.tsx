"use client";

import bridge from "@vkontakte/vk-bridge";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getVkLaunchParams } from "@/lib/vk-chat";
import { getStoredSession, refreshSession, saveSession, sessionNeedsRefresh } from "@/lib/supabase-auth";

type VkAuthResult = {
  ok?: boolean;
  access_token?: string;
  refresh_token?: string;
  user?: { id?: string; email?: string };
  error_code?: string;
};

export default function VkLaunchAuth() {
  const [isVk, setIsVk] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const params = getVkLaunchParams();
    if (params.get("vk_app_id") !== "54781128" || !/^\d{1,20}$/.test(params.get("vk_user_id") || "")) return;

    let cancelled = false;
    async function authenticate() {
      await Promise.resolve();
      if (cancelled) return;
      setIsVk(true);
      setError("");
      try {
        // Bridge initialization is useful for VK UI integration but is not an identity proof.
        // Do not block a valid signed launch or an existing session if VK bridge initialization is flaky.
        try {
          await bridge.send("VKWebAppInit");
        } catch {
          // Server-side signature verification below remains the source of truth for VK identity.
        }

        const stored = getStoredSession();
        if (stored) {
          let active: ReturnType<typeof getStoredSession> = stored;
          if (sessionNeedsRefresh(stored)) {
            active = await refreshSession().catch(() => null);
          }
          if (active) {
            if (cancelled) return;
            window.location.replace("/dashboard");
            return;
          }
        }

        let firstName = "";
        let lastName = "";
        let photoUrl = "";
        try {
          const info = await bridge.send("VKWebAppGetUserInfo");
          firstName = typeof info.first_name === "string" ? info.first_name : "";
          lastName = typeof info.last_name === "string" ? info.last_name : "";
          photoUrl = typeof info.photo_200 === "string" ? info.photo_200 : "";
        } catch {
          // Display data is optional. Identity is verified only from signed launch params on the server.
        }
        const payload = Object.fromEntries(params.entries());
        const response = await fetch("/api/auth/vk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, first_name: firstName, last_name: lastName, photo_url: photoUrl }),
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        const data = await response.json().catch(() => ({})) as VkAuthResult;
        if (!response.ok || !data.ok || !data.access_token || !data.refresh_token || !data.user?.id) throw new Error(data.error_code || "VK_LOGIN_FAILED");
        if (cancelled) return;
        saveSession({ access_token: data.access_token, refresh_token: data.refresh_token, user: { id: data.user.id, email: data.user.email } });
        window.location.replace("/dashboard");
      } catch (failure) {
        if (cancelled) return;
        const code = failure instanceof Error ? failure.message : "VK_LOGIN_FAILED";
        setError(code === "VK_NOT_CONFIGURED" ? "VK orqali kirish sozlamasi vaqtincha mavjud emas." : code === "STALE_LAUNCH_PARAMS" ? "VK oynasi eskirgan. Mini App'ni VK ichidan qayta oching." : "VK orqali kirib bo‘lmadi. Qayta urinib ko‘ring.");
      }
    }
    void authenticate();
    return () => { cancelled = true; };
  }, [attempt]);

  if (!isVk) return null;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-5 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-900">
      <Image src="/my-agent-air-icon.svg" alt="My Agent Air" width={64} height={64} className="mx-auto h-16 w-16" priority />
      <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">My Agent Air</h2>
      {!error ? <><p className="mt-2 text-sm text-slate-500 dark:text-slate-300">VK profilingiz orqali xavfsiz kirilmoqda…</p><div className="mx-auto mt-5 h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" /></> : <><p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p><button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Qayta urinish</button><a href="/login" className="mt-3 block text-sm font-semibold text-slate-500 underline">Oddiy kirish</a></>}
    </div>
  </div>;
}
