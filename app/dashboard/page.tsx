"use client";

import { useEffect, useState } from "react";
import { clearSession, SESSION_STORAGE_KEY, type AuthSession } from "@/lib/supabase-auth";
import BrandMark from "@/app/components/brand-mark";

export default function DashboardPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const storedSession = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!storedSession) {
      window.location.replace("/login");
      return;
    }
    let parsedSession: AuthSession;
    try {
      parsedSession = JSON.parse(storedSession) as AuthSession;
    } catch {
      clearSession();
      window.location.replace("/login");
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSession(parsedSession);
      setIsChecking(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function handleLogout() {
    clearSession();
    window.location.href = "/login";
  }

  if (isChecking || !session) {
    return <main className="flex min-h-screen items-center justify-center bg-[#f4f8fc] text-sm text-slate-500">Yuklanmoqda...</main>;
  }

  return (
    <main className="min-h-screen bg-[#f4f8fc] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl shadow-blue-900/10 sm:min-h-[calc(100vh-3rem)]">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-5 sm:px-10"><div className="flex items-center gap-3 text-sm font-semibold tracking-wide text-[#0b1f3a]"><BrandMark /> MY AGENT AIR</div><button type="button" onClick={handleLogout} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-600">Chiqish</button></header>
        <section className="flex flex-1 items-center px-6 py-16 sm:px-10 lg:px-16"><div><p className="text-sm font-medium text-blue-600">MY AGENT AIR</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#0b1f3a]">Xush kelibsiz</h1><p className="mt-4 text-slate-500">{session.user?.email || "Email ko‘rsatilmagan"}</p><div className="mt-10 rounded-2xl border border-blue-100 bg-[#f7fbff] px-5 py-4 text-sm text-slate-600">Agentlar tarmog‘idagi ish maydoningiz tayyor.</div></div></section>
      </div>
    </main>
  );
}