"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import BrandMark from "@/app/components/brand-mark";
import { getStoredSession, signOut, type AuthSession } from "@/lib/supabase-auth";

const navigation = [
  ["Dashboard", "/dashboard"],
  ["So‘rovlar", "/requests"],
  ["Takliflar", "/offers"],
  ["Agentlar", "/agents"],
  ["Bitimlar", "/deals"],
  ["Xabarlar", "/messages"],
  ["Profil", "/profile"],
] as const;

export default function AppShell({ children, session, activePath = "" }: { children: React.ReactNode; session?: AuthSession | null; activePath?: string }) {
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(session ?? null);
  const [isReady, setIsReady] = useState(Boolean(session));
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      window.location.replace("/login");
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCurrentSession(storedSession);
      setIsReady(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleLogout() {
    setIsSigningOut(true);
    await signOut();
    window.location.replace("/login");
  }

  if (!isReady || !currentSession) {
    return <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] text-sm text-slate-500">Yuklanmoqda...</main>;
  }

  return (
    <div className="min-h-screen bg-[#eef5fb] text-[#0b1f3a] lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col bg-[#0b1f3a] px-5 py-6 text-white lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 text-sm font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-cyan-300">
          <BrandMark /> MY AGENT AIR
        </Link>
        <nav aria-label="Asosiy navigatsiya" className="mt-12 space-y-1">
          {navigation.map(([label, href]) => (
            <Link key={href} href={href} className={`flex items-center rounded-xl px-4 py-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${activePath === href ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-5">
          <p className="truncate px-3 text-sm font-semibold">{currentSession.user.email || "Foydalanuvchi"}</p>
          <p className="mt-1 px-3 text-xs text-blue-200">My Agent Air a’zosi</p>
          <button type="button" onClick={handleLogout} disabled={isSigningOut} className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-medium text-blue-100 transition hover:border-red-300/50 hover:bg-red-400/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">{isSigningOut ? "Chiqilmoqda..." : "Chiqish"}</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500"><BrandMark /> MY AGENT AIR</Link>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Chiqish</button>
          </div>
          <nav aria-label="Mobil navigatsiya" className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {navigation.map(([label, href]) => <Link key={href} href={href} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${activePath === href ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{label}</Link>)}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
