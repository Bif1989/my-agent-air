"use client";

import { FormEvent, useState } from "react";
import { hasAirTravel, type ServiceData } from "@/lib/service-request";
import AirlineSmartInput from "@/app/components/airline-smart-input";
import { useUiSettings } from "@/lib/ui-settings";
import type { OfferPayload } from "@/app/offers/offers-api";

const currencies = ["USD", "UZS", "EUR", "RUB"];

type OfferFormProps = {
  category?: string;
  serviceDetails?: ServiceData;
  initialValues?: {
    price?: number | null;
    currency?: string | null;
    airline?: string | null;
    baggage?: string | null;
    comment?: string | null;
  };
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: OfferPayload) => Promise<void>;
};

export default function OfferForm({ category = "Aviachipta", serviceDetails, initialValues, submitLabel, submittingLabel, onSubmit }: OfferFormProps) {
  const { isRu } = useUiSettings();
  const [price, setPrice] = useState(initialValues?.price == null ? "" : String(initialValues.price));
  const [currency, setCurrency] = useState(initialValues?.currency || "USD");
  const [airline, setAirline] = useState(initialValues?.airline || "");
  const [baggage, setBaggage] = useState(initialValues?.baggage || "");
  const [comment, setComment] = useState(initialValues?.comment || "");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isAirTravel = hasAirTravel({ category, service_details: serviceDetails });
  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0b1f3a] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    const priceNumber = Number(price);
    if (!Number.isFinite(priceNumber) || priceNumber <= 0 || priceNumber > 1e12) return setError(isRu ? "Цена должна быть больше 0." : "Narx 0 dan katta bo‘lishi kerak.");
    if (comment.length > 1000) return setError(isRu ? "Комментарий не должен превышать 1000 символов." : "Izoh 1000 belgidan oshmasligi kerak.");
    setIsSubmitting(true);
    try {
      await onSubmit({ price: priceNumber, currency, airline: isAirTravel ? airline.trim() || null : null, baggage: isAirTravel ? baggage.trim() || null : null, comment: comment.trim() || null });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : (isRu ? "Не удалось сохранить предложение." : "Taklifni saqlashda xatolik yuz berdi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return <form onSubmit={handleSubmit} className="space-y-5"><p className="text-xs leading-5 text-slate-500">{isRu ? "Укажите итоговую стоимость всего предложенного объёма услуг. Состав, налоги, сроки и условия отмены опишите в комментарии." : "Taklif qilinayotgan barcha xizmatlarning jami narxini kiriting. Tarkibi, soliqlar, muddat va bekor qilish shartlarini izohda yozing."}</p><div className="grid gap-5 sm:grid-cols-2"><div className="grid grid-cols-[1fr_110px] gap-3"><label className="text-sm font-semibold text-slate-700">{isRu ? "Общая цена предложения" : "Taklifning jami narxi"}<input required min="0.01" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">{isRu ? "Валюта" : "Valyuta"}<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></label></div>{isAirTravel && <label className="text-sm font-semibold text-slate-700">{isRu ? "Авиакомпания" : "Aviakompaniya"}<AirlineSmartInput value={airline} onChange={setAirline} placeholder={isRu ? "Например: Uzbekistan Airways" : "Masalan: Uzbekistan Airways"} className={inputClass} disabled={isSubmitting} /></label>}{isAirTravel && <label className="text-sm font-semibold text-slate-700 sm:col-span-2">{isRu ? "Багаж" : "Bagaj"}<input value={baggage} onChange={(event) => setBaggage(event.target.value)} placeholder={isRu ? "Например: 1 место 23 кг" : "Masalan: 1 dona 23 kg"} className={inputClass} /></label>}<label className="text-sm font-semibold text-slate-700 sm:col-span-2">{isRu ? "Комментарий" : "Izoh"}<textarea maxLength={1000} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder={isRu ? "Условия предложения или дополнительная информация" : "Taklif shartlari yoki qo‘shimcha ma’lumot"} className={inputClass} /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{comment.length}/1000</span></label></div>{error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}<button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? submittingLabel : submitLabel}</button></form>;
}
