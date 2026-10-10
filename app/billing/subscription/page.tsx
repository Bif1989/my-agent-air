"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";
import {
  getBillingSubscriptionStatus,
  listMyBillingSubscriptions,
  type BillingSubscriptionRecord,
  type BillingSubscriptionStatus,
} from "@/app/billing/subscription/subscription-api";

function money(value: number | null, currency = "UZS") {
  if (value === null) return "—";
  return `${Number(value).toLocaleString("uz-UZ")} ${currency}`;
}

function formatDate(value: string | null, isRu: boolean) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function methodLabel(method: BillingSubscriptionRecord["method"], isRu: boolean) {
  const labels: Record<BillingSubscriptionRecord["method"], [string, string]> = {
    cash: ["Naqd", "Наличные"],
    bank_transfer: ["Bank o‘tkazma", "Банковский перевод"],
    click: ["Click", "Click"],
    payme: ["Payme", "Payme"],
    other: ["Boshqa", "Другое"],
  };
  return isRu ? labels[method][1] : labels[method][0];
}

export default function BillingSubscriptionPage() {
  const { isRu } = useUiSettings();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<BillingSubscriptionStatus | null>(null);
  const [history, setHistory] = useState<BillingSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const t = (uz: string, ru: string) => isRu ? ru : uz;

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => setSession(stored), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const timeoutId = window.setTimeout(() => {
      Promise.all([getBillingSubscriptionStatus(), listMyBillingSubscriptions()])
        .then(([nextStatus, nextHistory]) => {
          if (!active) return;
          setStatus(nextStatus);
          setHistory(nextHistory);
        })
        .catch((loadError: unknown) => {
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) {
            window.location.replace("/login");
            return;
          }
          if (active) setError(t("Abonent tarifi ma’lumotlarini yuklab bo‘lmadi.", "Не удалось загрузить данные абонентского тарифа."));
        })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [session, isRu]);

  return <AppShell session={session} activePath="/deals">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">P5 · Unlimited</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">{t("Oylik abonent tarifi", "Месячный абонентский тариф")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Abonent faol bo‘lgan davrda yakunlangan bitimlar sonidan qat’i nazar qo‘shimcha per-deal komissiya hisoblanmaydi.", "Пока абонентский тариф активен, дополнительная комиссия за каждую завершённую сделку не начисляется независимо от количества сделок.")}</p>
        </div>
        <Link href="/billing" className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300">← {t("Hisobga qaytish", "К оплате")}</Link>
      </div>

      {loading && <div className="mt-7 h-72 animate-pulse rounded-3xl bg-slate-200" />}
      {error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

      {!loading && status && <>
        <section className={`mt-7 rounded-3xl border p-6 shadow-sm sm:p-8 ${status.subscription_active ? "border-emerald-200 bg-emerald-50/60" : "border-blue-100 bg-white"}`}>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.subscription_active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>{status.subscription_active ? t("FAOL", "АКТИВЕН") : t("FAOL EMAS", "НЕ АКТИВЕН")}</span>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Unlimited</span>
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-[#0b1f3a]">{status.plan_name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t(`${status.duration_days} kun davomida bitimlar bo‘yicha alohida xizmat haqi olinmaydi.`, `${status.duration_days} дней без отдельной комиссии за сделки.`)}</p>
            </div>
            <div className="rounded-2xl bg-white px-5 py-4 text-left shadow-sm sm:text-right">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Abonent narxi", "Стоимость")}</p>
              <p className="mt-2 text-2xl font-bold text-blue-700">{money(status.plan_price_amount, status.currency)}</p>
              <p className="mt-1 text-xs text-slate-500">/ {status.duration_days} {t("kun", "дней")}</p>
            </div>
          </div>

          {status.subscription_active ? <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-slate-400">{t("Boshlangan", "Начало")}</p><p className="mt-2 text-sm font-semibold text-[#0b1f3a]">{formatDate(status.subscription_starts_at, isRu)}</p></div>
            <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-slate-400">{t("Tugaydi", "Окончание")}</p><p className="mt-2 text-sm font-semibold text-[#0b1f3a]">{formatDate(status.subscription_ends_at, isRu)}</p></div>
            <div className="rounded-2xl bg-white p-4"><p className="text-xs font-semibold text-slate-400">{t("Qoldi", "Осталось")}</p><p className="mt-2 text-xl font-bold text-emerald-700">{status.days_remaining} {t("kun", "дн.")}</p></div>
          </div> : <div className="mt-6 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-5 text-sm leading-6 text-slate-600">
            {status.plan_is_active && status.plan_price_amount ? t("Tarif mavjud. Hozircha abonent to‘lovi administrator tomonidan tasdiqlanib faollashtiriladi. Keyinchalik Click/Payme online to‘lovi shu tarifga ulanadi.", "Тариф доступен. Сейчас абонентская плата подтверждается и активируется администратором. Позже к этому тарифу будет подключена онлайн-оплата Click/Payme.") : t("Oylik Unlimited tarifining narxi hali administrator tomonidan yoqilmagan.", "Цена тарифа Monthly Unlimited пока не активирована администратором.")}
          </div>}

          <p className="mt-5 text-xs leading-5 text-slate-500">{t("Abonent sotib olish oldingi per-deal qarzdorlikni o‘chirmaydi. Abonent muddati tugagach tizim avtomatik ravishda odatiy per-deal tarifga qaytadi.", "Покупка абонемента не списывает предыдущую задолженность по сделкам. После окончания срока система автоматически возвращается к обычному тарифу за сделку.")}</p>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("Abonent tarixi", "История абонементов")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("Oldingi to‘lovlar", "Предыдущие оплаты")}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{history.length}</span></div>
          {history.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{t("Hozircha abonent to‘lovi yo‘q.", "Пока нет абонентских платежей.")}</div> : <div className="mt-5 space-y-3">{history.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="font-semibold text-[#0b1f3a]">{t("Oylik Unlimited", "Monthly Unlimited")}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.starts_at, isRu)} → {formatDate(item.ends_at, isRu)} · {methodLabel(item.method, isRu)}</p>{item.reference && <p className="mt-2 text-xs text-slate-500">Ref: {item.reference}</p>}{item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}</div><div className="text-left sm:text-right"><span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{t("Tasdiqlangan", "Подтверждено")}</span><p className="mt-2 font-bold text-[#0b1f3a]">{money(item.amount, item.currency)}</p></div></div></article>)}</div>}
        </section>
      </>}
    </div>
  </AppShell>;
}
