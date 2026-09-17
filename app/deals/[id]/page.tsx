"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getDeal, listDealActivity, updateDealStatus, type DealActivity, type DealRecord, type DealStatus } from "@/app/deals/deals-api";

const statusLabels: Record<DealStatus, string> = { accepted: "Qabul qilingan", processing: "Jarayonda", issued: "Rasmiylashtirilgan", completed: "Yakunlangan", cancelled: "Bekor qilingan" };
const statusClasses: Record<DealStatus, string> = { accepted: "bg-amber-50 text-amber-700", processing: "bg-blue-50 text-blue-700", issued: "bg-cyan-50 text-cyan-700", completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-slate-100 text-slate-600" };
const eventLabels: Record<string, string> = { offer_accepted: "Taklif qabul qilindi", deal_status_changed: "Bitim statusi o‘zgardi" };
const nextActions: Partial<Record<DealStatus, { label: string; status: DealStatus; tone: string }[]>> = {
  accepted: [{ label: "Ish jarayonini boshlash", status: "processing", tone: "bg-blue-600 hover:bg-blue-700" }, { label: "Bitimni bekor qilish", status: "cancelled", tone: "border border-red-200 text-red-700 hover:bg-red-50" }],
  processing: [{ label: "Chipta/xizmat rasmiylashtirildi", status: "issued", tone: "bg-blue-600 hover:bg-blue-700" }, { label: "Bitimni bekor qilish", status: "cancelled", tone: "border border-red-200 text-red-700 hover:bg-red-50" }],
  issued: [{ label: "Bitimni yakunlash", status: "completed", tone: "bg-emerald-600 hover:bg-emerald-700" }],
};

function formatDate(value: string | null) {
  if (!value) return "Ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function profileName(profile: DealRecord["buyer"]) {
  return profile?.full_name || profile?.company_name || "Profil ko‘rsatilmagan";
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#0b1f3a]">{value}</dd></div>;
}

function activityValue(activity: DealActivity) {
  const data = activity.event_data || {};
  if (activity.event_type === "deal_status_changed" && typeof data.status === "string") return `Yangi status: ${statusLabels[data.status as DealStatus] || data.status}`;
  if (activity.event_type === "offer_accepted" && typeof data.price === "number") return `Kelishilgan narx: ${data.price.toLocaleString("uz-UZ")}`;
  return null;
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [activity, setActivity] = useState<DealActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDetail(dealId: string) {
    const loadedDeal = await getDeal(dealId);
    if (!loadedDeal) throw new Error("DEAL_NOT_FOUND");
    const loadedActivity = await listDealActivity(dealId);
    setDeal(loadedDeal); setActivity(loadedActivity);
  }

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      loadDetail(params.id).catch((loadError: unknown) => {
        if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setError(loadError instanceof Error && loadError.message === "DEAL_NOT_FOUND" ? "Bu bitim topilmadi yoki unga kirish huquqingiz yo‘q." : "Bitim ma’lumotlarini yuklashda xatolik yuz berdi.");
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [params.id]);

  async function handleStatusChange(status: DealStatus, label: string) {
    if (!deal || isWorking || !window.confirm(`“${label}” amalini bajarishni tasdiqlaysizmi?`)) return;
    setIsWorking(true); setError(""); setMessage("");
    try {
      await updateDealStatus(deal.id, status);
      await loadDetail(deal.id);
      setMessage("Bitim statusi muvaffaqiyatli yangilandi.");
    } catch (actionError: unknown) {
      if (actionError instanceof Error && (actionError.message === "AUTH_SESSION_EXPIRED" || actionError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setError("Bitim statusini yangilab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally { setIsWorking(false); }
  }

  const actions = deal ? nextActions[deal.status] || [] : [];
  return <AppShell session={session} activePath="/deals">
    {deal && <Link href={`/messages/${deal.id}`} className="mx-auto mb-4 block max-w-5xl text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Agent bilan yozishish →</Link>}
    {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Bitim yuklanmoqda...</div>}
    {!isLoading && error && <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/deals" className="ml-2 font-semibold underline">Bitimlarga qaytish</Link></div>}
    {!isLoading && deal && <div className="mx-auto max-w-5xl"><Link href="/deals" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Bitimlarga qaytish</Link><header className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Bitim tafsilotlari</p><h1 className="mt-3 break-all text-2xl font-semibold tracking-tight text-[#0b1f3a] sm:text-3xl">{deal.id}</h1><p className="mt-2 text-sm text-slate-500">Yaratilgan: {formatDate(deal.created_at)}</p></div><span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${statusClasses[deal.status]}`}>{statusLabels[deal.status]}</span></header>
      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}{error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {actions.length > 0 && <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><h2 className="font-semibold text-[#0b1f3a]">Keyingi qadam</h2><div className="mt-4 flex flex-col gap-3 sm:flex-row">{actions.map((action) => <button key={action.status} type="button" disabled={isWorking} onClick={() => handleStatusChange(action.status, action.label)} className={`rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50 ${action.tone} ${action.tone.includes("border") ? "bg-white" : "text-white"}`}>{isWorking ? "Bajarilmoqda..." : action.label}</button>)}</div></section>}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.8fr]"><div className="space-y-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-[#0b1f3a]">So‘rov ma’lumotlari</h2><dl className="mt-6 grid gap-5 sm:grid-cols-2"><DetailItem label="Yo‘nalish" value={`${deal.request?.origin || "—"} → ${deal.request?.destination || "—"}`} /><DetailItem label="Kategoriya" value={deal.request?.category || "Ko‘rsatilmagan"} /><DetailItem label="Safar sanasi" value={formatDate(deal.request?.travel_date || null)} /><DetailItem label="So‘rov ID" value={deal.request_id} /></dl>{deal.request?.description && <p className="mt-6 border-t border-slate-100 pt-5 text-sm leading-7 text-slate-600">{deal.request.description}</p>}<Link href={`/requests/${deal.request_id}`} className="mt-5 inline-block text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">So‘rovni ko‘rish →</Link></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-[#0b1f3a]">Qabul qilingan taklif</h2><dl className="mt-6 grid gap-5 sm:grid-cols-2"><DetailItem label="Aviakompaniya" value={deal.offer?.airline || "Ko‘rsatilmagan"} /><DetailItem label="Bagaj" value={deal.offer?.baggage || "Ko‘rsatilmagan"} /><DetailItem label="Taklif narxi" value={deal.offer?.price == null ? "Ko‘rsatilmagan" : `${deal.offer.price.toLocaleString("uz-UZ")} ${deal.offer.currency || deal.currency}`} /><DetailItem label="Taklif ID" value={deal.offer_id} /></dl>{deal.offer?.comment && <p className="mt-6 border-t border-slate-100 pt-5 text-sm leading-7 text-slate-600">{deal.offer.comment}</p>}</section></div><aside className="space-y-6"><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-[#0b1f3a]">Bitim qiymati</h2><p className="mt-4 text-2xl font-semibold text-[#0b1f3a]">{deal.agreed_price == null ? "Ko‘rsatilmagan" : `${deal.agreed_price.toLocaleString("uz-UZ")} ${deal.currency}`}</p><p className="mt-2 text-sm text-slate-500">Yangilangan: {formatDate(deal.updated_at)}</p></section><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-[#0b1f3a]">Ishtirokchilar</h2><div className="mt-5 space-y-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Xaridor</p><p className="mt-1 font-semibold text-[#0b1f3a]">{profileName(deal.buyer)}</p><p className="mt-1 text-sm text-slate-500">{deal.buyer?.company_name || deal.buyer?.city || ""}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Sotuvchi</p><p className="mt-1 font-semibold text-[#0b1f3a]">{profileName(deal.seller)}</p><p className="mt-1 text-sm text-slate-500">{deal.seller?.company_name || deal.seller?.city || ""}</p></div></div></section></aside></div>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-[#0b1f3a]">Faoliyat tarixi</h2>{activity.length ? <div className="mt-5 space-y-4">{activity.map((item) => <div key={item.id} className="border-l-2 border-blue-200 pl-4"><p className="font-semibold text-[#0b1f3a]">{eventLabels[item.event_type] || item.event_type}</p><p className="mt-1 text-xs text-slate-400">{formatDate(item.created_at)} · {profileName(item.actor)}</p>{activityValue(item) && <p className="mt-2 text-sm text-slate-600">{activityValue(item)}</p>}</div>)}</div> : <p className="mt-4 text-sm text-slate-500">Hozircha faoliyat yozuvlari yo‘q.</p>}</section>
    </div>}
  </AppShell>;
}