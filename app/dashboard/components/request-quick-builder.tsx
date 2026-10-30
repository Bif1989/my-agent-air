"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AIRPORTS, type AirportReference } from "@/data/airports";
import { normalizeAirportSearch } from "@/lib/aviation-assist";
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

function locationMatches(airport: AirportReference, query: string) {
  const values = [airport.code, airport.city, airport.country, ...(airport.aliases || [])].map(normalizeAirportSearch);
  return values.some((value) => value.startsWith(query) || value.includes(query));
}

function locationLabel(airport: AirportReference, query: string) {
  const matchingAlias = (airport.aliases || []).find((alias) => normalizeAirportSearch(alias).startsWith(query));
  if (matchingAlias && normalizeAirportSearch(matchingAlias) !== normalizeAirportSearch(airport.city)) return `${airport.city} / ${matchingAlias}`;
  return airport.city;
}

function LocationField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  const [focused, setFocused] = useState(false);
  const query = normalizeAirportSearch(value.trim());
  const seen = new Set<string>();
  const options = query.length >= 3
    ? AIRPORTS.filter((airport) => locationMatches(airport, query)).filter((airport) => {
        const key = `${airport.city}|${airport.country}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8)
    : [];

  return (
    <label className="relative rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
      <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <input
        value={value}
        onChange={(event) => { onChange(event.target.value); setFocused(true); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={focused && options.length > 0}
        placeholder={placeholder}
        className="mt-0.5 w-full bg-transparent text-[13px] text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100"
      />
      {focused && options.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-950">
          {options.map((airport) => (
            <button
              key={`${airport.city}-${airport.country}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(airport.city); setFocused(false); }}
              className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-blue-50 dark:border-slate-800 dark:hover:bg-slate-900"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold text-[#0b1f3a] dark:text-slate-100">{locationLabel(airport, query)}</span>
                <span className="block truncate text-[10px] text-slate-400">{airport.country}</span>
              </span>
              <span className="shrink-0 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-200">{airport.code}</span>
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

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
    <section className="mb-2 rounded-[18px] border border-blue-200 bg-white p-2.5 shadow-[0_10px_28px_rgba(37,99,235,0.09)] dark:border-blue-900 dark:bg-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-600">{isRu ? "БЫСТРЫЙ ЗАПРОС" : "So‘rov qilish"}</p>
            <h2 className="text-sm font-semibold text-[#0b1f3a] dark:text-slate-100">{isRu ? "Основные данные" : "Asosiy ma’lumotlar"}</h2>
          </div>
          <p className="mt-0.5 hidden text-[10px] text-slate-500 dark:text-slate-400 xl:block">{isRu ? "Введите маршрут и параметры; для сложного запроса используйте AI." : "Yo‘nalish va parametrlarni kiriting; murakkab so‘rov uchun AI’dan foydalaning."}</p>
        </div>
        <button type="button" onClick={scrollToAi} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[10px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          {isRu ? "Сложный запрос → AI" : "Murakkab so‘rov → AI"}
        </button>
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5">
        {REQUEST_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition ${category === item ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
          >
            {isRu ? categoryRu[item] || item : item}
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-1.5 md:grid-cols-[1fr_1fr_0.82fr_0.62fr_0.92fr]">
        <LocationField label={isRu ? "Откуда" : "Qayerdan"} value={origin} onChange={setOrigin} placeholder={isRu ? "Ташкент / TAS" : "Toshkent / TAS"} />
        <LocationField label={isRu ? "Куда" : "Qayerga"} value={destination} onChange={setDestination} placeholder={isRu ? "Самарканд / SKD" : "Samarqand / SKD"} />
        <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Дата" : "Sana"}</span>
          <input type="date" value={travelDate} onChange={(event) => setTravelDate(event.target.value)} className="mt-0.5 w-full bg-transparent text-[13px] text-[#0b1f3a] outline-none dark:text-slate-100" />
        </label>
        <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Людей" : "Odam"}</span>
          <input type="number" min={1} max={500} value={adults} onChange={(event) => setAdults(event.target.value)} className="mt-0.5 w-full bg-transparent text-[13px] text-[#0b1f3a] outline-none dark:text-slate-100" />
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Бюджет" : "Budjet"}</span>
          <div className="mt-0.5 flex items-center gap-2">
            <input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0" className="min-w-0 flex-1 bg-transparent text-[13px] text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100" />
            <select value={currency} onChange={(event) => setCurrency(event.target.value as (typeof currencies)[number])} className="bg-transparent text-[11px] font-semibold text-slate-500 outline-none dark:text-slate-300">
              {currencies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="mt-1.5 grid gap-1.5 md:grid-cols-[1fr_auto]">
        <label className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900">
          <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">{isRu ? "Дополнительные требования" : "Qo‘shimcha talablar"}</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder={isRu ? "Отель 4★, завтрак, минивэн..." : "4★ hotel, nonushta, miniven..."} className="mt-0.5 w-full bg-transparent text-[13px] text-[#0b1f3a] outline-none placeholder:text-slate-300 dark:text-slate-100" />
        </label>
        <button type="button" onClick={openPreparedRequest} className="min-h-11 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 md:min-w-[165px]">
          {isRu ? "Подготовить →" : "Tayyorlash →"}
        </button>
      </div>

      {error && <p role="alert" className="mt-1.5 text-xs text-red-600">{error}</p>}
      <p className="mt-1.5 hidden text-[9px] text-slate-400 lg:block">{isRu ? "Введите минимум 3 символа в полях маршрута — появятся варианты городов и аэропортов." : "Yo‘nalish maydonida kamida 3 ta belgi yozing — shahar va aeroport variantlari chiqadi."}</p>
    </section>
  );
}
