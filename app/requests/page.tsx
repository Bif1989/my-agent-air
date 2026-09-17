"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { listRequests, type RequestRecord, type RequestStatus } from "@/app/requests/requests-api";

const categories = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Viza", "Boshqa"];
const statusLabels: Record<RequestStatus | "all", string> = { all: "Barcha statuslar", open: "Ochiq", accepted: "Qabul qilingan", closed: "Yopilgan", cancelled: "Bekor qilingan" };

function formatDate(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function RequestCard({ request, userId }: { request: RequestRecord; userId: string }) {
  const statusClass = request.status === "open" ? "bg-emerald-50 text-emerald-700" : request.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return (
    <Link href={`/requests/${request.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-[#0b1f3a]">{request.origin || "—"} <span className="px-1 text-blue-500">→</span> {request.destination || "—"}</h2>{request.created_by === userId && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700">Mening so‘rovim</span>}</div><p className="mt-2 text-sm text-slate-500">{request.category} · {formatDate(request.travel_date)}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabels[request.status]}</span></div>
      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 sm:grid-cols-3"><span>{request.adults} kattalar · {request.children} bolalar · {request.infants} go‘daklar</span><span>Bagaj: {request.baggage || "Ko‘rsatilmagan"}</span><span className="font-semibold text-[#0b1f3a]">{request.budget == null ? "Budjet ko‘rsatilmagan" : `${request.budget.toLocaleString("uz-UZ")} ${request.currency}`}</span></div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400"><span>{request.creator?.full_name || "Agent nomi ko‘rsatilmagan"}</span><span>{request.creator?.company_name || "Kompaniya ko‘rsatilmagan"}</span><span>{request.creator?.city || "Shahar ko‘rsatilmagan"}</span>{request.creator?.is_verified && <span className="font-semibold text-blue-600">Tasdiqlangan agent</span>}<span className="sm:ml-auto">Yaratilgan: {formatDate(request.created_at)}</span></div>
    </Link>
  );
}

export default function RequestsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => setSession(storedSession), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) return;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError("");
      listRequests({ status, category, search, createdBy: mineOnly ? storedSession.user.id : undefined })
        .then(setRequests)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("So‘rovlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [status, category, search, mineOnly]);

  function clearFilters() { setStatus("all"); setCategory(""); setSearch(""); }
  const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  return (
    <AppShell session={session} activePath="/requests">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Ish maydoni</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">So‘rovlar</h1><p className="mt-2 text-sm text-slate-500">Hamkorlar tarmog‘idagi sayohat va xizmat so‘rovlarini boshqaring.</p></div><Link href="/requests/new" className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Yangi so‘rov</Link></header>
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4"><button type="button" onClick={() => setMineOnly(false)} className={`rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${!mineOnly ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Barcha so‘rovlar</button><button type="button" onClick={() => setMineOnly(true)} className={`rounded-lg px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${mineOnly ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Mening so‘rovlarim</button></div><div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]"><label className="sr-only" htmlFor="request-status">Status</label><select id="request-status" value={status} onChange={(event) => setStatus(event.target.value as RequestStatus | "all")} className={inputClass}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="sr-only" htmlFor="request-category">Kategoriya</label><select id="request-category" value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}><option value="">Barcha kategoriyalar</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="sr-only" htmlFor="request-search">Qidiruv</label><input id="request-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Origin yoki destination bo‘yicha qidirish" className={inputClass} />{(status !== "all" || category || search) && <button type="button" onClick={clearFilters} className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Filtrni tozalash</button>}</div></div>
      {error && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
      {isLoading ? <div className="mt-6 space-y-4" aria-label="So‘rovlar yuklanmoqda"><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /></div> : requests.length ? <div className="mt-6 space-y-4">{requests.map((request) => <RequestCard key={request.id} request={request} userId={session?.user.id || ""} />)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">Hozircha so‘rovlar yo‘q</p><p className="mt-2 text-sm text-slate-500">Filtrlarni o‘zgartiring yoki yangi so‘rov yarating.</p><Link href="/requests/new" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-100">Yangi so‘rov yaratish</Link></div>}
    </AppShell>
  );
}
