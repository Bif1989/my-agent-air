"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import AiCommandCenter from "@/app/dashboard/components/ai-command-center";
import { loadDashboardData } from "@/app/dashboard/components/dashboard-data";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

export default function DashboardPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const { isRu } = useUiSettings();

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      loadDashboardData(storedSession.user.id)
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
        <div className="flex min-h-0 flex-col">
          <header className="mb-3 hidden items-center justify-between gap-3 px-1 lg:flex">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-600">{isRu ? "AI ЦЕНТР УПРАВЛЕНИЯ" : "AI boshqaruv markazi"}</p>
              <h1 className="mt-0.5 truncate text-xl font-semibold tracking-tight text-[#0b1f3a]">{isRu ? "Добро пожаловать" : "Xush kelibsiz"}, {displayName}</h1>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/requests/new" className="rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700">+ {isRu ? "Запрос" : "So‘rov"}</Link>
              <Link href="/profile" className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0b1f3a] transition hover:border-blue-300">{isRu ? "Профиль" : "Profil"}</Link>
            </div>
          </header>
          <AiCommandCenter session={session} displayName={displayName} stats={data.stats} />
        </div>
      )}
    </AppShell>
  );
}
