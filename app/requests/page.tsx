"use client";

import { isRequestCurrent } from "@/lib/request-freshness";
import Link from "next/link";
import RequestServiceDetails from "@/app/requests/request-service-details";
import { hasAirTravel, requestTitle } from "@/lib/service-request";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import OfferForm from "@/app/offers/offer-form";
import { createOffer, listIncomingOffers, listMyOffers, updateOffer, withdrawOffer, type OfferPayload, type OfferRecord } from "@/app/offers/offers-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";
import { formatAirline } from "@/data/airlines";
import { deleteRequest, listRequests, type RequestRecord, type RequestStatus } from "@/app/requests/requests-api";

const categories = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Gid", "Viza", "Boshqa"];
const categoryRu: Record<string, string> = { Aviachipta: "Авиабилет", "Tur paket": "Турпакет", Mehmonxona: "Отель", Transfer: "Трансфер", Gid: "Гид", Viza: "Виза", Boshqa: "Другое" };
type Tab = "market" | "my-requests" | "my-offers" | "incoming-offers";
const tr = (isRu: boolean, uz: string, ru: string) => isRu ? ru : uz;
const cat = (value: string | null | undefined, isRu: boolean) => value ? (isRu ? categoryRu[value] || value : value) : tr(isRu, "Kategoriya ko‘rsatilmagan", "Категория не указана");

function isTab(value: string | null): value is Tab { return value === "market" || value === "my-requests" || value === "my-offers" || value === "incoming-offers"; }

