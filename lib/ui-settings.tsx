"use client";

import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";

export type UiLocale = "uz" | "ru";
export type UiTheme = "light" | "dark";

const LOCALE_KEY = "my-agent-air:locale";
const THEME_KEY = "my-agent-air:theme";

type UiSettingsContextValue = {
  locale: UiLocale;
  theme: UiTheme;
  isRu: boolean;
  setLocale: (locale: UiLocale) => void;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
};

const UiSettingsContext = createContext<UiSettingsContextValue | null>(null);

const SETTINGS_EVENT = "my-agent-air:settings";
const memorySettings: Record<string, string> = {};
function readSetting(key: string) {
  if (memorySettings[key] !== undefined) return memorySettings[key];
  try { return window.localStorage.getItem(key); }
  catch { return memorySettings[key]; }
}
function writeSetting(key: string, value: string) {
  memorySettings[key] = value;
  try { window.localStorage.setItem(key, value); } catch { /* Settings still work when storage is unavailable. */ }
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}
function subscribeSettings(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key) delete memorySettings[event.key];
    else for (const key of Object.keys(memorySettings)) delete memorySettings[key];
    notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SETTINGS_EVENT, notify);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener(SETTINGS_EVENT, notify); };
}
const readLocale = (): UiLocale => readSetting(LOCALE_KEY) === "ru" ? "ru" : "uz";
const readTheme = (): UiTheme => {
  const stored = readSetting(THEME_KEY);
  return stored === "dark" || stored === "light" ? stored : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
const serverLocale = (): UiLocale => "uz";
const serverTheme = (): UiTheme => "light";

export function UiSettingsProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribeSettings, readLocale, serverLocale);
  const theme = useSyncExternalStore(subscribeSettings, readTheme, serverTheme);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const value = useMemo<UiSettingsContextValue>(() => ({
    locale,
    theme,
    isRu: locale === "ru",
    setLocale: (next) => writeSetting(LOCALE_KEY, next),
    setTheme: (next) => writeSetting(THEME_KEY, next),
    toggleTheme: () => writeSetting(THEME_KEY, theme === "dark" ? "light" : "dark"),
  }), [locale, theme]);

  return <UiSettingsContext.Provider value={value}>{children}</UiSettingsContext.Provider>;
}

export function useUiSettings() {
  const value = useContext(UiSettingsContext);
  if (!value) throw new Error("useUiSettings must be used inside UiSettingsProvider");
  return value;
}

export function UiControls({ compact = false, inverse = false }: { compact?: boolean; inverse?: boolean }) {
  const { locale, setLocale, theme, toggleTheme, isRu } = useUiSettings();
  const shell = inverse ? "border-white/15 bg-white/10 text-white" : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";
  const inactive = inverse ? "text-blue-100 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800";
  const active = inverse ? "bg-white text-[#0b1f3a]" : "bg-blue-600 text-white";
  return (
    <div className={`inline-flex items-center gap-1 rounded-xl border p-1 ${shell}`}>
      <button type="button" onClick={() => setLocale("uz")} aria-pressed={locale === "uz"} className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${locale === "uz" ? active : inactive}`}>UZ</button>
      <button type="button" onClick={() => setLocale("ru")} aria-pressed={locale === "ru"} className={`rounded-lg px-2 py-1 text-[11px] font-bold transition ${locale === "ru" ? active : inactive}`}>RU</button>
      <span className={`mx-0.5 h-4 w-px ${inverse ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700"}`} />
      <button type="button" onClick={toggleTheme} aria-label={isRu ? (theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему") : (theme === "dark" ? "Kunduzgi rejimni yoqish" : "Tungi rejimni yoqish")} className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${inactive}`}>
        <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>{!compact && <span className="ml-1">{isRu ? (theme === "dark" ? "Светлая" : "Тёмная") : (theme === "dark" ? "Kunduzgi" : "Tungi")}</span>}
      </button>
    </div>
  );
}
