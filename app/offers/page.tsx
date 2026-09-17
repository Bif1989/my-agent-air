"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import OfferForm from "@/app/offers/offer-form";
import { createOffer, getMyOfferForRequest, listIncomingOffers, listMyOffers, updateOffer, withdrawOffer, type OfferPayload, type OfferRecord } from "@/app/offers/offers-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getRequest, type RequestRecord } from "@/app/requests/requests-api";

const statusLabels = { pending: "Kutilmoqda", accepted: "Qabul qilingan", rejected: "Rad etilgan", withdrawn: "Qaytarib olingan" } as const;

type Tab = "mine" | "incoming";

function formatDate(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function OfferCard({ offer, onEdit, onWithdraw }: { offer: OfferRecord; onEdit: (offer: OfferRecord) => void; onWithdraw: (offer: OfferRecord) => void }) {
  const statusClass = offer.status === "pending" ? "bg-amber-50 text-amber-700" : offer.status === "accepted" ? "bg-emerald-50 text-emerald-700" : offer.status === "rejected" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600";
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><Link href={`/requests/${offer.request_id}`} className="text-lg font-semibold text-[#0b1f3a] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">{offer.request?.origin || "—"} <span className="px-1 text-blue-500">→</span> {offer.request?.destination || "—"}</Link><p className="mt-2 text-sm text-slate-500">{offer.request?.category || "Kategoriya ko‘rsatilmagan"} · {formatDate(offer.request?.travel_date || null)}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusLabels[offer.status]}</span></div><div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2"><p className="text-xl font-semibold text-[#0b1f3a]">{offer.price == null ? "Narx ko‘rsatilmagan" : `${offer.price.toLocaleString("uz-UZ")} ${offer.currency}`}</p><p className="text-sm text-slate-500">Aviakompaniya: {offer.airline || "Ko‘rsatilmagan"}</p><p className="text-sm text-slate-500">Bagaj: {offer.baggage || "Ko‘rsatilmagan"}</p>{offer.comment && <p className="text-sm text-slate-500 sm:col-span-2">{offer.comment}</p>}</div><div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-xs text-slate-400"><span>{offer.agent?.full_name || "Agent nomi ko‘rsatilmagan"}</span><span>{offer.agent?.company_name || "Kompaniya ko‘rsatilmagan"}</span><span>{offer.agent?.city || "Shahar ko‘rsatilmagan"}</span>{offer.agent?.is_verified && <span className="font-semibold text-blue-600">Tasdiqlangan agent</span>}<span className="sm:ml-auto">{formatDate(offer.created_at)}</span></div>{offer.status === "pending" && <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => onEdit(offer)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Tahrirlash</button><button type="button" onClick={() => onWithdraw(offer)} className="rounded-xl border border-amber-200 px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500">Taklifni qaytarib olish</button></div>}</article>;
}

export default function OffersPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [tab, setTab] = useState<Tab>("mine");
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [targetRequest, setTargetRequest] = useState<RequestRecord | null>(null);
  const [targetOffer, setTargetOffer] = useState<OfferRecord | null>(null);
  const [requestId, setRequestId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTargetLoading, setIsTargetLoading] = useState(false);
  const [error, setError] = useState("");
  const [targetMessage, setTargetMessage] = useState("");
  const [editingOffer, setEditingOffer] = useState<OfferRecord | null>(null);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      setRequestId(new URLSearchParams(window.location.search).get("request_id") || "");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) return;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true); setError("");
      (tab === "mine" ? listMyOffers() : listIncomingOffers())
        .then(setOffers)
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("Takliflarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [tab]);

  useEffect(() => {
    if (!requestId) return;
    const storedSession = getStoredSession();
    if (!storedSession) return;
    const timeoutId = window.setTimeout(() => {
      setIsTargetLoading(true); setTargetMessage("");
      Promise.all([getRequest(requestId), getMyOfferForRequest(requestId)])
        .then(([request, offer]) => {
          setTargetRequest(request);
          setTargetOffer(offer);
          if (!request) setTargetMessage("So‘rov topilmadi yoki unga kirish imkoni yo‘q.");
          else if (request.created_by === storedSession.user.id) setTargetMessage("O‘z so‘rovingizga taklif yubora olmaysiz.");
          else if (request.status !== "open") setTargetMessage("Bu so‘rov hozir takliflar uchun ochiq emas.");
          else if (offer) setTargetMessage("Bu so‘rov uchun avval taklif yuborgansiz.");
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setTargetMessage("So‘rov ma’lumotlarini yuklashda xatolik yuz berdi.");
        })
        .finally(() => setIsTargetLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [requestId]);

  async function submitNewOffer(payload: OfferPayload) {
    if (!targetRequest) throw new Error("So‘rov topilmadi.");
    try {
      await createOffer(targetRequest.id, payload);
      setTargetMessage("Taklif muvaffaqiyatli yuborildi.");
      setTargetOffer(await getMyOfferForRequest(targetRequest.id));
      setOffers(await listMyOffers());
    } catch (submitError) {
      if (submitError instanceof Error && submitError.message === "SUPABASE_409") throw new Error("Bu so‘rov uchun avval taklif yuborgansiz.");
      throw new Error("Taklifni yuborib bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.");
    }
  }

  async function submitEdit(payload: OfferPayload) {
    if (!editingOffer) return;
    const updated = await updateOffer(editingOffer.id, payload);
    if (!updated) throw new Error("Faqat kutilayotgan taklifni tahrirlash mumkin.");
    setOffers((current) => current.map((offer) => offer.id === updated.id ? { ...offer, ...updated } : offer));
    setEditingOffer(null);
  }

  async function handleWithdraw(offer: OfferRecord) {
    if (!window.confirm("Taklifni qaytarib olishga ishonchingiz komilmi?")) return;
    try {
      const updated = await withdrawOffer(offer.id);
      if (updated) setOffers((current) => current.map((item) => item.id === offer.id ? { ...item, ...updated } : item));
    } catch { setError("Taklifni qaytarib olib bo‘lmadi."); }
  }

  const canCreate = Boolean(targetRequest && session && targetRequest.created_by !== session.user.id && targetRequest.status === "open" && !targetOffer);
  return <AppShell session={session} activePath="/offers"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Hamkorlik maydoni</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Takliflar</h1><p className="mt-2 text-sm text-slate-500">Yuborgan va sizning so‘rovlaringizga kelgan takliflarni boshqaring.</p></div></header>{requestId && <section className="mt-8 rounded-3xl border border-blue-100 bg-blue-50/60 p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-blue-700">Taklif yuborish</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{targetRequest ? `${targetRequest.origin || "—"} → ${targetRequest.destination || "—"}` : "So‘rov yuklanmoqda..."}</h2><p className="mt-1 text-sm text-slate-500">{targetRequest?.category || ""}</p></div><Link href={targetRequest ? `/requests/${targetRequest.id}` : "/requests"} className="text-sm font-semibold text-blue-700 hover:text-blue-800">So‘rovga qaytish</Link></div>{isTargetLoading ? <div className="mt-6 h-40 animate-pulse rounded-2xl bg-white/70" /> : targetMessage ? <p role="status" className="mt-5 rounded-xl border border-blue-100 bg-white px-4 py-3 text-sm text-blue-800">{targetMessage}</p> : canCreate && <div className="mt-6 rounded-2xl bg-white p-5 sm:p-6"><OfferForm submitLabel="Taklif yuborish" submittingLabel="Yuborilmoqda..." onSubmit={submitNewOffer} /></div>}</section>}{editingOffer && <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold text-[#0b1f3a]">Taklifni tahrirlash</h2><button type="button" onClick={() => setEditingOffer(null)} className="text-sm font-semibold text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Bekor qilish</button></div><div className="mt-5"><OfferForm key={editingOffer.id} initialValues={editingOffer} submitLabel="O‘zgarishlarni saqlash" submittingLabel="Saqlanmoqda..." onSubmit={submitEdit} /></div></section>}<div className="mt-8 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setTab("mine")} className={`rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${tab === "mine" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Mening takliflarim</button><button type="button" onClick={() => setTab("incoming")} className={`rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${tab === "incoming" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Menga kelgan takliflar</button></div></div>{error && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}{isLoading ? <div className="mt-6 space-y-4"><div className="h-56 animate-pulse rounded-2xl bg-slate-200" /><div className="h-56 animate-pulse rounded-2xl bg-slate-200" /></div> : offers.length ? <div className="mt-6 space-y-4">{offers.map((offer) => <OfferCard key={offer.id} offer={offer} onEdit={setEditingOffer} onWithdraw={handleWithdraw} />)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><p className="text-lg font-semibold text-[#0b1f3a]">{tab === "mine" ? "Hozircha yuborilgan takliflar yo‘q" : "Hozircha kelgan takliflar yo‘q"}</p><p className="mt-2 text-sm text-slate-500">Yangi imkoniyatlar paydo bo‘lganda ular shu yerda ko‘rinadi.</p></div>}</AppShell>;
}