function formatDate(value: string | null, isRu: boolean) {
  if (!value) return tr(isRu, "Sana ko‘rsatilmagan", "Дата не указана");
  return new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function requestStatusLabel(status: RequestStatus | "all", isRu: boolean) {
  const uz: Record<RequestStatus | "all", string> = { all: "Barcha holatlar", open: "Ochiq", accepted: "Qabul qilingan", closed: "Yopilgan", cancelled: "Bekor qilingan" };
  const ru: Record<RequestStatus | "all", string> = { all: "Все статусы", open: "Открыт", accepted: "Принят", closed: "Закрыт", cancelled: "Отменён" };
  return isRu ? ru[status] : uz[status];
}

function offerStatusLabel(status: OfferRecord["status"], isRu: boolean) {
  const uz = { pending: "Javob kutilmoqda", accepted: "Qabul qilingan", rejected: "Rad etilgan", withdrawn: "Qaytarib olingan" } as const;
  const ru = { pending: "Ожидает решения", accepted: "Принято", rejected: "Отклонено", withdrawn: "Отозвано" } as const;
  return isRu ? ru[status] : uz[status];
}

function requestStatusClass(status: RequestStatus, current: boolean) {
  if (status === "open" && current) return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-rose-50 text-rose-700";
  if (status === "accepted") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function offerStatusClass(status: OfferRecord["status"]) {
  if (status === "pending") return "bg-amber-50 text-amber-700";
  if (status === "accepted") return "bg-emerald-50 text-emerald-700";
  if (status === "rejected") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function MetaBox({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className={`rounded-xl border p-3 ${accent ? "border-blue-100 bg-blue-50/60" : "border-slate-200 bg-slate-50/70"}`}>
    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
    <p className="mt-1 truncate text-sm font-semibold text-[#0b1f3a]">{value}</p>
  </div>;
}

function RequestOwner({ request, isRu }: { request: RequestRecord; isRu: boolean }) {
  const name = request.creator?.full_name || request.creator?.company_name || tr(isRu, "Agent nomi ko‘rsatilmagan", "Имя агента не указано");
  const details = [request.creator?.company_name, request.creator?.city].filter(Boolean).join(" · ") || tr(isRu, "Kompaniya va shahar ko‘rsatilmagan", "Компания и город не указаны");
  return <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-500">{tr(isRu, "So‘rov kimdan", "Кто создал запрос")}</p>
      {request.creator?.is_verified && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700">✓ {tr(isRu, "Tasdiqlangan", "Проверен")}</span>}
    </div>
    <p className="mt-2 font-semibold text-[#0b1f3a]">{name}</p>
    <p className="mt-1 text-sm text-slate-500">{details}</p>
  </div>;
}

function MarketRequestCard({ request, isOwner, isFormOpen, hasOffered, offerMessage, onToggleForm, onSubmitOffer, isRu }: {
  request: RequestRecord;
  isOwner: boolean;
  isFormOpen: boolean;
  hasOffered: boolean;
  offerMessage: string;
  onToggleForm: () => void;
  onSubmitOffer: (payload: OfferPayload) => Promise<void>;
  isRu: boolean;
}) {
  const current = isRequestCurrent(request);
  const travelers = Math.max(0, Number(request.adults || 0) + Number(request.children || 0) + Number(request.infants || 0));
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6">
    <Link href={`/requests/${request.id}`} className="block rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">{cat(request.category, isRu)}</span>
            {isOwner && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700">{tr(isRu, "Mening so‘rovim", "Мой запрос")}</span>}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-[#0b1f3a]">{requestTitle(request)}</h2>
          <p className="mt-1 text-sm text-slate-500">{tr(isRu, "Bosib to‘liq ma’lumotni ko‘ring", "Нажмите, чтобы открыть все детали")}</p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${requestStatusClass(request.status, current)}`}>{current ? tr(isRu, "Ochiq", "Открыт") : tr(isRu, "Muddati o‘tgan", "Истёк")}</span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <MetaBox label={tr(isRu, "Safar sanasi", "Дата поездки")} value={formatDate(request.travel_date, isRu)} />
        <MetaBox label={tr(isRu, "Yo‘lovchilar", "Пассажиры")} value={travelers ? `${travelers} ${tr(isRu, "kishi", "чел.")}` : tr(isRu, "Ko‘rsatilmagan", "Не указано")} />
        <MetaBox label={tr(isRu, "Yaratilgan", "Создан")} value={formatDate(request.created_at, isRu)} />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 p-4"><p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr(isRu, "Nima kerak", "Что требуется")}</p><RequestServiceDetails request={request} compact /></div>
      {!isOwner && <div className="mt-4"><RequestOwner request={request} isRu={isRu} /></div>}
    </Link>

    {!isOwner && current && <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
      {offerMessage ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">✓ {offerMessage}</p>
        : hasOffered ? <span className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-500">✓ {tr(isRu, "Siz taklif yuborgansiz", "Вы уже отправили предложение")}</span>
          : <button type="button" onClick={onToggleForm} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">{isFormOpen ? tr(isRu, "Taklif formasini yopish", "Закрыть форму") : tr(isRu, "Taklif berish", "Дать предложение")}</button>}
    </div>}

    {!isOwner && current && isFormOpen && !hasOffered && !offerMessage && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5"><p className="mb-4 text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Narx va shartlaringizni kiriting", "Укажите цену и условия")}</p><OfferForm category={request.category} serviceDetails={request.service_details} submitLabel={tr(isRu, "Taklif yuborish", "Отправить предложение")} submittingLabel={tr(isRu, "Yuborilmoqda...", "Отправка...")} onSubmit={onSubmitOffer} /></div>}
  </article>;
}

function MyRequestCard({ request, offersCount, isRu, isDeleting, onDelete }: { request: RequestRecord; offersCount: number; isRu: boolean; isDeleting: boolean; onDelete: (request: RequestRecord) => void }) {
  const current = isRequestCurrent(request);
  const canDelete = request.status === "closed" || request.status === "cancelled" || (request.status === "open" && !current);
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md sm:p-6">
    <Link href={`/requests/${request.id}`} className="block rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-600">{tr(isRu, "Siz yaratgan so‘rov", "Ваш запрос")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{requestTitle(request)}</h2><p className="mt-1 text-sm text-slate-500">{cat(request.category, isRu)} · {formatDate(request.travel_date, isRu)}</p></div>
        <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${requestStatusClass(request.status, current)}`}>{request.status === "open" && !current ? tr(isRu, "Muddati o‘tgan", "Истёк") : requestStatusLabel(request.status, isRu)}</span>
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200 p-4"><RequestServiceDetails request={request} compact /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-400">{tr(isRu, "Yaratilgan", "Создан")}: {formatDate(request.created_at, isRu)}</span>
        <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${offersCount ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{offersCount} {tr(isRu, "ta taklif keldi", "предложений")}</span>
      </div>
    </Link>
    {canDelete && <div className="mt-4 flex justify-end border-t border-slate-100 pt-3"><button type="button" disabled={isDeleting} onClick={() => onDelete(request)} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">{isDeleting ? tr(isRu, "O‘chirilmoqda...", "Удаление...") : tr(isRu, "Tarixdan o‘chirish", "Удалить из истории")}</button></div>}
  </article>;
}

function MyOfferCard({ offer, onEdit, onWithdraw, isRu }: { offer: OfferRecord; onEdit: (offer: OfferRecord) => void; onWithdraw: (offer: OfferRecord) => void; isRu: boolean }) {
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-500">{tr(isRu, "Siz yuborgan taklif", "Ваше предложение")}</p><Link href={`/requests/${offer.request_id}`} className="mt-2 block text-xl font-semibold text-[#0b1f3a] hover:text-blue-700">{requestTitle(offer.request || {})}</Link><p className="mt-1 text-sm text-slate-500">{cat(offer.request?.category, isRu)} · {formatDate(offer.request?.travel_date || null, isRu)}</p></div>
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${offerStatusClass(offer.status)}`}>{offerStatusLabel(offer.status, isRu)}</span>
    </div>
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <MetaBox label={tr(isRu, "Siz taklif qilgan narx", "Ваша цена")} value={offer.price == null ? tr(isRu, "Narx ko‘rsatilmagan", "Цена не указана") : `${offer.price.toLocaleString(isRu ? "ru-RU" : "uz-UZ")} ${offer.currency}`} accent />
      {hasAirTravel(offer.request || {}) && <MetaBox label={tr(isRu, "Aviakompaniya", "Авиакомпания")} value={formatAirline(offer.airline)} />}
      {hasAirTravel(offer.request || {}) && <MetaBox label={tr(isRu, "Bagaj", "Багаж")} value={offer.baggage || tr(isRu, "Ko‘rsatilmagan", "Не указан")} />}
    </div>
    {offer.comment && <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr(isRu, "Sizning izohingiz", "Ваш комментарий")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{offer.comment}</p></div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">{tr(isRu, "Yuborilgan", "Отправлено")}: {formatDate(offer.created_at, isRu)}</p>{offer.status === "pending" && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onEdit(offer)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300">{tr(isRu, "Tahrirlash", "Редактировать")}</button><button type="button" onClick={() => onWithdraw(offer)} className="rounded-xl border border-amber-200 px-4 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-50">{tr(isRu, "Qaytarib olish", "Отозвать")}</button></div>}</div>
  </article>;
}

function IncomingOfferCard({ offer, isRu }: { offer: OfferRecord; isRu: boolean }) {
  const agentName = offer.agent?.full_name || offer.agent?.company_name || tr(isRu, "Agent nomi ko‘rsatilmagan", "Имя агента не указано");
  const agentDetails = [offer.agent?.company_name, offer.agent?.city].filter(Boolean).join(" · ") || tr(isRu, "Kompaniya va shahar ko‘rsatilmagan", "Компания и город не указаны");
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">{tr(isRu, "Taklif kimdan keldi", "От кого предложение")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-xl font-semibold text-[#0b1f3a]">{agentName}</p>{offer.agent?.is_verified && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700">✓ {tr(isRu, "Tasdiqlangan", "Проверен")}</span>}</div>
        <p className="mt-1 text-sm text-slate-500">{agentDetails}</p>
      </div>
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${offerStatusClass(offer.status)}`}>{offerStatusLabel(offer.status, isRu)}</span>
    </div>

    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr(isRu, "Qaysi so‘rovga", "На какой запрос")}</p>
      <p className="mt-2 font-semibold text-[#0b1f3a]">{requestTitle(offer.request || {})}</p>
      <p className="mt-1 text-sm text-slate-500">{cat(offer.request?.category, isRu)} · {formatDate(offer.request?.travel_date || null, isRu)}</p>
    </div>

    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <MetaBox label={tr(isRu, "Taklif summasi", "Сумма предложения")} value={offer.price == null ? tr(isRu, "Narx ko‘rsatilmagan", "Цена не указана") : `${offer.price.toLocaleString(isRu ? "ru-RU" : "uz-UZ")} ${offer.currency}`} accent />
      {hasAirTravel(offer.request || {}) && <MetaBox label={tr(isRu, "Aviakompaniya", "Авиакомпания")} value={formatAirline(offer.airline)} />}
      {hasAirTravel(offer.request || {}) && <MetaBox label={tr(isRu, "Bagaj", "Багаж")} value={offer.baggage || tr(isRu, "Ko‘rsatilmagan", "Не указан")} />}
    </div>

    {offer.comment && <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-600">{tr(isRu, "Hamkor izohi", "Комментарий партнёра")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{offer.comment}</p></div>}
    <Link href={`/requests/${offer.request_id}`} className="mt-5 inline-flex rounded-xl bg-[#0b1f3a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">{tr(isRu, "So‘rov va barcha takliflarni ochish", "Открыть запрос и все предложения")} →</Link>
  </article>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">{title}</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>{action}</div>;
}

function LoadingCards() {
  return <div className="space-y-4"><div className="h-56 animate-pulse rounded-3xl bg-slate-200" /><div className="h-56 animate-pulse rounded-3xl bg-slate-200" /></div>;
}

export default function RequestsPage() {
  const router = useRouter();
  const { isRu } = useUiSettings();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tab, setTab] = useState<Tab>("market");
  const tabs: { id: Tab; label: string; hint: string }[] = isRu ? [
    { id: "market", label: "Все запросы", hint: "Запросы партнёров" },
    { id: "my-requests", label: "Мои запросы", hint: "Что ищу я" },
    { id: "my-offers", label: "Мои предложения", hint: "Что предложил я" },
    { id: "incoming-offers", label: "Входящие предложения", hint: "Кто и что предложил мне" },
  ] : [
    { id: "market", label: "Barcha so‘rovlar", hint: "Hamkorlar nimani izlayapti" },
    { id: "my-requests", label: "Mening so‘rovlarim", hint: "Men yaratgan talablar" },
    { id: "my-offers", label: "Yuborgan takliflarim", hint: "Men bergan narx va shartlar" },
    { id: "incoming-offers", label: "Kelgan takliflar", hint: "Kim menga nima taklif qildi" },
  ];

  const [marketPage, setMarketPage] = useState(0);
  const [myPage, setMyPage] = useState(0);
  const [marketFreshness, setMarketFreshness] = useState<"current" | "expired">("current");
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
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
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
    let active = true;
    const timeoutId = window.setTimeout(() => {
      setIsMarketLoading(true);
      setMarketError("");
      listRequests({ status: "open", category: marketCategory, search: marketSearch, freshness: marketFreshness, offset: marketPage * 20 })
        .then((rows) => { if (active) setMarketRequests(rows); })
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          if (active) setMarketError(tr(isRu, "So‘rovlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.", "Не удалось загрузить запросы. Попробуйте ещё раз."));
        })
        .finally(() => { if (active) setIsMarketLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [session, tab, marketCategory, marketSearch, marketFreshness, marketPage, isRu]);

  useEffect(() => {
    if (!session || tab !== "market") return;
    const timeoutId = window.setTimeout(() => {
      listMyOffers().then((offers) => setOfferedRequestIds(new Set(offers.filter((offer) => offer.status !== "withdrawn").map((offer) => offer.request_id)))).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab]);

  useEffect(() => {
    if (!session || tab !== "my-requests") return;
    let active = true;
    const timeoutId = window.setTimeout(() => {
      setIsMyRequestsLoading(true);
      setMyRequestsError("");
      listRequests({ status: myStatus, category: myCategory, search: mySearch, createdBy: session.user.id, offset: myPage * 20 })
        .then((rows) => { if (active) setMyRequests(rows); })
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          if (active) setMyRequestsError(tr(isRu, "So‘rovlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.", "Не удалось загрузить запросы. Попробуйте ещё раз."));
        })
        .finally(() => { if (active) setIsMyRequestsLoading(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [session, tab, myStatus, myCategory, mySearch, myPage, isRu]);

  useEffect(() => {
    if (!session || (tab !== "my-requests" && tab !== "incoming-offers")) return;
    const timeoutId = window.setTimeout(() => {
      setIsIncomingLoading(true);
      setIncomingError("");
      listIncomingOffers().then(setIncomingOffers).catch((requestError: unknown) => {
        if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setIncomingError(tr(isRu, "Takliflarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.", "Не удалось загрузить предложения. Попробуйте ещё раз."));
      }).finally(() => setIsIncomingLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab, isRu]);

  useEffect(() => {
    if (!session || tab !== "my-offers") return;
    const timeoutId = window.setTimeout(() => {
      setIsMyOffersLoading(true);
      setMyOffersError("");
      listMyOffers().then(setMyOffers).catch((requestError: unknown) => {
        if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setMyOffersError(tr(isRu, "Takliflarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.", "Не удалось загрузить предложения. Попробуйте ещё раз."));
      }).finally(() => setIsMyOffersLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [session, tab, isRu]);

  async function submitMarketOffer(requestId: string, payload: OfferPayload) {
    try {
      await createOffer(requestId, payload);
      setOfferedRequestIds((current) => new Set(current).add(requestId));
      setOfferSuccessId(requestId);
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message === "SUPABASE_409") throw new Error(tr(isRu, "Bu so‘rov uchun avval taklif yuborgansiz.", "Вы уже отправляли предложение на этот запрос."));
      throw new Error(tr(isRu, "Taklifni yuborib bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.", "Не удалось отправить предложение. Проверьте данные и попробуйте снова."));
    }
  }

  async function submitEdit(payload: OfferPayload) {
    if (!editingOffer || editingOffer.status !== "pending") return;
    const updated = await updateOffer(editingOffer.id, payload);
    if (!updated) throw new Error(tr(isRu, "Faqat kutilayotgan taklifni tahrirlash mumkin.", "Редактировать можно только ожидающее предложение."));
    setMyOffers((current) => current.map((offer) => offer.id === updated.id ? { ...offer, ...updated } : offer));
    setEditingOffer(null);
  }

  async function handleWithdraw(offer: OfferRecord) {
    if (offer.status !== "pending" || !window.confirm(tr(isRu, "Taklifni qaytarib olishga ishonchingiz komilmi?", "Отозвать предложение?"))) return;
    try {
      const updated = await withdrawOffer(offer.id);
      if (updated) setMyOffers((current) => current.map((item) => item.id === offer.id ? { ...item, ...updated } : item));
    } catch { setMyOffersError(tr(isRu, "Taklifni qaytarib olib bo‘lmadi.", "Не удалось отозвать предложение.")); }
  }

  async function handleDeleteRequest(request: RequestRecord) {
    const canDelete = request.status === "closed" || request.status === "cancelled" || (request.status === "open" && !isRequestCurrent(request));
    if (!canDelete || deletingRequestId || !window.confirm(tr(isRu, "Bu so‘rov tarixdan butunlay o‘chadi. O‘chirishni tasdiqlaysizmi?", "Этот запрос будет удалён из истории безвозвратно. Удалить?"))) return;
    setDeletingRequestId(request.id);
    setMyRequestsError("");
    try {
      await deleteRequest(request.id);
      setMyRequests((current) => current.filter((item) => item.id !== request.id));
      setMarketRequests((current) => current.filter((item) => item.id !== request.id));
      setIncomingOffers((current) => current.filter((offer) => offer.request_id !== request.id));
      if (myRequests.length === 1 && myPage > 0) setMyPage((page) => Math.max(0, page - 1));
    } catch {
      setMyRequestsError(tr(isRu, "So‘rov tarixini o‘chirib bo‘lmadi. Qayta urinib ko‘ring.", "Не удалось удалить запрос из истории. Попробуйте ещё раз."));
    } finally { setDeletingRequestId(null); }
  }

  const offerCountByRequest = incomingOffers.reduce<Record<string, number>>((acc, offer) => { acc[offer.request_id] = (acc[offer.request_id] || 0) + 1; return acc; }, {});
  const pendingIncomingCount = incomingOffers.filter((offer) => offer.status === "pending").length;
  function clearMarketFilters() { setMarketPage(0); setMarketCategory(""); setMarketSearch(""); }
  function clearMyFilters() { setMyPage(0); setMyStatus("all"); setMyCategory(""); setMySearch(""); }
  const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  return <AppShell session={session} activePath="/requests">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{tr(isRu, "Ish maydoni", "РАБОЧАЯ ЗОНА")}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{tr(isRu, "So‘rovlar va takliflar", "Запросы и предложения")}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{tr(isRu, "So‘rov — kerakli xizmat talabi. Taklif — hamkor yuborgan narx va shartlar. Quyidagi bo‘limlardan keraklisini tanlang.", "Запрос — потребность в услуге. Предложение — цена и условия партнёра. Выберите нужный раздел ниже.")}</p></div>
      <Link href="/requests/new" className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700">+ {tr(isRu, "Yangi so‘rov", "Новый запрос")}</Link>
    </header>

    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-sm font-semibold text-blue-800">1. {tr(isRu, "So‘rovlar", "Запросы")}</p><p className="mt-1 text-xs leading-5 text-slate-600">{tr(isRu, "Kim nima izlayapti, qachon va qayerga kerak — bir qarashda ko‘ring.", "Сразу видно кто, что, когда и куда ищет.")}</p></div>
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4"><p className="text-sm font-semibold text-emerald-800">2. {tr(isRu, "Takliflar", "Предложения")}</p><p className="mt-1 text-xs leading-5 text-slate-600">{tr(isRu, "Kimdan kelgani, narxi va shartlari aniq ko‘rinadi.", "Видно от кого предложение, цена и условия.")}</p></div>
    </div>

    <nav aria-label={tr(isRu, "Ish maydoni bo‘limlari", "Разделы рабочей зоны")} className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{tabs.map((item) => <button key={item.id} type="button" onClick={() => changeTab(item.id)} className={`rounded-2xl border px-4 py-3 text-left transition ${tab === item.id ? "border-blue-500 bg-blue-600 text-white shadow-md" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50/40"}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">{item.label}</span>{item.id === "incoming-offers" && pendingIncomingCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tab === item.id ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"}`}>{pendingIncomingCount}</span>}</div><p className={`mt-1 text-[11px] ${tab === item.id ? "text-blue-100" : "text-slate-400"}`}>{item.hint}</p></button>)}</nav>

    {tab === "market" && <section className="mt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]"><select value={marketCategory} onChange={(event) => { setMarketCategory(event.target.value); setMarketPage(0); }} className={inputClass}><option value="">{tr(isRu, "Barcha xizmatlar", "Все категории")}</option>{categories.map((item) => <option key={item} value={item}>{isRu ? categoryRu[item] : item}</option>)}</select><input value={marketSearch} onChange={(event) => { setMarketSearch(event.target.value); setMarketPage(0); }} placeholder={tr(isRu, "Yo‘nalish yoki xizmatni qidiring", "Поиск по маршруту или услуге")} className={inputClass} />{(marketCategory || marketSearch) && <button type="button" onClick={clearMarketFilters} className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">{tr(isRu, "Tozalash", "Сбросить")}</button>}</div><label className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">{tr(isRu, "Ko‘rsatish", "Показывать")}<select value={marketFreshness} onChange={(event) => { setMarketFreshness(event.target.value as "current" | "expired"); setMarketPage(0); }} className={inputClass}><option value="current">{tr(isRu, "Amaldagi so‘rovlar", "Актуальные запросы")}</option><option value="expired">{tr(isRu, "Arxiv — muddati o‘tgan", "Архив — истёкшие")}</option></select></label></div>
      {marketError && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{marketError}</p>}
      <div className="mt-6">{isMarketLoading ? <LoadingCards /> : marketRequests.length ? <div className="space-y-4">{marketRequests.map((request) => <MarketRequestCard key={request.id} request={request} isRu={isRu} isOwner={session?.user.id === request.created_by} isFormOpen={openOfferRequestId === request.id} hasOffered={offeredRequestIds.has(request.id)} offerMessage={offerSuccessId === request.id ? tr(isRu, "Taklif yuborildi", "Предложение отправлено") : ""} onToggleForm={() => setOpenOfferRequestId((current) => current === request.id ? null : request.id)} onSubmitOffer={(payload) => submitMarketOffer(request.id, payload)} />)}</div> : <EmptyState title={tr(isRu, "Hozircha so‘rovlar yo‘q", "Пока нет запросов")} description={tr(isRu, "Filtrlarni o‘zgartirib ko‘ring yoki keyinroq qayting.", "Попробуйте изменить фильтры или вернитесь позже.")} />}</div>
      <Pagination page={marketPage} onChange={setMarketPage} hasNext={marketRequests.length === 20} disabled={isMarketLoading} isRu={isRu} />
    </section>}

    {tab === "my-requests" && <section className="mt-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="grid gap-3 md:grid-cols-[1fr_1fr_1.4fr_auto]"><select value={myStatus} onChange={(event) => { setMyStatus(event.target.value as RequestStatus | "all"); setMyPage(0); }} className={inputClass}>{(["all", "open", "accepted", "closed", "cancelled"] as const).map((value) => <option key={value} value={value}>{requestStatusLabel(value, isRu)}</option>)}</select><select value={myCategory} onChange={(event) => { setMyCategory(event.target.value); setMyPage(0); }} className={inputClass}><option value="">{tr(isRu, "Barcha xizmatlar", "Все категории")}</option>{categories.map((item) => <option key={item} value={item}>{isRu ? categoryRu[item] : item}</option>)}</select><input value={mySearch} onChange={(event) => { setMySearch(event.target.value); setMyPage(0); }} placeholder={tr(isRu, "So‘rovlarimni qidirish", "Поиск по моим запросам")} className={inputClass} />{(myStatus !== "all" || myCategory || mySearch) && <button type="button" onClick={clearMyFilters} className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">{tr(isRu, "Tozalash", "Сбросить")}</button>}</div></div>
      {myRequestsError && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{myRequestsError}</p>}
      <div className="mt-6">{isMyRequestsLoading || isIncomingLoading ? <LoadingCards /> : myRequests.length ? <div className="space-y-4">{myRequests.map((request) => <MyRequestCard key={request.id} request={request} offersCount={offerCountByRequest[request.id] || 0} isRu={isRu} isDeleting={deletingRequestId === request.id} onDelete={handleDeleteRequest} />)}</div> : <EmptyState title={tr(isRu, "Sizda hozircha so‘rov yo‘q", "У вас пока нет запросов")} description={tr(isRu, "Yangi so‘rov yarating — tizim mos hamkorlarni topadi.", "Создайте новый запрос — система найдёт подходящих партнёров.")} action={<Link href="/requests/new" className="mt-5 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">{tr(isRu, "Yangi so‘rov yaratish", "Создать запрос")}</Link>} />}</div>
      <Pagination page={myPage} onChange={setMyPage} hasNext={myRequests.length === 20} disabled={isMyRequestsLoading} isRu={isRu} />
    </section>}

    {tab === "my-offers" && <section className="mt-6">
      {editingOffer && <div className="mb-6 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-500">{tr(isRu, "Taklifni yangilash", "Обновить предложение")}</p><h2 className="mt-1 text-lg font-semibold text-[#0b1f3a]">{requestTitle(editingOffer.request || {})}</h2></div><button type="button" onClick={() => setEditingOffer(null)} className="text-sm font-semibold text-slate-500">{tr(isRu, "Bekor qilish", "Отмена")}</button></div><div className="mt-5"><OfferForm category={editingOffer.request?.category} serviceDetails={editingOffer.request?.service_details} initialValues={editingOffer} submitLabel={tr(isRu, "Saqlash", "Сохранить")} submittingLabel={tr(isRu, "Saqlanmoqda...", "Сохранение...")} onSubmit={submitEdit} /></div></div>}
      {myOffersError && <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{myOffersError}</p>}
      {isMyOffersLoading ? <LoadingCards /> : myOffers.length ? <div className="space-y-4">{myOffers.map((offer) => <MyOfferCard key={offer.id} offer={offer} onEdit={setEditingOffer} onWithdraw={handleWithdraw} isRu={isRu} />)}</div> : <EmptyState title={tr(isRu, "Siz hali taklif yubormagansiz", "Вы ещё не отправляли предложений")} description={tr(isRu, "Barcha so‘rovlar bo‘limidan mos so‘rovni ochib taklif bering.", "Откройте подходящий запрос в разделе всех запросов и отправьте предложение.")} />}
    </section>}

    {tab === "incoming-offers" && <section className="mt-6">
      {incomingError && <p role="alert" className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{incomingError}</p>}
      {isIncomingLoading ? <LoadingCards /> : incomingOffers.length ? <div className="space-y-4">{incomingOffers.map((offer) => <IncomingOfferCard key={offer.id} offer={offer} isRu={isRu} />)}</div> : <EmptyState title={tr(isRu, "Hozircha taklif kelmagan", "Пока нет входящих предложений")} description={tr(isRu, "So‘rovlaringizga hamkorlar taklif yuborganda, kimdan kelgani va shartlari shu yerda aniq ko‘rinadi.", "Когда партнёры ответят на ваши запросы, здесь будут видны отправитель и условия.")} />}
    </section>}
  </AppShell>;
}

function Pagination({ page, onChange, hasNext, disabled, isRu }: { page: number; onChange: (page: number) => void; hasNext: boolean; disabled: boolean; isRu: boolean }) {
  if (page === 0 && !hasNext) return null;
  return <nav aria-label={tr(isRu, "So‘rovlar sahifalari", "Страницы запросов")} className="mt-6 flex items-center justify-center gap-4 text-sm"><button disabled={disabled || page === 0} onClick={() => onChange(page - 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold disabled:opacity-40">← {tr(isRu, "Oldingi", "Назад")}</button><span className="text-slate-500">{isRu ? `Страница ${page + 1}` : `${page + 1}-sahifa`}</span><button disabled={disabled || !hasNext} onClick={() => onChange(page + 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 font-semibold disabled:opacity-40">{tr(isRu, "Keyingi", "Далее")} →</button></nav>;
}
