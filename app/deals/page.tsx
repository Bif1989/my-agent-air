"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { listBuyerDeals, listDeals, listSellerDeals, type DealRecord, type DealStatus } from "@/app/deals/deals-api";

const statusLabels: Record<DealStatus, string> = {
  accepted: "Qabul qilingan",
  processing: "Jarayonda",
  issued: "Rasmiylashtirilgan",
  completed: "Yakunlangan",
  cancelled: "Bekor qilingan",
};

const statusClasses: Record<DealStatus, string> = {
  accepted: "bg-amber-50 text-amber-700",
  processing: "bg-blue-50 text-blue-700",
  issued: "bg-cyan-50 text-cyan-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-600",
};

type DealTab = "all" | "buyer" | "seller";

function formatDate(value: string | null) {
  if (!value) return "Ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function formatPrice(price: number | null, currency: string) {
  return price == null ? "Kelishilgan narx ko‘rsatilmagan" : `${price.toLocaleString("uz-UZ")} ${currency}`;
}

function DealCard({ deal, userId }: { deal: DealRecord; userId: string }) {
  const isBuyer = deal.buyer_id === userId;
  return <Link href={`/deals/${deal.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100 sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-lg font-semibold text-[#0b1f3a]">{deal.request?.origin || "—"} <span className="px-1 text-blue-400">→</span> {deal.request?.destination || "—"}</p><p className="mt-1 text-sm text-slate-500">{deal.request?.category || "Kategoriya ko‘rsatilmagan"} · {formatDate(deal.request?.travel_date || null)}</p></div>
      <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[deal.status]}`}>{statusLabels[deal.status]}</span>
    </div>
    <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kelishilgan narx</p><p className="mt-1 font-semibold text-[#0b1f3a]">{formatPrice(deal.agreed_price, deal.currency)}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{isBuyer ? "Sotuvchi" : "Xaridor"}</p><p className="mt-1 text-sm font-medium text-slate-700">{(isBuyer ? deal.seller?.full_name : deal.buyer?.full_name) || "Profil ko‘rsatilmagan"}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sizning rolingiz</p><p className="mt-1 text-sm font-medium text-slate-700">{isBuyer ? "Xaridor" : "Sotuvchi"}</p></div></div>
    <p className="mt-4 text-xs text-slate-400">Yaratilgan: {formatDate(deal.created_at)}</p>
  </Link>;
}

export default function DealsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tab, setTab] = useState<DealTab>("all");
  const [deals, setDeals] = useState<DealRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => setSession(storedSession), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!session) return;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true); setError("");
      const load = tab === "buyer" ? listBuyerDeals : tab === "seller" ? listSellerDeals : listDeals;
      load().then(setDeals).catch((loadError: unknown) => {
        if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setError("Bitimlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab]);

  const tabs: [DealTab, string][] = [["all", "Barcha bitimlar"], ["buyer", "Xaridor sifatida"], ["seller", "Sotuvchi sifatida"]];
  return <AppShell session={session} activePath="/deals"><div className="mx-auto max-w-6xl"><header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Kelishuvlar markazi</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Bitimlar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Qabul qilingan takliflar va ularning rasmiylashtirish jarayonini bir joyda boshqaring.</p></header>
    <div className="mt-7 flex gap-2 overflow-x-auto border-b border-slate-200 pb-px" role="tablist" aria-label="Bitimlar filtri">{tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${tab === value ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</div>
    {isLoading && <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">Bitimlar yuklanmoqda...</div>}
    {error && <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
    {!isLoading && !error && !deals.length && <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center"><h2 className="font-semibold text-[#0b1f3a]">Hozircha bitimlar yo‘q</h2><p className="mt-2 text-sm text-slate-500">Taklif qabul qilingandan keyin bitim shu yerda ko‘rinadi.</p></div>}
    {!isLoading && !error && deals.length > 0 && <div className="mt-6 space-y-4">{deals.map((deal) => <DealCard key={deal.id} deal={deal} userId={session?.user.id || ""} />)}</div>}
  </div></AppShell>;
}
