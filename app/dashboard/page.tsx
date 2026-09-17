"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { loadDashboardData, type Profile, type RequestItem } from "@/app/dashboard/components/dashboard-data";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

const statLabels = [
  ["openRequests", "Ochiq so‘rovlar", "Yangi imkoniyatlar"],
  ["offers", "Mening takliflarim", "Yuborilgan takliflar"],
  ["deals", "Faol bitimlar", "Joriy kelishuvlar"],
  ["agents", "Agentlar soni", "Tarmoqdagi profillar"],
] as const;

function formatDate(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatStatus(status: string | null) {
  const labels: Record<string, string> = { open: "Ochiq", pending: "Kutilmoqda", closed: "Yopilgan", active: "Faol" };
  return status ? labels[status.toLowerCase()] || status : "Noma’lum";
}

function ProfileSummary({ profile, email }: { profile: Profile | null; email?: string }) {
  if (!profile) {
    return <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">Profil ma’lumotlari topilmadi. Profilingizni to‘ldirish uchun Profil bo‘limiga o‘ting.</div>;
  }
  return (
    <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
      <span className="font-semibold text-[#0b1f3a]">{profile.company_name || "Kompaniya ko‘rsatilmagan"}</span>
      <span>{profile.agent_type || "Agent turi ko‘rsatilmagan"}</span>
      <span>{profile.city || "Shahar ko‘rsatilmagan"}</span>
      {!profile.full_name && <span>{email}</span>}
    </div>
  );
}

function RequestRow({ request }: { request: RequestItem }) {
  const passengers = `${request.adults || 0} kattalar · ${request.children || 0} bolalar · ${request.infants || 0} go‘daklar`;
  return (
    <div className="grid gap-3 border-t border-slate-100 py-4 text-sm md:grid-cols-[1.4fr_1fr_0.7fr_0.7fr] md:items-center">
      <div><p className="font-semibold text-[#0b1f3a]">{request.origin || "—"} <span className="px-1 text-blue-400">→</span> {request.destination || "—"}</p><p className="mt-1 text-xs text-slate-400">{passengers}</p></div>
      <div><p className="text-slate-600">{formatDate(request.travel_date)}</p><p className="mt-1 text-xs text-slate-400">{request.category || "Kategoriya yo‘q"}</p></div>
      <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{formatStatus(request.status)}</span>
      <p className="text-xs text-slate-400 md:text-right">{formatDate(request.created_at)}</p>
    </div>
  );
}

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
          setError("Dashboard ma’lumotlarini yuklashda xatolik yuz berdi. Keyinroq qayta urinib ko‘ring.");
        });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const isLoading = Boolean(session) && !data && !error;
  return (
    <AppShell session={session} activePath="/dashboard">
      {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Dashboard yuklanmoqda...</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
      {data && session && (
        <>
          <header className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
            <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Ish paneli</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Xush kelibsiz, {data.profile?.full_name || session.user.email?.split("@")[0] || "hamkor"}</h1><ProfileSummary profile={data.profile} email={session.user.email} /></div>
            <div className="flex flex-wrap gap-3"><Link href="/requests/new" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Yangi so‘rov yaratish</Link><Link href="/agents" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-[#0b1f3a] transition hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Agentlarni ko‘rish</Link></div>
          </header>
          <section aria-label="Asosiy ko‘rsatkichlar" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {statLabels.map(([key, label, detail]) => <div key={key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-4 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{data.stats[key]}</p><p className="mt-2 text-xs text-slate-400">{detail}</p></div>)}
          </section>
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#0b1f3a]">So‘nggi so‘rovlar</h2><p className="mt-1 text-sm text-slate-500">Platformadagi eng yangi so‘rovlar</p></div><Link href="/requests" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Barchasini ko‘rish</Link></div>{data.requests.length ? <div className="mt-5">{data.requests.map((request) => <RequestRow key={request.id} request={request} />)}</div> : <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center"><p className="font-semibold text-[#0b1f3a]">Hozircha so‘rovlar yo‘q</p><p className="mt-2 text-sm text-slate-500">Yangi so‘rov yaratib, hamkorlar tarmog‘ini ishga tushiring.</p></div>}</section>
  </>
      )}
    </AppShell>
  );
}
