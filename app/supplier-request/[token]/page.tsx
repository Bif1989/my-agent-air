"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  getPublicSupplierInvite,
  optOutPublicSupplier,
  submitPublicSupplierResponse,
  type PublicSupplierInvite,
} from "@/app/supplier-request/public-api";

function formatDate(value: string | null) {
  if (!value) return "Ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function detailLabel(key: string) {
  const labels: Record<string, string> = {
    check_out: "Chiqish sanasi",
    rooms: "Xonalar soni",
    hotel_name: "Mehmonxona",
    hotel_stars: "Mehmonxona darajasi",
    meal_plan: "Ovqatlanish",
    room_type: "Xona turi",
    room_distribution: "Joylashuv",
    guest_nationality: "Fuqarolik",
    cancellation: "Bekor qilish sharti",
    language: "Gid tili",
    duration_hours: "Davomiyligi (soat)",
    duration_days: "Davomiyligi (kun)",
    route_details: "Yo‘nalish / izoh",
    start_time: "Boshlanish vaqti",
    guide_type: "Gid xizmati turi",
    transfer_type: "Transport xizmati",
    pickup_time: "Olib ketish vaqti",
    vehicle: "Transport turi",
    return_date: "Qaytish sanasi",
    return_time: "Qaytish vaqti",
    luggage_count: "Chamadonlar soni",
  };
  return labels[key] || key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function detailValue(key: string, value: string) {
  if (key === "hotel_stars" && /^[1-5]$/.test(value)) return `${value} yulduz`;
  return value.replaceAll("_", " ");
}

export default function SupplierRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [invite, setInvite] = useState<PublicSupplierInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState(true);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("UZS");
  const [comment, setComment] = useState("");
  const [working, setWorking] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => {
    if (!token) return;
    const timeout = window.setTimeout(() => {
      getPublicSupplierInvite(token).then(setInvite).catch((cause) => setError(cause instanceof Error ? cause.message : "So‘rov yuklanmadi.")).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [token]);

  const details = useMemo(() => Object.entries(invite?.service_details || {}).filter(([, value]) => value != null && String(value).trim() !== ""), [invite]);
  const pax = invite ? Math.max(0, Number(invite.adults || 0) + Number(invite.children || 0) + Number(invite.infants || 0)) : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!invite || working) return;
    const numericPrice = price.trim() ? Number(price) : null;
    if (available && (numericPrice == null || !Number.isFinite(numericPrice) || numericPrice < 0)) {
      setError("Taklif narxini kiriting.");
      return;
    }
    setWorking(true); setError("");
    try {
      await submitPublicSupplierResponse(token, { available, price: numericPrice, currency, comment: comment.trim() || null });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Javob yuborilmadi.");
    } finally { setWorking(false); }
  }

  async function optOut() {
    if (working || !window.confirm("Agent Bifavia orqali boshqa B2B so‘rovlarni olmaslikni tasdiqlaysizmi?")) return;
    setWorking(true); setError("");
    try {
      await optOutPublicSupplier(token);
      setOptedOut(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sozlamani o‘zgartirib bo‘lmadi.");
    } finally { setWorking(false); }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <header className="rounded-3xl bg-[#0b1f3a] px-6 py-7 text-white shadow-sm sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Agent Bifavia · B2B so‘rov</p>
        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Hamkorlik taklifini yuboring</h1>
        <p className="mt-2 text-sm leading-6 text-slate-300">Ro‘yxatdan o‘tmasdan turib ushbu aniq so‘rovga narx va mavjudlik bo‘yicha javob berishingiz mumkin.</p>
      </header>

      {loading && <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">So‘rov yuklanmoqda...</div>}
      {error && <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}

      {invite && !optedOut && <>
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-sm text-slate-500">So‘rov yuboruvchi</p><p className="mt-1 font-semibold text-[#0b1f3a]">{invite.requester_company || "Agent Bifavia hamkori"}</p></div><div className="text-left sm:text-right"><p className="text-sm text-slate-500">Taklif qabul qiluvchi</p><p className="mt-1 font-semibold text-[#0b1f3a]">{invite.supplier_name}</p></div></div>
          <div className="mt-7 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Xizmat</p><p className="mt-1 font-semibold">{invite.request_category}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Hudud</p><p className="mt-1 font-semibold">{invite.destination || "Ko‘rsatilmagan"}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Sana</p><p className="mt-1 font-semibold">{formatDate(invite.travel_date)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Mehmonlar</p><p className="mt-1 font-semibold">{pax || "Ko‘rsatilmagan"}</p></div>
            {invite.budget != null && <div><p className="text-xs uppercase tracking-wide text-slate-400">Byudjet</p><p className="mt-1 font-semibold">{Number(invite.budget).toLocaleString("uz-UZ")} {invite.currency}</p></div>}
          </div>
          {details.length > 0 && <div className="mt-6 rounded-2xl bg-slate-50 p-5"><h2 className="font-semibold text-[#0b1f3a]">Xizmat talablari</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{details.map(([key, value]) => <div key={key}><dt className="text-xs text-slate-400">{detailLabel(key)}</dt><dd className="mt-1 text-sm font-medium text-slate-700">{detailValue(key, String(value))}</dd></div>)}</dl></div>}
          {invite.description && <div className="mt-6"><p className="text-xs uppercase tracking-wide text-slate-400">Qo‘shimcha izoh</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{invite.description}</p></div>}
          <p className="mt-6 text-xs text-slate-400">Havola {formatDate(invite.expires_at)} gacha amal qiladi.</p>
        </section>

        {submitted || invite.status === "responded" ? <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center"><p className="text-lg font-semibold text-emerald-900">Javob qabul qilindi</p><p className="mt-2 text-sm text-emerald-800">Taklifingiz so‘rov yuborgan agentga yetkazildi. Agent Bifavia’dan foydalanganingiz uchun rahmat.</p></section> : <form onSubmit={submit} className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-[#0b1f3a]">Taklif yuborish</h2>
          <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setAvailable(true)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${available ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600"}`}>Mavjud</button><button type="button" onClick={() => setAvailable(false)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${!available ? "bg-slate-700 text-white" : "border border-slate-200 text-slate-600"}`}>Mavjud emas</button></div>
          {available && <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_150px]"><label className="text-sm font-semibold text-[#0b1f3a]">Narx<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="Masalan: 450000" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-[#0b1f3a]">Valyuta<select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option>UZS</option><option>USD</option><option>EUR</option><option>RUB</option></select></label></div>}
          <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]">Izoh<textarea maxLength={1000} rows={5} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={available ? "Narx nimani o‘z ichiga olishi, mavjudlik yoki shartlarni yozing." : "Mavjud emasligi sababini yozishingiz mumkin."} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
          <button type="submit" disabled={working} className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{working ? "Yuborilmoqda..." : "Javobni yuborish"}</button>
        </form>}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-center"><p className="text-xs leading-5 text-slate-500">Bu B2B so‘rov. Agar Agent Bifavia orqali boshqa shunday so‘rovlarni olishni xohlamasangiz, quyidagi tugma orqali to‘xtatishingiz mumkin.</p><button type="button" disabled={working} onClick={() => void optOut()} className="mt-3 text-xs font-semibold text-slate-500 underline hover:text-red-600">Boshqa so‘rovlarni olmaslik</button></section>
      </>}

      {optedOut && <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center"><p className="font-semibold text-[#0b1f3a]">So‘rovlar to‘xtatildi</p><p className="mt-2 text-sm text-slate-500">Ushbu supplier kontaktiga Agent Bifavia orqali yangi tashqi takliflar yuborilmaydi.</p></section>}

      <footer className="py-8 text-center text-xs text-slate-400">Agent Bifavia · O‘zbekiston turizm biznesi uchun B2B platforma</footer>
    </div>
  </main>;
}
