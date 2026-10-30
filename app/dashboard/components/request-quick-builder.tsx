"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REQUEST_CATEGORIES, type AssistantDraft } from "@/lib/request-assistant";
import { stageRequestDraft } from "@/lib/request-draft-storage";
import type { AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

const categoryRu: Record<string, string> = {
  Aviachipta: "Авиабилет",
  "Tur paket": "Турпакет",
  Mehmonxona: "Отель",
  Transfer: "Трансфер",
  Gid: "Гид",
  Viza: "Виза",
  Boshqa: "Другое",
};

const currencies = ["USD", "UZS", "EUR", "RUB"] as const;

export default function RequestQuickBuilder({ session }: { session: AuthSession }) {
  const router = useRouter();
  const { isRu } = useUiSettings();
  const [category, setCategory] = useState("Tur paket");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [travelDate, setTravelDate] = useState("");
  const [adults, setAdults] = useState("1");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState<(typeof currencies)[number]>("USD");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");

  function openPreparedRequest() {
    setError("");
    const people = Math.min(500, Math.max(1, Number.parseInt(adults, 10) || 1));
    const parsedBudget = budget.trim() ? Number(budget.replace(",", ".")) : undefined;
    const draft: AssistantDraft = {
      category,
      adults: people,
      children: 0,
      infants: 0,
      currency,
      ...(origin.trim() ? { origin: origin.trim() } : {}),
      ...(destination.trim() ? { destination: destination.trim() } : {}),
      ...(travelDate ? { travel_date: travelDate } : {}),
      ...(Number.isFinite(parsedBudget) && parsedBudget !== undefined && parsedBudget >= 0 ? { budget: parsedBudget } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
    };

    try {
      const href = stageRequestDraft(draft, session.user.id, window.sessionStorage);
      router.push(href);
    } catch {
      setError(isRu ? "Не удалось подготовить запрос. Разрешите хранение данных сайта и попробуйте снова." : "So‘rovni tayyorlab bo‘lmadi. Brauzerda sayt ma’lumotlarini saqlashga ruxsat bering va qayta urining.");
    }
  }

  function scrollToAi() {
    document.getElementById("ai-chat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="mb-3 rounded-[22px] border border-blue-200 bg-white p-3 shadow-[0_12px_35px_rgba(37,99,235,0.10)] dark:border-blue-900 dark:bg-slate-950 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-600">{isRu ? "БЫСТРЫЙ ЗАПРОС" : "So‘rov qilish"}</p>
          <h2 className="mt-0.5 text-base font-semibold text-[#0b1f3a] dark:text-slate-100">{isRu ? "Соберите запрос в одной строке" : "Asosiy ma’lumotlarni bir joyda kiriting"}</h2>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{isRu ? "Выберите услугу, заполните маршрут и откройте уже подготовленную форму." : "Xizmatni tanlang, yo‘nalishni to‘ldiring va tayyorlangan formani oching."}</p>
        </div>
        <button type="button" onClick={scrollToAi} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          {isRu ? "Сложный запрос → AI" : "Murakkab so‘rov → AI"}
        </button>
      </div>

      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {REQUEST_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-[11px] font-semibold transition ${category === item ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
          >
            {isRu ? categoryRu[item] || item : item}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_0.82fr_0.65fr_1fr]">
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Откуда" : "Qayerdan"}</span>
          <input value={origin} onChange={(event) => setOrigin(event.target.value)} maxLength={120} placeholder={isRu ? "Ташкент" : "Toshkent"} className="mt-1 w-full bg-transparent text-sm text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100" />
        </label>
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Куда" : "Qayerga"}</span>
          <input value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={120} placeholder={isRu ? "Самарканд" : "Samarqand"} className="mt-1 w-full bg-transparent text-sm text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100" />
        </label>
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Дата" : "Sana"}</span>
          <input type="date" value={travelDate} onChange={(event) => setTravelDate(event.target.value)} className="mt-1 w-full bg-transparent text-sm text-[#0b1f3a] outline-none dark:text-slate-100" />
        </label>
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Людей" : "Odam"}</span>
          <input type="number" min={1} max={500} value={adults} onChange={(event) => setAdults(event.target.value)} className="mt-1 w-full bg-transparent text-sm text-[#0b1f3a] outline-none dark:text-slate-100" />
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Бюджет" : "Budjet"}</span>
          <div className="mt-1 flex items-center gap-2">
            <input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0" className="min-w-0 flex-1 bg-transparent text-sm text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100" />
            <select value={currency} onChange={(event) => setCurrency(event.target.value as (typeof currencies)[number])} className="bg-transparent text-xs font-semibold text-slate-500 outline-none dark:text-slate-300">
              {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto]">
        <label className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Дополнительные требования" : "Qo‘shimcha talablar"}</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder={isRu ? "Отель 4★, завтрак, минивэн..." : "4★ hotel, nonushta, miniven..."} className="mt-1 w-full bg-transparent text-sm text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100" />
        </label>
        <button type="button" onClick={openPreparedRequest} className="min-h-14 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 md:min-w-[180px]">
          {isRu ? "Подготовить запрос →" : "So‘rovni tayyorlash →"}
        </button>
      </div>

      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-[10px] text-slate-400">{isRu ? "При смене услуги введённые маршрут, дата и бюджет сохраняются. Для нескольких услуг или сложного маршрута используйте AI ниже." : "Xizmat turini almashtirsangiz ham kiritilgan yo‘nalish, sana va budjet saqlanadi. Bir nechta xizmat yoki murakkab marshrut uchun pastdagi AI chatdan foydalaning."}</p>
    </section>
  );
}
