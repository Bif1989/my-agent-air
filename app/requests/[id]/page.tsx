"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import { deleteRequest, getRequest, updateRequestStatus, type RequestRecord } from "@/app/requests/requests-api";
import { acceptOffer, getOffersForRequest, type OfferRecord } from "@/app/offers/offers-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

function formatDate(value: string | null) {
  if (!value) return "Ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 text-sm font-medium text-[#0b1f3a]">{value}</dd></div>;
}

export default function RequestDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [isOffersLoading, setIsOffersLoading] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      getRequest(params.id)
        .then((loadedRequest) => {
          setRequest(loadedRequest);
          if (loadedRequest && loadedRequest.created_by === storedSession.user.id) {
            setIsOffersLoading(true);
            return getOffersForRequest(params.id).then(setOffers).finally(() => setIsOffersLoading(false));
          }
          return undefined;
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("So‘rovni yuklashda xatolik yuz berdi.");
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [params.id]);

  async function changeStatus(status: "closed" | "cancelled") {
    if (!request || isWorking) return;
    setIsWorking(true); setError(""); setMessage("");
    try {
      const updated = await updateRequestStatus(request.id, status);
      if (!updated) throw new Error("Status o‘zgarmadi.");
      setRequest({ ...request, ...updated, status });
      setMessage(status === "closed" ? "So‘rov yopildi." : "So‘rov bekor qilindi.");
    } catch { setError("So‘rov statusini o‘zgartirib bo‘lmadi."); } finally { setIsWorking(false); }
  }

  async function handleDelete() {
    if (!request || isWorking || !window.confirm("O‘chirishga ishonchingiz komilmi?")) return;
    setIsWorking(true); setError("");
    try { await deleteRequest(request.id); router.push("/requests"); } catch { setError("So‘rovni o‘chirishda xatolik yuz berdi."); setIsWorking(false); }
  }

  async function handleAcceptOffer(offerId: string) {
    if (isAccepting || !window.confirm("Ushbu taklifni qabul qilasizmi?")) return;
    setIsAccepting(true); setError(""); setMessage("");
    try {
      await acceptOffer(offerId);
      setRequest((current) => current ? { ...current, status: "accepted" } : current);
      setOffers((current) => current.map((offer) => offer.id === offerId ? { ...offer, status: "accepted" } : { ...offer, status: offer.status === "pending" ? "rejected" : offer.status }));
      setMessage("Taklif qabul qilindi. Bitim yaratildi.");
    } catch { setError("Taklifni qabul qilib bo‘lmadi. Qayta urinib ko‘ring."); } finally { setIsAccepting(false); }
  }

  const isOwner = Boolean(session && request && session.user.id === request.created_by);
  return (
    <AppShell session={session} activePath="/requests">
      {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">So‘rov yuklanmoqda...</div>}
      {error && !request && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/requests" className="ml-2 font-semibold underline">So‘rovlarga qaytish</Link></div>}
      {request && <div className="mx-auto max-w-5xl"><Link href="/requests" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← So‘rovlarga qaytish</Link><header className="mt-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">So‘rov tafsilotlari</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{request.origin || "—"} <span className="text-blue-500">→</span> {request.destination || "—"}</h1><p className="mt-2 text-sm text-slate-500">{request.category} · Yaratilgan {formatDate(request.created_at)}</p></div><span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${request.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{({ open: "Ochiq", accepted: "Qabul qilingan", closed: "Yopilgan", cancelled: "Bekor qilingan" } as Record<string, string>)[request.status]}</span></header>
        {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.8fr]"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><h2 className="text-lg font-semibold text-[#0b1f3a]">Safar va xizmat tafsilotlari</h2><dl className="mt-7 grid gap-6 sm:grid-cols-2"><DetailItem label="Safar sanasi" value={formatDate(request.travel_date)} /><DetailItem label="Yo‘nalish" value={`${request.origin || "—"} → ${request.destination || "—"}`} /><DetailItem label="Yo‘lovchilar" value={`${request.adults} kattalar · ${request.children} bolalar · ${request.infants} go‘daklar`} /><DetailItem label="Bagaj" value={request.baggage || "Ko‘rsatilmagan"} /><DetailItem label="Budjet" value={request.budget == null ? "Ko‘rsatilmagan" : `${request.budget.toLocaleString("uz-UZ")} ${request.currency}`} /><DetailItem label="Yangilangan" value={formatDate(request.updated_at)} /></dl>{request.description && <div className="mt-8 border-t border-slate-100 pt-6"><h3 className="text-sm font-semibold text-[#0b1f3a]">Qo‘shimcha ma’lumot</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{request.description}</p></div>}</section><aside className="space-y-6"><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-semibold text-[#0b1f3a]">Yaratgan agent</h2><div className="mt-5 space-y-3 text-sm"><p className="font-semibold text-[#0b1f3a]">{request.creator?.full_name || "Ism ko‘rsatilmagan"}</p><p className="text-slate-500">{request.creator?.company_name || "Kompaniya ko‘rsatilmagan"}</p><p className="text-slate-500">{request.creator?.city || "Shahar ko‘rsatilmagan"}</p>{request.creator?.is_verified && <p className="font-semibold text-blue-600">Tasdiqlangan agent</p>}</div></section><section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">{isOwner ? <div className="space-y-3"><Link href={`/requests/${request.id}/edit`} className="block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Tahrirlash</Link><button type="button" disabled={isWorking || request.status !== "open"} onClick={() => changeStatus("closed")} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:cursor-not-allowed disabled:opacity-50">Yopish</button><button type="button" disabled={isWorking || request.status !== "open"} onClick={() => changeStatus("cancelled")} className="w-full rounded-xl border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50">Bekor qilish</button><button type="button" disabled={isWorking} onClick={handleDelete} className="w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50">O‘chirish</button></div> : request.status === "open" ? <Link href={`/offers?request_id=${request.id}`} className="block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Taklif berish</Link> : <button type="button" disabled className="w-full rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500">Taklif berish yopilgan</button>}</section></aside></div>{isOwner && <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex items-center justify-between gap-4"><div><h2 className="text-xl font-semibold text-[#0b1f3a]">Takliflar</h2><p className="mt-1 text-sm text-slate-500">Ushbu so‘rovga kelgan agent takliflari</p></div><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{offers.length} ta</span></div>{isOffersLoading ? <div className="mt-6 h-32 animate-pulse rounded-2xl bg-slate-100" /> : offers.length ? <div className="mt-6 space-y-4">{offers.map((offer) => <div key={offer.id} className="rounded-2xl border border-slate-100 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="font-semibold text-[#0b1f3a]">{offer.agent?.full_name || "Agent nomi ko‘rsatilmagan"}</p><p className="mt-1 text-sm text-slate-500">{offer.agent?.company_name || "Kompaniya ko‘rsatilmagan"} · {offer.agent?.city || "Shahar ko‘rsatilmagan"}</p>{offer.agent?.is_verified && <p className="mt-1 text-xs font-semibold text-blue-600">Tasdiqlangan agent</p>}</div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{({ pending: "Kutilmoqda", accepted: "Qabul qilingan", rejected: "Rad etilgan", withdrawn: "Qaytarib olingan" } as Record<string, string>)[offer.status]}</span></div><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><p className="text-lg font-semibold text-[#0b1f3a]">{offer.price == null ? "Narx ko‘rsatilmagan" : `${offer.price.toLocaleString("uz-UZ")} ${offer.currency}`}</p><p className="text-slate-500">Aviakompaniya: {offer.airline || "Ko‘rsatilmagan"}</p><p className="text-slate-500">Bagaj: {offer.baggage || "Ko‘rsatilmagan"}</p>{offer.comment && <p className="text-slate-500 sm:col-span-2">{offer.comment}</p>}</div>{offer.status === "pending" && <button type="button" disabled={isAccepting || request.status !== "open"} onClick={() => handleAcceptOffer(offer.id)} className="mt-5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isAccepting ? "Qabul qilinmoqda..." : "Taklifni qabul qilish"}</button>}</div>)}</div> : <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">Hozircha takliflar yo‘q.</div>}</section>}</div>}
    </AppShell>
  );
}
