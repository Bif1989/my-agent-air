"use client";

import { useEffect, useState } from "react";
import { disablePushNotifications, enablePushNotifications, getExistingPushSubscription, getNotificationPermission, isPushSupported } from "@/lib/push-notifications";
import { DEFAULT_NOTIFICATION_PREFERENCES, getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from "@/app/profile/notification-preferences-api";

const toggleItems: { key: keyof NotificationPreferences; label: string }[] = [
  { key: "chat_messages", label: "Chat xabarlari" },
  { key: "deal_messages", label: "Bitim xabarlari" },
  { key: "offers", label: "Takliflar" },
  { key: "new_requests", label: "Yangi so‘rovlar" },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`relative h-7 w-12 shrink-0 rounded-full transition focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-blue-600" : "bg-slate-300"}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`} />
    </button>
  );
}

export default function NotificationSettings() {
  const [supported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPermission(getNotificationPermission());
      getExistingPushSubscription().then((subscription) => setIsSubscribed(Boolean(subscription))).catch(() => undefined);
      getNotificationPreferences().then(setPreferences).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleEnable() {
    setIsWorking(true); setError(""); setMessage("");
    try {
      await enablePushNotifications();
      setIsSubscribed(true);
      setPermission(getNotificationPermission());
      setMessage("Bildirishnomalar yoqildi.");
    } catch (enableError) {
      const reason = enableError instanceof Error ? enableError.message : "";
      setError(reason === "PUSH_PERMISSION_DENIED" ? "Brauzer bildirishnomalarga ruxsat bermadi." : reason === "PUSH_NOT_CONFIGURED" ? "Bildirishnomalar hozircha sozlanmagan." : "Bildirishnomalarni yoqib bo‘lmadi.");
    } finally { setIsWorking(false); }
  }

  async function handleDisable() {
    setIsWorking(true); setError("");
    try {
      await disablePushNotifications();
      setIsSubscribed(false);
      setMessage("Bildirishnomalar o‘chirildi.");
    } catch { setError("Bildirishnomalarni o‘chirib bo‘lmadi."); } finally { setIsWorking(false); }
  }

  async function togglePreference(key: keyof NotificationPreferences, value: boolean) {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    try { await updateNotificationPreferences(next); } catch { setError("Sozlamani saqlab bo‘lmadi."); setPreferences(previous); }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold text-[#0b1f3a]">Bildirishnomalar</h2>
      <p className="mt-2 text-sm text-slate-500">My Agent Air tabida bo‘lmasangiz ham, muhim hodisalar uchun brauzer/OS bildirishnomasi oling.</p>
      {!supported ? <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Bu brauzer push bildirishnomalarini qo‘llab-quvvatlamaydi.</p> : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {isSubscribed
            ? <button type="button" onClick={handleDisable} disabled={isWorking} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-red-300 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">{isWorking ? "Bajarilmoqda..." : "Bildirishnomalarni o‘chirish"}</button>
            : <button type="button" onClick={handleEnable} disabled={isWorking || permission === "denied"} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isWorking ? "Yoqilmoqda..." : "Bildirishnomalarni yoqish"}</button>}
          {permission === "denied" && <span className="text-sm text-red-600">Brauzer sozlamalarida bildirishnomalarga ruxsat bering.</span>}
        </div>
      )}
      {(error || message) && <p className={`mt-3 text-sm ${error ? "text-red-600" : "text-emerald-700"}`} role="status">{error || message}</p>}
      <div className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
        {toggleItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 py-4">
            <span className="text-sm font-medium text-[#0b1f3a]">{item.label}</span>
            <Toggle checked={preferences[item.key]} onChange={(value) => togglePreference(item.key, value)} />
          </div>
        ))}
      </div>
    </section>
  );
}
