"use client";

import { isRequestCurrent } from "@/lib/request-freshness";
import Link from "next/link";
import RequestServiceDetails from "@/app/requests/request-service-details";
import RequestTargetingSummary from "@/app/requests/request-targeting-summary";
import SupplierMatching from "@/app/requests/supplier-matching";
import { hasAirTravel, requestTitle } from "@/lib/service-request";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import { deleteRequest, getRequest, updateRequestStatus, type RequestRecord } from "@/app/requests/requests-api";
import { acceptOffer, getOffersForRequest, type OfferRecord } from "@/app/offers/offers-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { formatAirline } from "@/data/airlines";

const requestStatuses = { open: "Ochiq", accepted: "Qabul qilingan", closed: "Yopilgan", cancelled: "Bekor qilingan" } as const;
const offerStatuses = { pending: "Kutilmoqda", accepted: "Qabul qilingan", rejected: "Rad etilgan", withdrawn: "Qaytarib olingan" } as const;

function formatDate(value: string | null) {
  if (!value) return "Ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function requestIdFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "requests" || !parts[1] || parts[2]) return "";
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

function InfoBox({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className="mt-1.5 font-semibold text-[#0b1f3a]">{value}</p>
    {helper && <p className="mt-1 text-xs text-slate-500">{helper}</p>}
  </div>;
}

function IncomingOffer({ offer, request, isAccepting, onAccept }: { offer: OfferRecord; request: RequestRecord; isAccepting: boolean; onAccept: (id: string) => void }) {
  const statusClass = offer.status === "pending" ? "bg-amber-50 text-amber-700" : offer.status === "accepted" ? "bg-emerald-50 text-emerald-700" : offer.status === "rejected" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600";
  const agentName = offer.agent?.full_name || offer.agent?.company_name || "Agent nomi ko‘rsatilmagan";
  const companyLine = [offer.agent?.company_name, offer.agent?.city].filter(Boolean).join(" · ") || "Kompaniya va shahar ko‘rsatilmagan";

  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-500">Taklif kimdan</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-[#0b1f3a]">{agentName}</p>
          {offer.agent?.is_verified && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">✓ Tasdiqlangan</span>}
        </div>
        <p className="mt-1 text-sm text-slate-500">{companyLine}</p>
      </div>
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass}`}>{offerStatuses[offer.status]}</span>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <InfoBox label="Taklif summasi" value={offer.price == null ? "Narx ko‘rsatilmagan" : `${offer.price.toLocaleString("uz-UZ")} ${offer.currency}`} />
      {hasAirTravel(request) && <InfoBox label="Aviakompaniya" value={formatAirline(offer.airline)} />}
      {hasAirTravel(request) && <InfoBox label="Bagaj" value={offer.baggage || "Ko‘rsatilmagan"} />}
    </div>

    {offer.comment && <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-500">Taklif izohi</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{offer.comment}</p></div>}

    {offer.status === "pending" && request.status === "open" && isRequestCurrent(request) && <button type="button" disabled={isAccepting} onClick={() => onAccept(offer.id)} className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isAccepting ? "Qabul qilinmoqda..." : "Shu taklifni qabul qilish"}</button>}
  </article>;
}

export default function RequestDetailPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffersLoading, setIsOffersLoading] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      const requestId = requestIdFromLocation();
      if (!requestId) {
        setError("So‘rov identifikatori topilmadi.");
        setIsLoading(false);
        return;
      }
      setId(requestId);
      setSession(storedSession);
      getRequest(requestId).then((loadedRequest) => {
        setRequest(loadedRequest);
        if (loadedRequest?.created_by === storedSession.user.id) {
          setIsOffersLoading(true);
          return getOffersForRequest(requestId).then(setOffers).finally(() => setIsOffersLoading(false));
        }
        return undefined;
      }).catch((requestError: unknown) => {
        if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setError("So‘rovni yuklashda xatolik yuz berdi.");
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function changeStatus(status: "closed" | "cancelled") {
    if (!request || request.status !== "open" || isWorking) return;
    setIsWorking(true); setError(""); setMessage("");
    try {
      const updated = await updateRequestStatus(request.id, status);
      if (!updated) throw new Error("Status o‘zgarmadi.");
      setRequest({ ...request, ...updated, status });
      setMessage(status === "closed" ? "So‘rov yopildi." : "So‘rov bekor qilindi.");
    } catch { setError("So‘rov statusini o‘zgartirib bo‘lmadi."); } finally { setIsWorking(false); }
  }

  async function handleDelete() {
    if (!request || !["closed", "cancelled"].includes(request.status) || isWorking || !window.confirm("O‘chirishga ishonchingiz komilmi?")) return;
    setIsWorking(true); setError("");
    try { await deleteRequest(request.id); router.push("/requests"); } catch { setError("So‘rovni o‘chirishda xatolik yuz berdi."); setIsWorking(false); }
  }

  async function handleAcceptOffer(offerId: string) {
    if (!request || request.status !== "open" || !isRequestCurrent(request) || isAccepting || !window.confirm("Ushbu taklifni qabul qilasizmi?")) return;
    setIsAccepting(true); setError(""); setMessage("");
    try {
      const result = await acceptOffer(offerId);
      const dealId = typeof result === "string" ? result : result.deal_id;
      if (!dealId) throw new Error("DEAL_ID_MISSING");
      setRequest({ ...request, status: "accepted" });
      setOffers((current) => current.map((offer) => offer.id === offerId ? { ...offer, status: "accepted" } : { ...offer, status: offer.status === "pending" ? "rejected" : offer.status }));
      setMessage("Taklif qabul qilindi. Bitim yaratildi.");
      window.setTimeout(() => router.push(`/deals/${dealId}`), 700);
    } catch { setError("Taklifni qabul qilib bo‘lmadi. Qayta urinib ko‘ring."); } finally { setIsAccepting(false); }
  }

  const isOwner = Boolean(session && request && session.user.id === request.created_by);
  const isOpen = request?.status === "open" && isRequestCurrent(request);
  const canDelete = isOwner && Boolean(request && ["closed", "cancelled"].includes(request.status));
  const travelers = request ? Math.max(0, Number(request.adults || 0) + Number(request.children || 0) + Number(request.infants || 0)) : 0;
  const creatorName = request?.creator?.full_name || request?.creator?.company_name || "Agent nomi ko‘rsatilmagan";
  const creatorDetails = request ? [request.creator?.company_name, request.creator?.city].filter(Boolean).join(" · ") : "";

  return <AppShell session={session} activePath="/requests">
    {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">So‘rov yuklanmoqda...</div>}
    {error && !request && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/requests" className="ml-2 font-semibold underline">So‘rovlarga qaytish</Link></div>}

    {request && <div className="mx-auto max-w-6xl">
      <Link href="/requests" className="inline-flex rounded-lg px-2 py-1 text-sm font-semibold text-blue-600 hover:bg-blue-50">← So‘rovlar va takliflarga qaytish</Link>

      <header className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">So‘rov ma’lumoti</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#0b1f3a] sm:text-3xl">{requestTitle(request)}</h1>
            <p className="mt-2 text-sm text-slate-500">{request.category} · {isOwner ? "Siz yaratgansiz" : `So‘rov egasi: ${creatorName}`}</p>
          </div>
          <span className={`w-fit rounded-full px-4 py-2 text-sm font-semibold ${isOpen ? "bg-emerald-50 text-emerald-700" : request.status === "cancelled" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{requestStatuses[request.status]}</span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoBox label="Kimdan" value={isOwner ? "Sizning so‘rovingiz" : creatorName} helper={isOwner ? creatorDetails || undefined : creatorDetails || undefined} />
          <InfoBox label="Safar sanasi" value={formatDate(request.travel_date)} />
          <InfoBox label="Yo‘lovchilar" value={travelers ? `${travelers} kishi` : "Ko‘rsatilmagan"} />
          <InfoBox label="Yaratilgan" value={formatDate(request.created_at)} />
        </div>
      </header>

      {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
      {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_0.75fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">1</span><div><h2 className="text-lg font-semibold text-[#0b1f3a]">Nima kerak?</h2><p className="text-xs text-slate-500">Safar va xizmatning to‘liq tafsilotlari</p></div></div>
          <div className="mt-5"><RequestServiceDetails request={request} /></div>
          {request.description && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Qo‘shimcha izoh</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{request.description}</p></div>}
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">So‘rov egasi</p>
            <p className="mt-3 text-lg font-semibold text-[#0b1f3a]">{creatorName}</p>
            <p className="mt-1 text-sm text-slate-500">{creatorDetails || "Kompaniya va shahar ko‘rsatilmagan"}</p>
            {request.creator?.agent_type && <p className="mt-2 text-xs text-slate-500">Faoliyat turi: {request.creator.agent_type}</p>}
            {request.creator?.is_verified && <span className="mt-3 inline-flex rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">✓ Tasdiqlangan agent</span>}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-[#0b1f3a]">Amallar</p>
            {isOwner && isOpen && <div className="mt-4 space-y-3"><Link href={`/requests/${request.id}/edit`} className="block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700">So‘rovni tahrirlash</Link><button type="button" disabled={isWorking} onClick={() => changeStatus("closed")} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50">So‘rovni yopish</button><button type="button" disabled={isWorking} onClick={() => changeStatus("cancelled")} className="w-full rounded-xl border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50">Bekor qilish</button></div>}
            {canDelete && <button type="button" disabled={isWorking} onClick={handleDelete} className="mt-4 w-full rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Tarixdan o‘chirish</button>}
            {!isOwner && (isOpen ? <Link href={`/requests?tab=market&request_id=${request.id}`} className="mt-4 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700">Taklif berish</Link> : <button type="button" disabled className="mt-4 w-full rounded-xl bg-slate-200 px-4 py-3 text-sm font-semibold text-slate-500">Taklif berish yopilgan</button>)}
          </section>
        </aside>
      </div>

      {!isOwner && id && <RequestTargetingSummary requestId={id} isOwner={false} distributionMode={request.distribution_mode || "targeted"} />}
      {isOwner && isOpen && <SupplierMatching request={request} />}

      {isOwner && <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Kelgan takliflar</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Kim nima taklif qildi?</h2><p className="mt-1 text-sm text-slate-500">Har bir taklifda hamkor, narx va shartlar aniq ko‘rsatiladi.</p></div>
          <span className="w-fit rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{offers.length} ta taklif</span>
        </div>
        {isOffersLoading ? <div className="mt-6 h-32 animate-pulse rounded-2xl bg-slate-100" /> : offers.length ? <div className="mt-6 space-y-4">{offers.map((offer) => <IncomingOffer key={offer.id} offer={offer} request={request} isAccepting={isAccepting} onAccept={handleAcceptOffer} />)}</div> : <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">Hozircha taklif kelmagan.</div>}
      </section>}
    </div>}
  </AppShell>;
}
