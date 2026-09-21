"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import OfferForm from "@/app/offers/offer-form";
import { createOffer, listIncomingOffers, listMyOffers, updateOffer, withdrawOffer, type OfferPayload, type OfferRecord } from "@/app/offers/offers-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { formatAirline } from "@/data/airlines";
import { listRequests, type RequestRecord, type RequestStatus } from "@/app/requests/requests-api";

const categories = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Viza", "Boshqa"];
const requestStatusLabels: Record<RequestStatus | "all", string> = { all: "Barcha statuslar", open: "Ochiq", accepted: "Qabul qilingan", closed: "Yopilgan", cancelled: "Bekor qilingan" };
const offerStatusLabels = { pending: "Kutilmoqda", accepted: "Qabul qilingan", rejected: "Rad etilgan", withdrawn: "Qaytarib olingan" } as const;

type Tab = "market" | "my-requests" | "my-offers" | "incoming-offers";
const tabs: { id: Tab; label: string }[] = [
  { id: "market", label: "Bozor" },
  { id: "my-requests", label: "Mening so‘rovlarim" },
  { id: "my-offers", label: "Mening takliflarim" },
  { id: "incoming-offers", label: "Menga kelgan takliflar" },
];

function isTab(value: string | null): value is Tab {
  return value === "market" || value === "my-requests" || value === "my-offers" || value === "incoming-offers";
}

