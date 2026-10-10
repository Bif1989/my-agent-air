"use client";

import { useEffect, useState } from "react";
import { getMyDealReview, submitDealReview, type DealReview } from "@/app/reviews/reviews-api";
import { useUiSettings } from "@/lib/ui-settings";

const tr = (isRu: boolean, uz: string, ru: string) => isRu ? ru : uz;

export default function DealReviewPanel({ dealId, partnerName, completed }: { dealId: string; partnerName: string; completed: boolean }) {
  const { isRu } = useUiSettings();
  const [review, setReview] = useState<DealReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(completed);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!completed) return;
    let active = true;
    const timeoutId = window.setTimeout(() => {
      void getMyDealReview(dealId)
        .then((loaded) => { if (active) setReview(loaded); })
        .catch(() => { if (active) setError(tr(isRu, "Baholash holatini yuklab bo‘lmadi.", "Не удалось загрузить состояние отзыва.")); })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [completed, dealId, isRu]);

  if (!completed) return null;

  async function submit() {
    if (rating < 1 || rating > 5 || submitting || review) return;
    setSubmitting(true);
    setError("");
    try {
      await submitDealReview(dealId, rating, comment);
      const loaded = await getMyDealReview(dealId);
      setReview(loaded);
      setComment("");
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "";
      setError(message.includes("review_already_submitted")
        ? tr(isRu, "Siz bu bitim bo‘yicha avval baho bergansiz.", "Вы уже оставили отзыв по этой сделке.")
        : tr(isRu, "Bahoni saqlab bo‘lmadi. Qayta urinib ko‘ring.", "Не удалось сохранить отзыв. Попробуйте ещё раз."));
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="mt-6 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-6 shadow-sm">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">P6 · Trust Score</p>
        <h2 className="mt-2 text-lg font-semibold text-[#0b1f3a]">{tr(isRu, "Hamkorni baholang", "Оцените партнёра")}</h2>
        <p className="mt-1 text-sm text-slate-600">{tr(isRu, `${partnerName} bilan yakunlangan real bitim asosida baho bering.`, `Оцените ${partnerName} по итогам реальной завершённой сделки.`)}</p>
      </div>
      <span className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">✓ {tr(isRu, "Yakunlangan bitim", "Завершённая сделка")}</span>
    </div>

    {loading && <div className="mt-5 h-24 animate-pulse rounded-xl bg-white" />}
    {!loading && review && <div className="mt-5 rounded-2xl border border-emerald-100 bg-white p-5">
      <p className="text-sm font-semibold text-emerald-700">{tr(isRu, "Bahoyingiz saqlandi", "Ваш отзыв сохранён")}</p>
      <p className="mt-2 text-2xl tracking-wider text-amber-500" aria-label={tr(isRu, `${review.rating} yulduz`, `${review.rating} звёзд`)}>{"★".repeat(review.rating)}<span className="text-slate-200">{"★".repeat(5 - review.rating)}</span></p>
      {review.comment && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{review.comment}</p>}
      <p className="mt-3 text-xs text-slate-400">{tr(isRu, "Bir bitim uchun bir marta baho beriladi. Bu reyting hamkorning Trust Score ko‘rsatkichiga kiradi.", "По одной сделке можно оставить один отзыв. Оценка учитывается в Trust Score партнёра.")}</p>
    </div>}

    {!loading && !review && <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={tr(isRu, "Hamkor bahosi", "Оценка партнёра")}>
        {[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={tr(isRu, `${value} yulduz`, `${value} звёзд`)} aria-pressed={rating === value} className={`rounded-xl px-2 py-1 text-3xl transition focus:outline-none focus:ring-4 focus:ring-amber-100 ${value <= rating ? "text-amber-500" : "text-slate-200 hover:text-amber-300"}`}>★</button>)}
        <span className="ml-2 text-sm font-semibold text-slate-600">{rating ? `${rating}/5` : tr(isRu, "Bahoni tanlang", "Выберите оценку")}</span>
      </div>
      <label className="mt-4 block text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Qisqa izoh", "Короткий комментарий")} <span className="font-normal text-slate-400">({tr(isRu, "ixtiyoriy", "необязательно")})</span>
        <textarea value={comment} onChange={(event) => setComment(event.target.value.slice(0, 1000))} rows={3} maxLength={1000} placeholder={tr(isRu, "Xizmat sifati, tezkorlik yoki hamkorlik haqida...", "О качестве, скорости и сотрудничестве...")} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
      </label>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-400"><span>{tr(isRu, "Faqat real yakunlangan bitim ishtirokchilari baho bera oladi.", "Оставить отзыв могут только участники реально завершённой сделки.")}</span><span>{comment.length}/1000</span></div>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={() => void submit()} disabled={rating < 1 || submitting} className="mt-4 rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 focus:outline-none focus:ring-4 focus:ring-amber-100 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? tr(isRu, "Saqlanmoqda...", "Сохранение...") : tr(isRu, "Bahoni yuborish", "Отправить отзыв")}</button>
    </div>}
  </section>;
}