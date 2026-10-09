"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  getPublicSupplierInvite,
  optOutPublicSupplier,
  submitPublicSupplierResponse,
  type PublicSupplierInvite,
} from "@/app/supplier-request/public-api";

type Lang = "uz" | "ru";

const SUPPORT_PHONE = "+998 91 292 40 10";
const SUPPORT_PHONE_HREF = "tel:+998912924010";
const tr = (lang: Lang, uz: string, ru: string) => lang === "ru" ? ru : uz;

function formatDate(value: string | null, lang: Lang) {
  if (!value) return tr(lang, "Ko‘rsatilmagan", "Не указано");
  return new Intl.DateTimeFormat(lang === "ru" ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function detailLabel(key: string, lang: Lang) {
  const labels: Record<string, [string, string]> = {
    check_out: ["Chiqish sanasi", "Дата выезда"],
    rooms: ["Xonalar soni", "Количество номеров"],
    hotel_name: ["Mehmonxona", "Отель"],
    hotel_stars: ["Mehmonxona darajasi", "Категория отеля"],
    meal_plan: ["Ovqatlanish", "Питание"],
    room_type: ["Xona turi", "Тип номера"],
    room_distribution: ["Joylashuv", "Размещение"],
    guest_nationality: ["Fuqarolik", "Гражданство"],
    cancellation: ["Bekor qilish sharti", "Условия отмены"],
    language: ["Gid tili", "Язык гида"],
    duration_hours: ["Davomiyligi (soat)", "Продолжительность (часы)"],
    duration_days: ["Davomiyligi (kun)", "Продолжительность (дни)"],
    route_details: ["Yo‘nalish / izoh", "Маршрут / комментарий"],
    start_time: ["Boshlanish vaqti", "Время начала"],
    guide_type: ["Gid xizmati turi", "Тип услуги гида"],
    transfer_type: ["Transport xizmati", "Трансфер"],
    pickup_time: ["Olib ketish vaqti", "Время подачи"],
    vehicle: ["Transport turi", "Тип транспорта"],
    return_date: ["Qaytish sanasi", "Дата возврата"],
    return_time: ["Qaytish vaqti", "Время возврата"],
    luggage_count: ["Chamadonlar soni", "Количество багажа"],
  };
  const label = labels[key];
  return label ? (lang === "ru" ? label[1] : label[0]) : key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function detailValue(key: string, value: string, lang: Lang) {
  if (key === "hotel_stars" && /^[1-5]$/.test(value)) return lang === "ru" ? `${value} звёзд` : `${value} yulduz`;
  return value.replaceAll("_", " ");
}

export default function SupplierRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [lang, setLang] = useState<Lang>("uz");
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
      getPublicSupplierInvite(token)
        .then(setInvite)
        .catch((cause) => setError(cause instanceof Error ? cause.message : "So‘rov yuklanmadi / Не удалось загрузить запрос."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [token]);

  const details = useMemo(() => Object.entries(invite?.service_details || {}).filter(([, value]) => value != null && String(value).trim() !== ""), [invite]);
  const pax = invite ? Math.max(0, Number(invite.adults || 0) + Number(invite.children || 0) + Number(invite.infants || 0)) : 0;

  function chooseLanguage(next: Lang) {
    setLang(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!invite || working) return;
    const numericPrice = price.trim() ? Number(price) : null;
    if (available && (numericPrice == null || !Number.isFinite(numericPrice) || numericPrice < 0)) {
      setError(tr(lang, "Taklif narxini kiriting.", "Укажите стоимость предложения."));
      return;
    }
    setWorking(true);
    setError("");
    try {
      await submitPublicSupplierResponse(token, { available, price: numericPrice, currency, comment: comment.trim() || null });
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr(lang, "Javob yuborilmadi.", "Не удалось отправить ответ."));
    } finally {
      setWorking(false);
    }
  }

  async function optOut() {
    const confirmation = tr(
      lang,
      "My Agent Air orqali boshqa B2B so‘rovlarni olmaslikni tasdiqlaysizmi?",
      "Подтвердить отказ от новых B2B-запросов через My Agent Air?",
    );
    if (working || !window.confirm(confirmation)) return;
    setWorking(true);
    setError("");
    try {
      await optOutPublicSupplier(token);
      setOptedOut(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr(lang, "Sozlamani o‘zgartirib bo‘lmadi.", "Не удалось изменить настройку."));
    } finally {
      setWorking(false);
    }
  }

  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
    <div className="mx-auto max-w-4xl">
      <header className="overflow-hidden rounded-3xl bg-[#0b1f3a] text-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="text-sm font-bold tracking-wide">MY AGENT AIR</p>
            <p className="mt-0.5 text-xs text-blue-200">{tr(lang, "Turizm biznesi uchun B2B platforma", "B2B-платформа для туристического бизнеса")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={SUPPORT_PHONE_HREF} className="rounded-full border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10">☎ {SUPPORT_PHONE}</a>
            <div className="flex rounded-full border border-white/20 bg-white/5 p-1" aria-label={tr(lang, "Til", "Язык")}>
              <button type="button" onClick={() => chooseLanguage("uz")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lang === "uz" ? "bg-white text-[#0b1f3a]" : "text-white"}`}>UZ</button>
              <button type="button" onClick={() => chooseLanguage("ru")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${lang === "ru" ? "bg-white text-[#0b1f3a]" : "text-white"}`}>RU</button>
            </div>
          </div>
        </div>
        <div className="px-6 py-7 sm:px-8 sm:py-9">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">{tr(lang, "Yangi B2B so‘rov", "Новый B2B-запрос")}</p>
          <h1 className="mt-3 max-w-2xl text-2xl font-semibold leading-tight sm:text-4xl">{tr(lang, "Turistik so‘rovni ko‘ring va o‘z taklifingizni yuboring", "Посмотрите туристический запрос и отправьте своё предложение")}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{tr(
            lang,
            "My Agent Air O‘zbekistondagi turagentlar, turoperatorlar, mehmonxonalar, transport kompaniyalari, gidlar va boshqa turizm hamkorlarini bitta B2B platformada bog‘laydi.",
            "My Agent Air объединяет турагентов, туроператоров, отели, транспортные компании, гидов и других партнёров туристического рынка Узбекистана на одной B2B-платформе.",
          )}</p>
          <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/10 px-3 py-2">✓ {tr(lang, "Ushbu so‘rovga ro‘yxatdan o‘tmasdan javob berish mumkin", "На этот запрос можно ответить без регистрации")}</span>
            <span className="rounded-full bg-white/10 px-3 py-2">✓ {tr(lang, "Platformada ro‘yxatdan o‘tish bepul", "Регистрация на платформе бесплатная")}</span>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-blue-600">01</p><h2 className="mt-2 font-semibold text-[#0b1f3a]">{tr(lang, "So‘rovni ko‘ring", "Посмотрите запрос")}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{tr(lang, "Sana, hudud, mehmonlar soni va xizmat talablarini tekshiring.", "Проверьте дату, регион, количество гостей и требования к услуге.")}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold text-blue-600">02</p><h2 className="mt-2 font-semibold text-[#0b1f3a]">{tr(lang, "Taklif bering", "Отправьте предложение")}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{tr(lang, "Mavjudlik, narx va shartlaringizni to‘g‘ridan-to‘g‘ri agentga yuboring.", "Отправьте агенту наличие, цену и условия напрямую.")}</p></div>
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm"><p className="text-xs font-bold text-cyan-700">03</p><h2 className="mt-2 font-semibold text-[#0b1f3a]">{tr(lang, "Yangi mijozlarni oling", "Получайте новые заявки")}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{tr(lang, "Bepul ro‘yxatdan o‘ting va keyingi mos B2B so‘rovlarni platformada qabul qiling.", "Зарегистрируйтесь бесплатно и получайте следующие подходящие B2B-запросы на платформе.")}</p><Link href="/register" className="mt-4 inline-flex rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-800">{tr(lang, "Bepul ro‘yxatdan o‘tish", "Бесплатная регистрация")}</Link></div>
      </section>

      {loading && <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">{tr(lang, "So‘rov yuklanmoqda...", "Запрос загружается...")}</div>}
      {error && <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}

      {invite && !optedOut && <>
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div><p className="text-sm text-slate-500">{tr(lang, "So‘rov yuboruvchi", "Отправитель запроса")}</p><p className="mt-1 font-semibold text-[#0b1f3a]">{invite.requester_company || tr(lang, "My Agent Air hamkori", "Партнёр My Agent Air")}</p></div>
            <div className="text-left sm:text-right"><p className="text-sm text-slate-500">{tr(lang, "Taklif qabul qiluvchi", "Получатель запроса")}</p><p className="mt-1 font-semibold text-[#0b1f3a]">{invite.supplier_name}</p></div>
          </div>
          <div className="mt-7 grid gap-4 border-t border-slate-100 pt-6 sm:grid-cols-2">
            <div><p className="text-xs uppercase tracking-wide text-slate-400">{tr(lang, "Xizmat", "Услуга")}</p><p className="mt-1 font-semibold">{invite.request_category}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">{tr(lang, "Hudud", "Регион")}</p><p className="mt-1 font-semibold">{invite.destination || tr(lang, "Ko‘rsatilmagan", "Не указано")}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">{tr(lang, "Sana", "Дата")}</p><p className="mt-1 font-semibold">{formatDate(invite.travel_date, lang)}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">{tr(lang, "Mehmonlar", "Гости")}</p><p className="mt-1 font-semibold">{pax || tr(lang, "Ko‘rsatilmagan", "Не указано")}</p></div>
            {invite.budget != null && <div><p className="text-xs uppercase tracking-wide text-slate-400">{tr(lang, "Byudjet", "Бюджет")}</p><p className="mt-1 font-semibold">{Number(invite.budget).toLocaleString(lang === "ru" ? "ru-RU" : "uz-UZ")} {invite.currency}</p></div>}
          </div>
          {details.length > 0 && <div className="mt-6 rounded-2xl bg-slate-50 p-5"><h2 className="font-semibold text-[#0b1f3a]">{tr(lang, "Xizmat talablari", "Требования к услуге")}</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2">{details.map(([key, value]) => <div key={key}><dt className="text-xs text-slate-400">{detailLabel(key, lang)}</dt><dd className="mt-1 text-sm font-medium text-slate-700">{detailValue(key, String(value), lang)}</dd></div>)}</dl></div>}
          {invite.description && <div className="mt-6"><p className="text-xs uppercase tracking-wide text-slate-400">{tr(lang, "Qo‘shimcha izoh", "Дополнительный комментарий")}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{invite.description}</p></div>}
          <p className="mt-6 text-xs text-slate-400">{tr(lang, `Havola ${formatDate(invite.expires_at, lang)} gacha amal qiladi.`, `Ссылка действует до ${formatDate(invite.expires_at, lang)}.`)}</p>
        </section>

        {submitted || invite.status === "responded" ? <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <p className="text-lg font-semibold text-emerald-900">{tr(lang, "Javob qabul qilindi", "Ответ принят")}</p>
          <p className="mt-2 text-sm leading-6 text-emerald-800">{tr(lang, "Taklifingiz so‘rov yuborgan agentga yetkazildi.", "Ваше предложение передано агенту, отправившему запрос.")}</p>
          <div className="mx-auto mt-6 max-w-xl rounded-2xl border border-emerald-200 bg-white p-5">
            <p className="font-semibold text-[#0b1f3a]">{tr(lang, "Keyingi so‘rovlarni o‘tkazib yubormang", "Не пропускайте следующие запросы")}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{tr(lang, "My Agent Air’da bepul ro‘yxatdan o‘ting va sizning xizmatlaringizga mos yangi B2B so‘rovlarni platformada qabul qiling.", "Зарегистрируйтесь бесплатно в My Agent Air и получайте новые B2B-запросы, подходящие вашим услугам.")}</p>
            <Link href="/register" className="mt-4 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700">{tr(lang, "Platformaga qo‘shilish", "Присоединиться к платформе")}</Link>
          </div>
        </section> : <form onSubmit={submit} className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-semibold text-[#0b1f3a]">{tr(lang, "Taklif yuborish", "Отправить предложение")}</h2>
          <p className="mt-2 text-sm text-slate-500">{tr(lang, "Ro‘yxatdan o‘tish shart emas — ushbu so‘rovga hozir javob berishingiz mumkin.", "Регистрация не обязательна — вы можете ответить на этот запрос прямо сейчас.")}</p>
          <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setAvailable(true)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${available ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-600"}`}>{tr(lang, "Mavjud", "Есть в наличии")}</button><button type="button" onClick={() => setAvailable(false)} className={`rounded-xl px-4 py-3 text-sm font-semibold ${!available ? "bg-slate-700 text-white" : "border border-slate-200 text-slate-600"}`}>{tr(lang, "Mavjud emas", "Нет в наличии")}</button></div>
          {available && <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_150px]"><label className="text-sm font-semibold text-[#0b1f3a]">{tr(lang, "Narx", "Цена")}<input inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ""))} placeholder={tr(lang, "Masalan: 450000", "Например: 450000")} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-[#0b1f3a]">{tr(lang, "Valyuta", "Валюта")}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 font-normal"><option>UZS</option><option>USD</option><option>EUR</option><option>RUB</option></select></label></div>}
          <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]">{tr(lang, "Izoh", "Комментарий")}<textarea maxLength={1000} rows={5} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={available ? tr(lang, "Narx nimani o‘z ichiga olishi, mavjudlik yoki shartlarni yozing.", "Укажите, что входит в цену, наличие и условия.") : tr(lang, "Mavjud emasligi sababini yozishingiz mumkin.", "Можно указать причину отсутствия.")} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label>
          <button type="submit" disabled={working} className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{working ? tr(lang, "Yuborilmoqda...", "Отправляется...") : tr(lang, "Taklifni yuborish", "Отправить предложение")}</button>
        </form>}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-[#0b1f3a]">{tr(lang, "Savol bo‘lsa, bog‘laning", "Если есть вопросы, свяжитесь с нами")}</p><p className="mt-1 text-sm text-slate-500">{tr(lang, "My Agent Air bo‘yicha yordam va ro‘yxatdan o‘tish masalalari.", "Помощь по My Agent Air и вопросам регистрации.")}</p></div>
            <a href={SUPPORT_PHONE_HREF} className="inline-flex shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">☎ {SUPPORT_PHONE}</a>
          </div>
          <div className="mt-5 border-t border-slate-100 pt-4 text-center"><p className="text-xs leading-5 text-slate-500">{tr(lang, "Agar My Agent Air orqali boshqa shunday B2B so‘rovlarni olishni xohlamasangiz, yuborishni to‘xtatishingiz mumkin.", "Если вы не хотите получать другие B2B-запросы через My Agent Air, рассылку можно отключить.")}</p><button type="button" disabled={working} onClick={() => void optOut()} className="mt-3 text-xs font-semibold text-slate-500 underline hover:text-red-600">{tr(lang, "Boshqa so‘rovlarni olmaslik", "Не получать новые запросы")}</button></div>
        </section>
      </>}

      {optedOut && <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-8 text-center"><p className="font-semibold text-[#0b1f3a]">{tr(lang, "So‘rovlar to‘xtatildi", "Запросы отключены")}</p><p className="mt-2 text-sm text-slate-500">{tr(lang, "Ushbu supplier kontaktiga My Agent Air orqali yangi tashqi takliflar yuborilmaydi.", "На этот контакт больше не будут отправляться новые внешние запросы через My Agent Air.")}</p></section>}

      <footer className="py-8 text-center text-xs leading-6 text-slate-400">
        <p>My Agent Air · {tr(lang, "O‘zbekiston turizm biznesi uchun B2B platforma", "B2B-платформа для туристического бизнеса Узбекистана")}</p>
        <p><a href={SUPPORT_PHONE_HREF} className="font-semibold text-slate-500">{SUPPORT_PHONE}</a> · <Link href="/register" className="font-semibold text-blue-600">{tr(lang, "Ro‘yxatdan o‘tish", "Регистрация")}</Link></p>
      </footer>
    </div>
  </main>;
}
