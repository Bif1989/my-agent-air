"use client";

import { useEffect, useState } from "react";
import { useUiSettings } from "@/lib/ui-settings";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "my-agent-air:pwa-install-dismissed";

function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosSafari() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const webkit = /webkit/i.test(ua);
  const excluded = /crios|fxios|edgios|opios/i.test(ua);
  return ios && webkit && !excluded;
}

export default function PwaInstall() {
  const { isRu } = useUiSettings();
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    if (isStandalone()) return;
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* no-op */ }
    if (dismissed) return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
      setVisible(true);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setShowIosHelp(false);
      setVisible(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIosSafari()) {
      const timer = window.setTimeout(() => {
        setShowIosHelp(true);
        setVisible(true);
      }, 1400);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  function dismiss() {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* no-op */ }
    setVisible(false);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setVisible(false);
    setPromptEvent(null);
  }

  if (!visible || (!promptEvent && !showIosHelp)) return null;

  return (
    <aside className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] mx-auto max-w-sm rounded-2xl border border-blue-200 bg-white/95 p-3 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95" role="dialog" aria-label={isRu ? "Установка приложения" : "Ilovani o‘rnatish"}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0b1f3a] text-sm font-bold text-cyan-200">AI</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0b1f3a] dark:text-slate-100">{isRu ? "Установить Agent Bifavia" : "Agent Bifavia ilovasini o‘rnating"}</p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            {showIosHelp
              ? (isRu ? "В Safari нажмите «Поделиться», затем «На экран Домой»." : "Safari’da “Ulashish” tugmasini bosing, keyin “Bosh ekranga qo‘shish”ni tanlang.")
              : (isRu ? "Откроется как отдельное приложение и останется на главном экране телефона." : "Telefon bosh ekranida alohida ilova kabi ochiladi.")}
          </p>
          <div className="mt-2 flex gap-2">
            {promptEvent && <button type="button" onClick={() => void install()} className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-blue-700">{isRu ? "Установить" : "O‘rnatish"}</button>}
            <button type="button" onClick={dismiss} className="rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-300">{isRu ? "Позже" : "Keyin"}</button>
          </div>
        </div>
      </div>
    </aside>
  );
}
