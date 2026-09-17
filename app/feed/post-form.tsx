"use client";

import { FormEvent, useState } from "react";
import { POST_CATEGORIES, POST_CATEGORY_LABELS, POST_CURRENCIES, type PostCategory, type PostCurrency, type PostPayload, type PostType } from "@/app/feed/feed-api";

type PostFormProps = {
  initialValues?: Partial<PostPayload>;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: PostPayload) => Promise<void>;
};

function stringValue(value: string | null | undefined) {
  return value || "";
}

export default function PostForm({ initialValues, submitLabel, submittingLabel, onSubmit }: PostFormProps) {
  const [postType, setPostType] = useState<PostType>(initialValues?.post_type || "post");
  const [category, setCategory] = useState<PostCategory | "">(initialValues?.category || "");
  const [title, setTitle] = useState(stringValue(initialValues?.title));
  const [body, setBody] = useState(stringValue(initialValues?.body));
  const [origin, setOrigin] = useState(stringValue(initialValues?.origin));
  const [destination, setDestination] = useState(stringValue(initialValues?.destination));
  const [price, setPrice] = useState(initialValues?.price == null ? "" : String(initialValues.price));
  const [currency, setCurrency] = useState<PostCurrency>(initialValues?.currency || "USD");
  const [contactPhone, setContactPhone] = useState(stringValue(initialValues?.contact_phone));
  const [expiresAt, setExpiresAt] = useState(stringValue(initialValues?.expires_at)?.slice(0, 10));
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    const trimmedOrigin = origin.trim();
    const trimmedDestination = destination.trim();
    const trimmedPhone = contactPhone.trim();
    const priceNumber = price === "" ? null : Number(price);

    if (!category) return setError("Kategoriya tanlanishi kerak.");
    if (!trimmedBody || trimmedBody.length > 5000) return setError("Matn 1–5000 belgidan iborat bo‘lishi kerak.");
    if (postType === "announcement" && !trimmedTitle) return setError("E’lon uchun sarlavha kiritilishi shart.");
    if (trimmedTitle.length > 180) return setError("Sarlavha 180 belgidan oshmasligi kerak.");
    if (trimmedOrigin.length > 120 || trimmedDestination.length > 120) return setError("Yo‘nalish maydonlari 120 belgidan oshmasligi kerak.");
    if (trimmedPhone.length > 40) return setError("Telefon raqami 40 belgidan oshmasligi kerak.");
    if (priceNumber !== null && (!Number.isFinite(priceNumber) || priceNumber < 0)) return setError("Narx 0 yoki undan katta bo‘lishi kerak.");

    setIsSubmitting(true);
    try {
      await onSubmit({
        post_type: postType,
        category,
        title: trimmedTitle || null,
        body: trimmedBody,
        origin: trimmedOrigin || null,
        destination: trimmedDestination || null,
        price: priceNumber,
        currency,
        contact_phone: trimmedPhone || null,
        expires_at: expiresAt || null,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Postni saqlashda xatolik yuz berdi.");
      setIsSubmitting(false);
    }
  }

  const inputClass = "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0b1f3a] outline-none transition placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  return (
    <form onSubmit={handleSubmit} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
          Post turi
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => setPostType("post")} className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 ${postType === "post" ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>Oddiy post</button>
            <button type="button" onClick={() => setPostType("announcement")} className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-4 focus:ring-blue-100 ${postType === "announcement" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-500"}`}>E’lon</button>
          </div>
        </label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Kategoriya<select required value={category} onChange={(event) => setCategory(event.target.value as PostCategory)} className={inputClass}><option value="" disabled>Kategoriyani tanlang</option>{POST_CATEGORIES.map((item) => <option key={item} value={item}>{POST_CATEGORY_LABELS[item]}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Sarlavha{postType === "announcement" && <span className="text-amber-600"> (majburiy)</span>}<input maxLength={180} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Masalan: Toshkent — Istanbul chiptalari" className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Matn<textarea required maxLength={5000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Post yoki e’lon matnini yozing" className={inputClass} /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{body.length}/5000</span></label>
        <label className="text-sm font-semibold text-slate-700">Qayerdan<input maxLength={120} value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder="Toshkent" className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Qayerga<input maxLength={120} value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Istanbul" className={inputClass} /></label>
        <div className="grid grid-cols-[1fr_110px] gap-3"><label className="text-sm font-semibold text-slate-700">Narx<input min="0" step="0.01" type="number" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" className={inputClass} /></label><label className="text-sm font-semibold text-slate-700">Valyuta<select value={currency} onChange={(event) => setCurrency(event.target.value as PostCurrency)} className={inputClass}>{POST_CURRENCIES.map((item) => <option key={item}>{item}</option>)}</select></label></div>
        <label className="text-sm font-semibold text-slate-700">Aloqa telefoni<input maxLength={40} value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} placeholder="+998 90 123 45 67" className={inputClass} /></label>
        <label className="text-sm font-semibold text-slate-700">Amal qilish muddati<input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={inputClass} /></label>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="submit" disabled={isSubmitting} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? submittingLabel : submitLabel}</button>
    </form>
  );
}
