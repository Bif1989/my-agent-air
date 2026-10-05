"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import AiCommandCenter from "@/app/dashboard/components/ai-command-center";
import { loadDashboardData } from "@/app/dashboard/components/dashboard-data";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

export default function DashboardPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      window.location.replace("/login");
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      loadDashboardData(storedSession.user.id)
        .then(setData)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) {
            window.location.replace("/login");
            return;
          }
          setError("AI boshqaruv markazini yuklashda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.");
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const isLoading = Boolean(session) && !data && !error;
  const displayName = data?.profile?.full_name || session?.user.email?.split("@")[0] || "hamkor";

  return (
    <AppShell session={session} activePath="/dashboard">
      {isLoading && <div className="flex min-h-[70vh] items-center justify-center text-sm text-slate-500">AI boshqaruv markazi yuklanmoqda...</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
      {data && session && (
        <div className="flex min-h-[calc(100dvh-7rem)] flex-col lg:min-h-[calc(100dvh-9rem)]">
          <header className="mb-2 flex items-center justify-between gap-2 px-1 sm:mb-4 sm:flex-wrap sm:gap-3">
            <div className="min-w-0">
              <p className="hidden text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600 sm:block">AI boshqaruv markazi</p>
              <h1 className="truncate text-lg font-semibold tracking-tight text-[#0b1f3a] sm:mt-1 sm:text-2xl"><span className="sm:hidden">Salom, </span><span className="hidden sm:inline">Xush kelibsiz, </span>{displayName}</h1>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link href="/requests/new" className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4 sm:py-2.5 sm:text-sm">+ So‘rov</Link>
              <Link href="/profile" className="hidden rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b1f3a] transition hover:border-blue-300 sm:inline-flex sm:text-sm">Profil</Link>
            </div>
          </header>

          <div className="min-h-0 flex-1">
            <AiCommandCenter session={session} displayName={displayName} stats={data.stats} />
          </div>
        </div>
      )}
    </AppShell>
  );
}