function formatDate(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function MarketRequestCard({ request, isOwner, isFormOpen, hasOffered, offerMessage, onToggleForm, onSubmitOffer }: {
  request: RequestRecord;
  isOwner: boolean;
  isFormOpen: boolean;
  hasOffered: boolean;
  offerMessage: string;
  onToggleForm: () => void;
  onSubmitOffer: (payload: OfferPayload) => Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <Link href={`/requests/${request.id}`} className="block rounded-xl focus:outline-none focus:ring-4 focus:ring-blue-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-[#0b1f3a]">{request.origin || "—"} <span className="px-1 text-blue-500">→</span> {request.destination || "—"}</h2>{isOwner && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700">Mening so‘rovim</span>}</div><p className="mt-2 text-sm text-slate-500">{request.category} · {formatDate(request.travel_date)}</p></div><span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Ochiq</span></div>
        <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 sm:grid-cols-3"><span>{request.adults} kattalar · {request.children} bolalar · {request.infants} go‘daklar</span><span>Bagaj: {request.baggage || "Ko‘rsatilmagan"}</span><span className="font-semibold text-[#0b1f3a]">{request.budget == null ? "Budjet ko‘rsatilmagan" : `${request.budget.toLocaleString("uz-UZ")} ${request.currency}`}</span></div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400"><span>{request.creator?.full_name || "Agent nomi ko‘rsatilmagan"}</span><span>{request.creator?.company_name || "Kompaniya ko‘rsatilmagan"}</span><span>{request.creator?.city || "Shahar ko‘rsatilmagan"}</span>{request.creator?.is_verified && <span className="font-semibold text-blue-600">Tasdiqlangan agent</span>}<span className="sm:ml-auto">Yaratilgan: {formatDate(request.created_at)}</span></div>
      </Link>
      {!isOwner && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {offerMessage ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">{offerMessage}</p>
          : hasOffered ? <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500">Taklif yuborilgan</span>
          : <button type="button" onClick={onToggleForm} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">{isFormOpen ? "Formani yopish" : "Taklif berish"}</button>}
      </div>}
      {!isOwner && isFormOpen && !hasOffered && !offerMessage && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5"><OfferForm submitLabel="Taklif yuborish" submittingLabel="Yuborilmoqda..." onSubmit={onSubmitOffer} /></div>}
    </div>
  );
}

function MyRequestCard({ request, offersCount }: { request: RequestRecord; offersCount: number }) {
  const statusClass = request.status === "open" ? "bg-emerald-50 text-emerald-700" : request.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return (
    <Link href={`/requests/${request.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-[#0b1f3a]">{request.origin || "—"} <span className="px-1 text-blue-500">→</span> {request.destination || "—"}</h2><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700">Mening so‘rovim</span></div><p className="mt-2 text-sm text-slate-500">{request.category} · {formatDate(request.travel_date)}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{requestStatusLabels[request.status]}</span></div>
      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 sm:grid-cols-3"><span>{request.adults} kattalar · {request.children} bolalar · {request.infants} go‘daklar</span><span>Bagaj: {request.baggage || "Ko‘rsatilmagan"}</span><span className="font-semibold text-[#0b1f3a]">{request.budget == null ? "Budjet ko‘rsatilmagan" : `${request.budget.toLocaleString("uz-UZ")} ${request.currency}`}</span></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><span className="text-xs text-slate-400">Yaratilgan: {formatDate(request.created_at)}</span><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{offersCount} ta taklif keldi</span></div>
    </Link>
  );
}

function MyOfferCard({ offer, onEdit, onWithdraw }: { offer: OfferRecord; onEdit: (offer: OfferRecord) => void; onWithdraw: (offer: OfferRecord) => void }) {
  const statusClass = offer.status === "pending" ? "bg-amber-50 text-amber-700" : offer.status === "accepted" ? "bg-emerald-50 text-emerald-700" : offer.status === "rejected" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><Link href={`/requests/${offer.request_id}`} className="text-lg font-semibold text-[#0b1f3a] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">{offer.request?.origin || "—"} <span className="px-1 text-blue-500">→</span> {offer.request?.destination || "—"}</Link><p className="mt-2 text-sm text-slate-500">{offer.request?.category || "Kategoriya ko‘rsatilmagan"} · {formatDate(offer.request?.travel_date || null)}</p></div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{offerStatusLabels[offer.status]}</span>
      </div>
      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2"><p className="text-xl font-semibold text-[#0b1f3a]">{offer.price == null ? "Narx ko‘rsatilmagan" : `${offer.price.toLocaleString("uz-UZ")} ${offer.currency}`}</p><p className="text-sm text-slate-500">Aviakompaniya: {formatAirline(offer.airline)}</p><p className="text-sm text-slate-500">Bagaj: {offer.baggage || "Ko‘rsatilmagan"}</p>{offer.comment && <p className="text-sm text-slate-500 sm:col-span-2">{offer.comment}</p>}</div>
      <p className="mt-4 text-xs text-slate-400">{formatDate(offer.created_at)}</p>
      {offer.status === "pending" && <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => onEdit(offer)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Tahrirlash</button><button type="button" onClick={() => onWithdraw(offer)} className="rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500">Taklifni qaytarib olish</button></div>}
    </article>
  );
}

function IncomingOfferCard({ offer }: { offer: OfferRecord }) {
  const statusClass = offer.status === "pending" ? "bg-amber-50 text-amber-700" : offer.status === "accepted" ? "bg-emerald-50 text-emerald-700" : offer.status === "rejected" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-lg font-semibold text-[#0b1f3a]">{offer.request?.origin || "—"} <span className="px-1 text-blue-500">→</span> {offer.request?.destination || "—"}</p><p className="mt-2 text-sm text-slate-500">{offer.request?.category || "Kategoriya ko‘rsatilmagan"} · {formatDate(offer.request?.travel_date || null)}</p><p className="mt-2 text-sm text-slate-500">{offer.agent?.full_name || "Agent nomi ko‘rsatilmagan"} · {offer.agent?.company_name || "Kompaniya ko‘rsatilmagan"}</p></div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{offerStatusLabels[offer.status]}</span>
      </div>
      <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2"><p className="text-xl font-semibold text-[#0b1f3a]">{offer.price == null ? "Narx ko‘rsatilmagan" : `${offer.price.toLocaleString("uz-UZ")} ${offer.currency}`}</p><p className="text-sm text-slate-500">Aviakompaniya: {formatAirline(offer.airline)}</p><p className="text-sm text-slate-500">Bagaj: {offer.baggage || "Ko‘rsatilmagan"}</p>{offer.comment && <p className="text-sm text-slate-500 sm:col-span-2">{offer.comment}</p>}</div>
      <Link href={`/requests/${offer.request_id}`} className="mt-5 inline-flex rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">So‘rovni ko‘rish</Link>
    </article>
  );
}

export default function RequestsPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tab, setTab] = useState<Tab>("market");

  const [marketRequests, setMarketRequests] = useState<RequestRecord[]>([]);
  const [marketCategory, setMarketCategory] = useState("");
  const [marketSearch, setMarketSearch] = useState("");
  const [isMarketLoading, setIsMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState("");

  const [myRequests, setMyRequests] = useState<RequestRecord[]>([]);
  const [myStatus, setMyStatus] = useState<RequestStatus | "all">("all");
  const [myCategory, setMyCategory] = useState("");
  const [mySearch, setMySearch] = useState("");
  const [isMyRequestsLoading, setIsMyRequestsLoading] = useState(true);
  const [myRequestsError, setMyRequestsError] = useState("");

  const [myOffers, setMyOffers] = useState<OfferRecord[]>([]);
  const [isMyOffersLoading, setIsMyOffersLoading] = useState(true);
  const [myOffersError, setMyOffersError] = useState("");
  const [editingOffer, setEditingOffer] = useState<OfferRecord | null>(null);

  const [incomingOffers, setIncomingOffers] = useState<OfferRecord[]>([]);
  const [isIncomingLoading, setIsIncomingLoading] = useState(true);
  const [incomingError, setIncomingError] = useState("");

  const [openOfferRequestId, setOpenOfferRequestId] = useState<string | null>(null);
  const [offeredRequestIds, setOfferedRequestIds] = useState<Set<string>>(new Set());
  const [offerSuccessId, setOfferSuccessId] = useState<string | null>(null);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get("tab");
      if (isTab(urlTab)) setTab(urlTab);
      const requestId = params.get("request_id");
      if (requestId) setOpenOfferRequestId(requestId);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function changeTab(nextTab: Tab) {
    setTab(nextTab);
    router.replace(`/requests?tab=${nextTab}`);
  }

  useEffect(() => {
    if (!session || tab !== "market") return;
    const timeoutId = window.setTimeout(() => {
      setIsMarketLoading(true); setMarketError("");
      listRequests({ status: "open", category: marketCategory, search: marketSearch })
        .then(setMarketRequests)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setMarketError("So‘rovlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => setIsMarketLoading(false));
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab, marketCategory, marketSearch]);

  useEffect(() => {
    if (!session || tab !== "market") return;
    const timeoutId = window.setTimeout(() => {
      listMyOffers()
        .then((offers) => setOfferedRequestIds(new Set(offers.filter((offer) => offer.status !== "withdrawn").map((offer) => offer.request_id))))
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab]);

  useEffect(() => {
    if (!session || tab !== "my-requests") return;
    const timeoutId = window.setTimeout(() => {
      setIsMyRequestsLoading(true); setMyRequestsError("");
      listRequests({ status: myStatus, category: myCategory, search: mySearch, createdBy: session.user.id })
        .then(setMyRequests)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setMyRequestsError("So‘rovlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => setIsMyRequestsLoading(false));
    }, 350);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab, myStatus, myCategory, mySearch]);

  useEffect(() => {
    if (!session || (tab !== "my-requests" && tab !== "incoming-offers")) return;
    const timeoutId = window.setTimeout(() => {
      setIsIncomingLoading(true); setIncomingError("");
      listIncomingOffers()
        .then(setIncomingOffers)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setIncomingError("Takliflarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => setIsIncomingLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab]);

  useEffect(() => {
    if (!session || tab !== "my-offers") return;
    const timeoutId = window.setTimeout(() => {
      setIsMyOffersLoading(true); setMyOffersError("");
      listMyOffers()
        .then(setMyOffers)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setMyOffersError("Takliflarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => setIsMyOffersLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab]);

  async function submitMarketOffer(requestId: string, payload: OfferPayload) {
    try {
      await createOffer(requestId, payload);
      setOfferedRequestIds((current) => new Set(current).add(requestId));
      setOfferSuccessId(requestId);
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message === "SUPABASE_409") throw new Error("Bu so‘rov uchun avval taklif yuborgansiz.");
      throw new Error("Taklifni yuborib bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.");
    }
  }

  async function submitEdit(payload: OfferPayload) {
    if (!editingOffer || editingOffer.status !== "pending") return;
    const updated = await updateOffer(editingOffer.id, payload);
    if (!updated) throw new Error("Faqat kutilayotgan taklifni tahrirlash mumkin.");
    setMyOffers((current) => current.map((offer) => offer.id === updated.id ? { ...offer, ...updated } : offer));
    setEditingOffer(null);
  }

  async function handleWithdraw(offer: OfferRecord) {
    if (offer.status !== "pending" || !window.confirm("Taklifni qaytarib olishga ishonchingiz komilmi?")) return;
    try {
      const updated = await withdrawOffer(offer.id);
      if (updated) setMyOffers((current) => current.map((item) => item.id === offer.id ? { ...item, ...updated } : item));
    } catch { setMyOffersError("Taklifni qaytarib olib bo‘lmadi."); }
  }

  const offerCountByRequest = incomingOffers.reduce<Record<string, number>>((acc, offer) => {
    acc[offer.request_id] = (acc[offer.request_id] || 0) + 1;
    return acc;
  }, {});
  const pendingIncomingCount = incomingOffers.filter((offer) => offer.status === "pending").length;

  function clearMarketFilters() { setMarketCategory(""); setMarketSearch(""); }
  function clearMyFilters() { setMyStatus("all"); setMyCategory(""); setMySearch(""); }

  const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return (
    <AppShell session={session} activePath="/requests">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Ish maydoni</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">So‘rovlar va takliflar</h1><p className="mt-2 text-sm text-slate-500">Agentlar so‘rovlarini ko‘ring, taklif yuboring va kelgan takliflarni boshqaring.</p></div><Link href="/requests/new" className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Yangi so‘rov</Link></header>

      <nav aria-label="Ish maydoni bo‘limlari" className="mt-8 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs.map((item) => (
          <button key={item.id} type="button" onClick={() => changeTab(item.id)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${tab === item.id ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-100"}`}>
            <span>{item.label}</span>
            {item.id === "incoming-offers" && pendingIncomingCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === item.id ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"}`}>{pendingIncomingCount}</span>}
          </button>
        ))}
      </nav>

      {tab === "market" && <section className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]"><label className="sr-only" htmlFor="market-category">Kategoriya</label><select id="market-category" value={marketCategory} onChange={(event) => setMarketCategory(event.target.value)} className={inputClass}><option value="">Barcha kategoriyalar</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="sr-only" htmlFor="market-search">Qidiruv</label><input id="market-search" value={marketSearch} onChange={(event) => setMarketSearch(event.target.value)} placeholder="Origin yoki destination bo‘yicha qidirish" className={inputClass} />{(marketCategory || marketSearch) && <button type="button" onClick={clearMarketFilters} className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Filtrni tozalash</button>}</div>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-emerald-600">Status: Ochiq</p>
        </div>
        {marketError && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{marketError}</p>}
        {isMarketLoading ? <div className="mt-6 space-y-4" aria-label="So‘rovlar yuklanmoqda"><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /></div>
          : marketRequests.length ? <div className="mt-6 space-y-4">{marketRequests.map((request) => <MarketRequestCard key={request.id} request={request} isOwner={session?.user.id === request.created_by} isFormOpen={openOfferRequestId === request.id} hasOffered={offeredRequestIds.has(request.id)} offerMessage={offerSuccessId === request.id ? "Taklif yuborildi" : ""} onToggleForm={() => setOpenOfferRequestId((current) => current === request.id ? null : request.id)} onSubmitOffer={(payload) => submitMarketOffer(request.id, payload)} />)}</div>
          : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">Hozircha ochiq so‘rovlar yo‘q</p><p className="mt-2 text-sm text-slate-500">Filtrlarni o‘zgartirib ko‘ring.</p></div>}
      </section>}

      {tab === "my-requests" && <section className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]"><label className="sr-only" htmlFor="my-status">Status</label><select id="my-status" value={myStatus} onChange={(event) => setMyStatus(event.target.value as RequestStatus | "all")} className={inputClass}>{Object.entries(requestStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><label className="sr-only" htmlFor="my-category">Kategoriya</label><select id="my-category" value={myCategory} onChange={(event) => setMyCategory(event.target.value)} className={inputClass}><option value="">Barcha kategoriyalar</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><label className="sr-only" htmlFor="my-search">Qidiruv</label><input id="my-search" value={mySearch} onChange={(event) => setMySearch(event.target.value)} placeholder="Origin yoki destination bo‘yicha qidirish" className={inputClass} />{(myStatus !== "all" || myCategory || mySearch) && <button type="button" onClick={clearMyFilters} className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Filtrni tozalash</button>}</div>
        </div>
        {myRequestsError && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{myRequestsError}</p>}
        {isMyRequestsLoading || isIncomingLoading ? <div className="mt-6 space-y-4" aria-label="So‘rovlar yuklanmoqda"><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /></div>
          : myRequests.length ? <div className="mt-6 space-y-4">{myRequests.map((request) => <MyRequestCard key={request.id} request={request} offersCount={offerCountByRequest[request.id] || 0} />)}</div>
          : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">Hozircha so‘rovlar yo‘q</p><p className="mt-2 text-sm text-slate-500">Filtrlarni o‘zgartiring yoki yangi so‘rov yarating.</p><Link href="/requests/new" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-100">Yangi so‘rov yaratish</Link></div>}
      </section>}

      {tab === "my-offers" && <section className="mt-6">
        {editingOffer && <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-[#0b1f3a]">Taklifni tahrirlash</h2><button type="button" onClick={() => setEditingOffer(null)} className="text-sm font-semibold text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Bekor qilish</button></div><div className="mt-5"><OfferForm initialValues={editingOffer} submitLabel="Saqlash" submittingLabel="Saqlanmoqda..." onSubmit={submitEdit} /></div></div>}
        {myOffersError && <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{myOffersError}</p>}
        {isMyOffersLoading ? <div className="space-y-4" aria-label="Takliflar yuklanmoqda"><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /></div>
          : myOffers.length ? <div className="space-y-4">{myOffers.map((offer) => <MyOfferCard key={offer.id} offer={offer} onEdit={setEditingOffer} onWithdraw={handleWithdraw} />)}</div>
          : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">Hozircha takliflar yo‘q</p><p className="mt-2 text-sm text-slate-500">Bozor bo‘limidan so‘rovlarga taklif yuboring.</p></div>}
      </section>}

      {tab === "incoming-offers" && <section className="mt-6">
        {incomingError && <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{incomingError}</p>}
        {isIncomingLoading ? <div className="space-y-4" aria-label="Takliflar yuklanmoqda"><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /><div className="h-44 animate-pulse rounded-2xl bg-slate-200" /></div>
          : incomingOffers.length ? <div className="space-y-4">{incomingOffers.map((offer) => <IncomingOfferCard key={offer.id} offer={offer} />)}</div>
          : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">Hozircha takliflar yo‘q</p><p className="mt-2 text-sm text-slate-500">So‘rovlaringizga takliflar kelganda shu yerda ko‘rinadi.</p></div>}
      </section>}
    </AppShell>
  );
}
