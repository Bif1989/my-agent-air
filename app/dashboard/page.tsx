"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import AiCommandCenter from "@/app/dashboard/components/ai-command-center";
import { loadDashboardData, type RequestItem } from "@/app/dashboard/components/dashboard-data";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { POST_CATEGORY_LABELS, type FeedPost } from "@/app/feed/feed-api";
import { formatPrice } from "@/app/feed/post-card";

type DashboardData = Awaited<ReturnType<typeof loadDashboardData>>;

function formatDate(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatStatus(status: string | null) {
  const labels: Record<string, string> = { open: "Ochiq", pending: "Kutilmoqda", closed: "Yopilgan", active: "Faol" };
  return status ? labels[status.toLowerCase()] || status : "Noma’lum";
}

function RequestRow({ request }: { request: RequestItem }) {
  const passengers = `${request.adults || 0} kattalar · ${request.children || 0} bolalar · ${request.infants || 0} go‘daklar`;
  return (
    <Link href={`/requests/${request.id}`} className="grid gap-3 border-t border-slate-100 py-4 text-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 md:grid-cols-[1.4fr_1fr_0.7fr_0.7fr] md:items-center">
      <div><p className="font-semibold text-[#0b1f3a]">{request.origin || "—"} <span className="px-1 text-blue-400">→</span> {request.destination || "—"}</p><p className="mt-1 text-xs text-slate-400">{passengers}</p></div>
      <div><p className="text-slate-600">{formatDate(request.travel_date)}</p><p className="mt-1 text-xs text-slate-400">{request.category || "Kategoriya yo‘q"}</p></div>
      <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{formatStatus(request.status)}</span>
      <p className="text-xs text-slate-400 md:text-right">{formatDate(request.created_at)}</p>
    </Link>
  );
}

function AnnouncementRow({ announcement }: { announcement: FeedPost }) {
  const price = formatPrice(announcement.price, announcement.currency);
  return (
    <Link href={`/feed/${announcement.id}`} className="grid gap-2 border-t border-slate-100 py-4 text-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 md:grid-cols-[1.4fr_1fr_0.7fr] md:items-center">
      <div><p className="font-semibold text-[#0b1f3a]">{announcement.title || announcement.body.slice(0, 60)}</p><p className="mt-1 text-xs text-slate-400">{announcement.author_full_name || "Agent"} · {POST_CATEGORY_LABELS[announcement.category]}</p></div>
      <div>{(announcement.origin || announcement.destination) && <p className="text-slate-600">{announcement.origin || "—"} <span className="px-1 text-blue-400">→</span> {announcement.destination || "—"}</p>}</div>
      <p className="text-xs font-semibold text-[#0b1f3a] md:text-right">{price || "Narx ko‘rsatilmagan"}</p>
    </Link>
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
  const displayName = data?.profile?.full_name || session?.user.email?.split("@")[0] || "hamkor";

  return (
    <AppShell session={session} activePath="/dashboard">
      {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">AI ish paneli yuklanmoqda...</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
      {data && session && (
        <>
          <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">AI boshqaruv markazi</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0b1f3a] sm:text-3xl">Xush kelibsiz, {displayName}</h1>
            </div>
            <div className="flex gap-2">
              <Link href="/requests/new" className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:text-sm">+ So‘rov</Link>
              <Link href="/profile" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#0b1f3a] transition hover:border-blue-300 sm:text-sm">Profil</Link>
            </div>
          </header>

          <AiCommandCenter session={session} displayName={displayName} stats={data.stats} />

          <section className="mt-8 grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-[#0b1f3a]">So‘nggi so‘rovlar</h2><p className="mt-1 text-xs text-slate-500">AI bilan ishlashdan tashqari tezkor ko‘rinish</p></div>
                <Link href="/requests" className="text-xs font-semibold text-blue-600 hover:text-blue-700">Barchasi →</Link>
              </div>
              {data.requests.length ? <div className="mt-4">{data.requests.slice(0, 3).map((request) => <RequestRow key={request.id} request={request} />)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center"><p className="text-sm font-semibold text-[#0b1f3a]">Hozircha so‘rovlar yo‘q</p><p className="mt-1 text-xs text-slate-500">AI’ga yo‘nalish va sanani yozib birinchi so‘rovni boshlang.</p></div>}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-lg font-semibold text-[#0b1f3a]">So‘nggi e’lonlar</h2><p className="mt-1 text-xs text-slate-500">Agentlar tarmog‘idagi yangi postlar</p></div>
                <Link href="/feed" className="text-xs font-semibold text-blue-600 hover:text-blue-700">Postlar →</Link>
              </div>
              {data.announcements.length ? <div className="mt-4">{data.announcements.slice(0, 3).map((announcement) => <AnnouncementRow key={announcement.id} announcement={announcement} />)}</div> : <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center"><p className="text-sm font-semibold text-[#0b1f3a]">Hozircha e’lonlar yo‘q</p><p className="mt-1 text-xs text-slate-500">Postlar paydo bo‘lganda shu yerda ko‘rinadi.</p></div>}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
