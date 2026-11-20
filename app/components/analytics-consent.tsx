"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ANALYTICS_PREFERENCE_EVENT, ANALYTICS_SETTINGS_EVENT, isAnalyticsLandingPage,
  readAnalyticsChoice, serializeAnalyticsChoice, type AnalyticsChoice,
} from "@/lib/landing-analytics-consent";
import { renderAnalyticsFrame, type LandingAnalyticsConfig } from "@/lib/landing-analytics";
import { useUiSettings } from "@/lib/ui-settings";

const readChoice = () => readAnalyticsChoice(document.cookie);
const serverChoice = () => null;
const readHash = () => window.location.hash;
const serverString = () => "";
const readOrigin = () => window.location.origin;

function subscribeChoice(notify: () => void) {
  window.addEventListener(ANALYTICS_PREFERENCE_EVENT, notify);
  window.addEventListener("focus", notify);
  window.addEventListener("pageshow", notify);
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(ANALYTICS_PREFERENCE_EVENT) : null;
  channel?.addEventListener("message", notify);
  return () => {
    window.removeEventListener(ANALYTICS_PREFERENCE_EVENT, notify);
    window.removeEventListener("focus", notify);
    window.removeEventListener("pageshow", notify);
    channel?.close();
  };
}

function subscribeHash(notify: () => void) {
  window.addEventListener("hashchange", notify);
  window.addEventListener("popstate", notify);
  window.addEventListener("pageshow", notify);
  return () => {
    window.removeEventListener("hashchange", notify);
    window.removeEventListener("popstate", notify);
    window.removeEventListener("pageshow", notify);
  };
}

function saveChoice(choice: AnalyticsChoice) {
  try {
    document.cookie = serializeAnalyticsChoice(choice);
    if (readChoice() !== choice) return false;
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(ANALYTICS_PREFERENCE_EVENT));
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(ANALYTICS_PREFERENCE_EVENT);
    channel.postMessage("changed");
    channel.close();
  }
  return true;
}

function LandingAnalyticsFrame({ config }: { config: LandingAnalyticsConfig }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const { id, kind } = config;
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const nonce = crypto.randomUUID();
    const frameUrl = URL.createObjectURL(new Blob([renderAnalyticsFrame({ id, kind }, nonce)], { type: "text/html" }));
    frame.src = frameUrl;
    return () => {
      frame.src = "about:blank";
      URL.revokeObjectURL(frameUrl);
    };
  }, [id, kind]);

  return <iframe ref={frameRef} title="My Agent Air optional analytics" sandbox="allow-scripts"
    referrerPolicy="no-referrer" className="hidden" aria-hidden="true" data-testid="landing-measurement" />;
}

function AnalyticsConsentContents({ config }: { config: LandingAnalyticsConfig | null }) {
  const enabled = config !== null;
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const origin = useSyncExternalStore(subscribeHash, readOrigin, serverString);
  const hash = useSyncExternalStore(subscribeHash, readHash, serverString);
  const choice = useSyncExternalStore(subscribeChoice, readChoice, serverChoice);
  const { isRu } = useUiSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [writeFailed, setWriteFailed] = useState(false);
  // A failed denial must still stop sending in this browser tab for this document.
  const [blockForThisDocument, setBlockForThisDocument] = useState(false);
  const publicLanding = isAnalyticsLandingPage(origin, pathname, search, hash);
  const shouldLoad = enabled && publicLanding && choice === "granted" && !blockForThisDocument;
  const show = settingsOpen || (enabled && publicLanding && choice === null && !blockForThisDocument);

  useEffect(() => {
    const open = () => {
      setWriteFailed(false);
      setSettingsOpen(true);
    };
    window.addEventListener(ANALYTICS_SETTINGS_EVENT, open);
    return () => window.removeEventListener(ANALYTICS_SETTINGS_EVENT, open);
  }, []);

  function choose(value: AnalyticsChoice) {
    const persisted = saveChoice(value);
    if (value === "denied") setBlockForThisDocument(true);
    else if (persisted) setBlockForThisDocument(false);
    setWriteFailed(!persisted);
    if (persisted) setSettingsOpen(false);
  }

  return (
    <>
      {shouldLoad && config && <LandingAnalyticsFrame config={config} />}
      {show && (
        <section
          aria-label={isRu ? "Настройки файлов cookie" : "Cookie sozlamalari"}
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 text-sm shadow-xl sm:bottom-5 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              {isRu ? "Настройки файлов cookie" : "Cookie sozlamalari"}
            </h2>
            {settingsOpen && (
              <button type="button" className="text-slate-600 underline dark:text-slate-300" onClick={() => setSettingsOpen(false)}>
                {isRu ? "Закрыть" : "Yopish"}
              </button>
            )}
          </div>
          <p className="my-2 text-slate-700 dark:text-slate-200">
            {!enabled
              ? (isRu ? "Дополнительная аналитика сейчас не включена." : "Ixtiyoriy statistika hozir yoqilmagan.")
              : (isRu ? "Дополнительная аналитика Google учитывает посещения только главной страницы и только с вашего согласия. Отказ не ограничивает работу сайта." : "Ixtiyoriy Google statistikasi faqat bosh sahifadagi tashriflarni va faqat roziligingiz bilan hisoblaydi. Rad etish sayt ishlashini cheklamaydi.")}
          </p>
          {writeFailed && (
            <p role="alert" className="my-2 text-red-700 dark:text-red-300">
              {isRu ? "Браузер не сохранил настройку. Аналитика остаётся выключенной на этой вкладке." : "Brauzer sozlamani saqlamadi. Ushbu oynada statistika yoqilmaydi."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {enabled && (
              <>
                <button type="button" onClick={() => choose("denied")} className="rounded-xl border border-slate-400 px-3 py-2 font-medium text-slate-900 dark:text-white">
                  {isRu ? "Только необходимые" : "Faqat zaruriylari"}
                </button>
                <button type="button" onClick={() => choose("granted")} className="rounded-xl border border-slate-400 px-3 py-2 font-medium text-slate-900 dark:text-white">
                  {isRu ? "Разрешить аналитику" : "Statistikaga ruxsat berish"}
                </button>
              </>
            )}
            <Link href="/cookies" className="px-2 py-2 text-blue-700 underline dark:text-blue-300" onClick={() => setSettingsOpen(false)}>
              {isRu ? "Политика cookie" : "Cookie siyosati"}
            </Link>
          </div>
        </section>
      )}
    </>
  );
}

export default function AnalyticsConsent({ config }: { config: LandingAnalyticsConfig | null }) {
  return <Suspense fallback={null}><AnalyticsConsentContents config={config} /></Suspense>;
}
