"use client";

import { tashkentDate } from "@/lib/request-freshness";
import { joinServiceDetails, splitServiceDetails } from "@/lib/request-details";
import { useUiSettings } from "@/lib/ui-settings";
import { FormEvent, useState } from "react";
import AviaSmartAssist from "@/app/components/avia-smart-assist";
import AviaSmartInput from "@/app/components/avia-smart-input";
import type { RequestPayload } from "@/app/requests/requests-api";

const categories = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Gid", "Viza", "Boshqa"];
const currencies = ["USD", "UZS", "EUR", "RUB"];
const categoryRu: Record<string, string> = {
  Aviachipta: "Авиабилет",
  "Tur paket": "Турпакет",
  Mehmonxona: "Отель",
  Transfer: "Трансфер",
  Gid: "Гид",
  Viza: "Виза",
  Boshqa: "Другое",
};

type RequestFormProps = {
  initialValues?: Partial<RequestPayload>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: RequestPayload) => Promise<void>;
};

function stringValue(value: string | null | undefined) { return value || ""; }

export default function RequestForm({ initialValues, submitLabel, submittingLabel, onSubmit }: RequestFormProps) {
  const { isRu } = useUiSettings();
  const [category, setCategory] = useState(initialValues?.category || "");
  const [origin, setOrigin] = useState(stringValue(initialValues?.origin));
  const [destination, setDestination] = useState(stringValue(initialValues?.destination));
  const [travelDate, setTravelDate] = useState(stringValue(initialValues?.travel_date));
  const [adults, setAdults] = useState(String(initialValues?.adults ?? 1));
  const [children, setChildren] = useState(String(initialValues?.children ?? 0));
  const [infants, setInfants] = useState(String(initialValues?.infants ?? 0));
  const [baggage, setBaggage] = useState(stringValue(initialValues?.baggage));
  const [budget, setBudget] = useState(initialValues?.budget == null ? "" : String(initialValues.budget));
  const [currency, setCurrency] = useState(initialValues?.currency || "USD");
  const [description, setDescription] = useState(() => splitServiceDetails(initialValues?.description).text);
  const [details, setDetails] = useState(() => splitServiceDetails(initialValues?.description).details);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = tashkentDate();
  const isAirTravel = category === "Aviachipta" || category === "Tur paket";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    const adultsNumber = Number(adults);
    const childrenNumber = Number(children);
    const infantsNumber = Number(infants);
    const budgetNumber = budget === "" ? null : Number(budget);
    if (!category) return setError(isRu ? "Выберите категорию." : "Kategoriya tanlanishi kerak.");
    if (!origin.trim() && !destination.trim()) return setError(isRu ? "Укажите хотя бы город отправления или назначения." : "Qayerdan yoki qayerga maydonidan kamida bittasini kiriting.");
    if (!Number.isInteger(adultsNumber) || adultsNumber < 1) return setError(isRu ? "Количество участников должно быть не меньше 1." : "Kattalar soni kamida 1 bo‘lishi kerak.");
    if (!Number.isInteger(childrenNumber) || childrenNumber < 0 || !Number.isInteger(infantsNumber) || infantsNumber < 0) return setError(isRu ? "Количество детей и младенцев не может быть отрицательным." : "Bolalar va go‘daklar soni 0 yoki undan yuqori bo‘lishi kerak.");
    if (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) return setError(isRu ? "Бюджет не может быть отрицательным." : "Budjet manfiy bo‘lishi mumkin emas.");
    if (travelDate && travelDate < today) return setError(isRu ? "Дата поездки не может быть в прошлом." : "Safar sanasi o‘tgan sana bo‘lishi mumkin emas.");
    const fullDescription = joinServiceDetails(description, category, details);
    if (category === "Mehmonxona" && (!/^\d+$/.test(details.rooms) || Number(details.rooms) < 1 || !/^\d+$/.test(details.nights) || Number(details.nights) < 1)) return setError(isRu ? "Укажите минимум 1 номер и 1 ночь." : "Xonalar va tunlar soni kamida 1 bo‘lsin.");
    if (category === "Transfer" && !details.vehicle.trim()) return setError(isRu ? "Укажите тип транспорта." : "Transport turini kiriting.");
    if (category === "Gid" && !details.language.trim()) return setError(isRu ? "Укажите язык гида." : "Gid tilini kiriting.");
    if (fullDescription.length > 1000) return setError(isRu ? "Описание не должно превышать 1000 символов." : "Tavsif 1000 belgidan oshmasligi kerak.");

    setIsSubmitting(true);
    try {
      await onSubmit({ category, origin: origin.trim() || null, destination: destination.trim() || null, travel_date: travelDate || null, adults: adultsNumber, children: childrenNumber, infants: infantsNumber, baggage: isAirTravel ? baggage.trim() || null : null, budget: budgetNumber, currency, description: fullDescription || null });
    } catch (submitError) {
      throw submitError instanceof Error ? submitError : new Error(isRu ? "Не удалось сохранить запрос." : "So‘rovni saqlashda xatolik yuz berdi.");
    } finally { setIsSubmitting(false); }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0b1f3a] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  const localizedSubmit = isRu ? (submitLabel === "So‘rovni yaratish" ? "Создать запрос" : submitLabel) : submitLabel;
  const localizedSubmitting = isRu ? (submittingLabel === "Yaratilmoqda..." ? "Создание..." : submittingLabel) : submittingLabel;

  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">{isRu ? "Категория" : "Kategoriya"}<select required value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}><option value="" disabled>{isRu ? "Выберите категорию" : "Kategoriyani tanlang"}</option>{categories.map((item) => <option key={item} value={item}>{isRu ? categoryRu[item] : item}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">{category === "Mehmonxona" || category === "Gid" ? (isRu ? "Город / место" : "Shahar / joy") : (isRu ? "Откуда" : "Qayerdan")}{isAirTravel ? <AviaSmartInput value={origin} onChange={setOrigin} placeholder={isRu ? "Ташкент" : "Toshkent"} className={inputClass} mode="airport" /> : <input value={origin} maxLength={120} onChange={(event) => setOrigin(event.target.value)} placeholder={isRu ? "Город или адрес" : "Shahar yoki manzil"} className={inputClass} />}</label>
        <label className="text-sm font-semibold text-slate-700">{isRu ? "Куда" : "Qayerga"}{isAirTravel ? <AviaSmartInput value={destination} onChange={setDestination} placeholder={isRu ? "Стамбул" : "Istanbul"} className={inputClass} mode="airport" /> : <input value={destination} maxLength={120} onChange={(event) => setDestination(event.target.value)} placeholder={isRu ? "Пункт назначения или место услуги" : "Manzil yoki xizmat joyi"} className={inputClass} />}</label>
        <label className="text-sm font-semibold text-slate-700">{isRu ? "Дата поездки" : "Safar sanasi"}<input type="date" min={today} value={travelDate} onChange={(event) => setTravelDate(event.target.value)} className={inputClass} /></label>
        {isAirTravel && <label className="text-sm font-semibold text-slate-700">{isRu ? "Багаж" : "Bagaj"}<input value={baggage} onChange={(event) => setBaggage(event.target.value)} placeholder={isRu ? "Например: 1 место 23 кг" : "Masalan: 1 dona 23 kg"} className={inputClass} /></label>}
        <label className="text-sm font-semibold text-slate-700">{isAirTravel ? (isRu ? "Взрослые" : "Kattalar soni") : (isRu ? "Участники" : "Ishtirokchilar soni")}<input required min="1" step="1" type="number" value={adults} onChange={(event) => setAdults(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">{isRu ? "Дети" : "Bolalar soni"}<input min="0" step="1" type="number" value={children} onChange={(event) => setChildren(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">{isRu ? "Младенцы" : "Go‘daklar soni"}<input min="0" step="1" type="number" value={infants} onChange={(event) => setInfants(event.target.value)} className={inputClass} /></label>
        {category === "Mehmonxona" && ([['rooms', isRu ? 'Количество номеров' : 'Xonalar soni'], ['nights', isRu ? 'Количество ночей' : 'Tunlar soni']] as const).map(([field, label]) => <label key={field} className="text-sm font-semibold text-slate-700">{label}<input required type="number" min="1" max="365" step="1" value={details[field]} onChange={(event) => setDetails((current) => ({ ...current, [field]: event.target.value }))} className={inputClass} /></label>)}
        {category === "Transfer" && <label className="text-sm font-semibold text-slate-700">{isRu ? "Тип транспорта" : "Transport turi"}<input required maxLength={100} value={details.vehicle} onChange={(event) => setDetails((current) => ({ ...current, vehicle: event.target.value }))} placeholder={isRu ? "Седан, минивэн, автобус…" : "Sedan, miniven, avtobus…"} className={inputClass} /></label>}
        {category === "Gid" && <label className="text-sm font-semibold text-slate-700">{isRu ? "Язык гида" : "Gid tili"}<input required maxLength={100} value={details.language} onChange={(event) => setDetails((current) => ({ ...current, language: event.target.value }))} placeholder={isRu ? "Узбекский, русский, английский…" : "O‘zbek, rus, ingliz…"} className={inputClass} /></label>}
        <div className="grid grid-cols-[1fr_110px] gap-3"><label className="text-sm font-semibold text-slate-700">{isRu ? "Бюджет" : "Budjet"}<input min="0" step="0.01" type="number" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0" className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">{isRu ? "Валюта" : "Valyuta"}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">{isRu ? "Дополнительная информация" : "Qo‘shimcha ma’lumot"}<AviaSmartAssist value={description} onChange={setDescription} maxLength={1000} rows={5} placeholder={isRu ? "Опишите детали поездки или услуги" : "Safar yoki xizmat tafsilotlarini yozing"} className={inputClass} containerClassName="relative mt-2" /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{description.length}/1000</span></label>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? localizedSubmitting : localizedSubmit}</button>
    </form>
  );
}
