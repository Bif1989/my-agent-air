"use client";

import { FormEvent, useState } from "react";
import type { RequestPayload } from "@/app/requests/requests-api";

const categories = ["Aviachipta", "Tur paket", "Mehmonxona", "Transfer", "Viza", "Boshqa"];
const currencies = ["USD", "UZS", "EUR", "RUB"];

type RequestFormProps = {
  initialValues?: Partial<RequestPayload>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: RequestPayload) => Promise<void>;
};

function stringValue(value: string | null | undefined) {
  return value || "";
}

export default function RequestForm({ initialValues, submitLabel, submittingLabel, onSubmit }: RequestFormProps) {
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
  const [description, setDescription] = useState(stringValue(initialValues?.description));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = (() => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60 * 1000).toISOString().slice(0, 10);
  })();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    const adultsNumber = Number(adults);
    const childrenNumber = Number(children);
    const infantsNumber = Number(infants);
    const budgetNumber = budget === "" ? null : Number(budget);
    if (!category) return setError("Kategoriya tanlanishi kerak.");
    if (!origin.trim() && !destination.trim()) return setError("Qayerdan yoki qayerga maydonidan kamida bittasini kiriting.");
    if (!Number.isInteger(adultsNumber) || adultsNumber < 1) return setError("Kattalar soni kamida 1 bo‘lishi kerak.");
    if (!Number.isInteger(childrenNumber) || childrenNumber < 0 || !Number.isInteger(infantsNumber) || infantsNumber < 0) return setError("Bolalar va go‘daklar soni 0 yoki undan yuqori bo‘lishi kerak.");
    if (budgetNumber !== null && (!Number.isFinite(budgetNumber) || budgetNumber < 0)) return setError("Budjet manfiy bo‘lishi mumkin emas.");
    if (travelDate && travelDate < today) return setError("Safar sanasi o‘tgan sana bo‘lishi mumkin emas.");
    if (description.length > 1000) return setError("Tavsif 1000 belgidan oshmasligi kerak.");

    setIsSubmitting(true);
    try {
      await onSubmit({ category, origin: origin.trim() || null, destination: destination.trim() || null, travel_date: travelDate || null, adults: adultsNumber, children: childrenNumber, infants: infantsNumber, baggage: baggage.trim() || null, budget: budgetNumber, currency, description: description.trim() || null });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "So‘rovni saqlashda xatolik yuz berdi.");
      setIsSubmitting(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0b1f3a] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Kategoriya<select required value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}><option value="" disabled>Kategoriyani tanlang</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">Qayerdan<input value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Toshkent" className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Qayerga<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Istanbul" className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Safar sanasi<input type="date" min={today} value={travelDate} onChange={(event) => setTravelDate(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Bagaj<input value={baggage} onChange={(event) => setBaggage(event.target.value)} placeholder="Masalan: 1 dona 23 kg" className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Kattalar soni<input required min="1" step="1" type="number" value={adults} onChange={(event) => setAdults(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Bolalar soni<input min="0" step="1" type="number" value={children} onChange={(event) => setChildren(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Go‘daklar soni<input min="0" step="1" type="number" value={infants} onChange={(event) => setInfants(event.target.value)} className={inputClass} /></label>
        <div className="grid grid-cols-[1fr_110px] gap-3"><label className="text-sm font-semibold text-slate-700">Budjet<input min="0" step="0.01" type="number" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="0" className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">Valyuta<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={inputClass}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Qo‘shimcha ma’lumot<textarea maxLength={1000} rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Safar yoki xizmat tafsilotlarini yozing" className={inputClass} /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{description.length}/1000</span></label>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? submittingLabel : submitLabel}</button>
    </form>
  );
}
