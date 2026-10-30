"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import AiCommandCenter from "@/app/dashboard/components/ai-command-center";
import RequestQuickBuilder from "@/app/dashboard/components/request-quick-builder";
import { loadDashboardData } from "@/app/dashboard/components/dashboard-data";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

export default function DashboardPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [chatExpanded, setChatExpanded] = useState(false);
  const { isRu } = useUiSettings();

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      loadDashboardData()
        .then(setData)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) {
            window.location.replace("/login"); return;
          }
          setError(isRu ? "Не удалось загрузить AI-центр. Попробуйте позже." : "AI boshqaruv markazini yuklashda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.");
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isRu]);

  const isLoading = Boolean(session) && !data && !error;
  const displayName = data?.profile?.full_name || session?.user.email?.split("@")[0] || (isRu ? "партнёр" : "hamkor");

  return (
    <AppShell session={session} activePath="/dashboard">
      {isLoading && <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">{isRu ? "Загрузка AI-центра..." : "AI boshqaruv markazi yuklanmoqda..."}</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
      {data && session && (
        <div className={`flex min-h-0 flex-col lg:h-[calc(100dvh-7rem)] lg:overflow-hidden ${chatExpanded ? "h-[calc(100dvh-12.5rem)] min-h-[260px] overflow-hidden" : ""}`}>
          <header className={`mb-1 hidden shrink-0 items-center justify-between gap-3 px-1 ${chatExpanded ? "" : "lg:flex"}`}>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-600">{isRu ? "AI ЦЕНТР УПРАВЛЕНИЯ" : "AI boshqaruv markazi"}</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-[#0b1f3a]">{isRu ? "Добро пожаловать" : "Xush kelibsiz"}, {displayName}</h1>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Link href="/requests/new" className="rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700">+ {isRu ? "Запрос" : "So‘rov"}</Link>
              <Link href="/deals" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b1f3a] transition hover:border-blue-300">{isRu ? "Кабинет" : "Kabinet"}</Link>
            </div>
          </header>
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
            <span className="text-xs font-semibold text-slate-500">{chatExpanded ? (isRu ? "AI-чат" : "AI chat") : (isRu ? "Запрос и AI-чат" : "So‘rov va AI chat")}</span>
            <button type="button" aria-expanded={!chatExpanded} aria-controls="dashboard-request-panel" onClick={() => setChatExpanded(!chatExpanded)} className="min-h-9 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-300">
              {chatExpanded ? (isRu ? "Открыть панель запроса" : "So‘rov panelini ochish") : (isRu ? "Свернуть панель запроса" : "So‘rov panelini yig‘ish")} {chatExpanded ? "+" : "−"}
            </button>
          </div>
          <div id="dashboard-request-panel" className={chatExpanded ? "hidden" : "shrink-0"}>
            <RequestQuickBuilder session={session} />
          </div>
          <div id="ai-chat" className={`min-h-0 scroll-mt-2 lg:flex-1 lg:[&>section]:h-full lg:[&>section]:min-h-0 lg:[&>section>div]:!h-full lg:[&>section>div]:!min-h-0 lg:[&>section>div]:!max-h-none ${chatExpanded ? "flex-1 [&>section]:h-full [&>section]:min-h-0 [&>section>div]:!h-full [&>section>div]:!min-h-0 [&>section>div]:!max-h-none" : ""}`}>
            <AiCommandCenter session={session} displayName={displayName} stats={data.stats} onComposerFocus={() => setChatExpanded(true)} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
