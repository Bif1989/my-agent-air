"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import OfferForm from "@/app/offers/offer-form";
import { createOffer, getMyOfferForRequest, type OfferPayload, type OfferRecord } from "@/app/offers/offers-api";
import type { RequestRecord } from "./requests-api";
import { isRequestCurrent } from "@/lib/request-freshness";
import { useUiSettings } from "@/lib/ui-settings";

export default function RequestOfferPanel({ request }: { request: RequestRecord }) {
  const { isRu } = useUiSettings();
  const [offer, setOffer] = useState<OfferRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sent, setSent] = useState(false);
  const canOffer = request.status === "open" && isRequestCurrent(request);

  useEffect(() => {
    let active = true;
    void getMyOfferForRequest(request.id).then((loaded) => {
      if (active) setOffer(loaded);
    }).catch(() => { if (active) setFailed(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request.id, attempt]);

  async function submit(payload: OfferPayload) {
    if (offer || sent || !canOffer || loading || failed) return;
    try {
      await createOffer(request.id, payload);
      setSent(true);
    } catch {
      throw new Error(isRu ? "Не удалось отправить предложение. Проверьте данные и попробуйте снова." : "Taklifni yuborib bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.");
    }
  }

  return <section id="offer" className="mt-6 scroll-mt-6 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
    <h2 className="text-lg font-semibold text-[#0b1f3a]">{isRu ? "Ваше предложение" : "Sizning taklifingiz"}</h2>
    {loading ? <p role="status" className="mt-4 text-sm text-slate-500">{isRu ? "Проверяем предложение…" : "Taklif holati tekshirilmoqda…"}</p>
      : failed ? <div role="alert" className="mt-4 text-sm text-red-700"><p>{isRu ? "Не удалось проверить ваше предложение." : "Mavjud taklifingizni tekshirib bo‘lmadi."}</p><button type="button" onClick={() => { setLoading(true); setFailed(false); setAttempt((value) => value + 1); }} className="mt-2 rounded-lg px-3 py-2 font-semibold underline">{isRu ? "Повторить" : "Qayta yuklash"}</button></div>
      : offer || sent ? <div className="mt-4 rounded-xl bg-emerald-50 p-4"><p role="status" className="font-semibold text-emerald-800">{offer ? (isRu ? { pending: "Ожидает решения", accepted: "Принято", rejected: "Отклонено", withdrawn: "Отозвано" }[offer.status] : { pending: "Javob kutilmoqda", accepted: "Qabul qilingan", rejected: "Rad etilgan", withdrawn: "Qaytarib olingan" }[offer.status]) : (isRu ? "Предложение отправлено" : "Taklif yuborildi")}</p><p className="mt-2 text-sm text-slate-600">{isRu ? "Следите за решением и управляйте предложением в разделе «Мои предложения»." : "Javobni kuzatish va taklifni boshqarish uchun «Yuborgan takliflarim» bo‘limiga o‘ting."}</p><Link href="/requests?tab=my-offers" className="mt-3 inline-block font-semibold text-blue-700">{isRu ? "Мои предложения →" : "Yuborgan takliflarim →"}</Link></div>
      : canOffer ? <div className="mt-5"><OfferForm category={request.category} serviceDetails={request.service_details} submitLabel={isRu ? "Отправить предложение" : "Taklif yuborish"} submittingLabel={isRu ? "Отправка…" : "Yuborilmoqda…"} onSubmit={submit} /></div>
      : <p className="mt-4 text-sm text-slate-500">{isRu ? "Приём предложений закрыт или срок запроса истёк." : "Taklif qabul qilish yopilgan yoki so‘rov muddati o‘tgan."}</p>}
  </section>;
}
