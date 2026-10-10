"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";
import { getBillingSummary, listMyBillingSettlements, listMyDealFees, type BillingSettlementRecord, type BillingSummary, type DealFeeRecord } from "@/app/billing/billing-api";

const ROLE_PRICES = [
  ["Turagent / Aviakassa", 5000],
  ["Turoperator", 7000],
  ["Mehmonxona", 10000],
  ["Transport", 7000],
  ["Gid", 3000],
  ["Restoran", 5000],
] as const;

function money(value: number, currency = "UZS") {
  return `${Number(value || 0).toLocaleString("uz-UZ")} ${currency}`;
}

function formatDate(value: string, isRu: boolean) {
  return new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function roleLabel(value: string, isRu: boolean) {
  const key = value.trim().toLowerCase();
  const labels: Record<string, [string, string]> = {
    turoperator: ["Turoperator", "Туроператор"],
    tour_operator: ["Turoperator", "Туроператор"],
    mehmonxona: ["Mehmonxona", "Отель"],
    hotel: ["Mehmonxona", "Отель"],
    transport: ["Transport", "Транспорт"],
    gid: ["Gid", "Гид"],
    guide: ["Gid", "Гид"],
    restoran: ["Restoran", "Ресторан"],
    restaurant: ["Restoran", "Ресторан"],
    turagent: ["Turagent", "Турагент"],
    travel_agent: ["Turagent", "Турагент"],
    aviakassa: ["Aviakassa", "Авиакасса"],
    aviation: ["Aviakassa", "Авиакасса"],
    agent: ["Agent", "Агент"],
  };
  const item = labels[key] || [value || "Agent", value || "Агент"];
  return isRu ? item[1] : item[0];
}

function routeTitle(fee: DealFeeRecord, isRu: boolean) {
  const request = fee.deal?.request;
  if (!request) return isRu ? "Сделка" : "Bitim";
  const route = [request.origin, request.destination].filter(Boolean).join(" → ");
  return route || request.category || (isRu ? "Сделка" : "Bitim");
}

function settlementMethod(settlement: BillingSettlementRecord, isRu: boolean) {
  if (settlement.kind === "waiver") return isRu ? "Списание" : "Hisobdan chiqarish";
  const labels: Record<string, [string, string]> = {
    cash: ["Naqd", "Наличные"],
    bank_transfer: ["Bank o‘tkazma", "Банковский перевод"],
    click: ["Click", "Click"],
    payme: ["Payme", "Payme"],
    other: ["Boshqa", "Другое"],
  };
  const label = labels[settlement.method] || [settlement.method, settlement.method];
  return isRu ? label[1] : label[0];
}

export default function BillingPage() {
  const { isRu } = useUiSettings();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [fees, setFees] = useState<DealFeeRecord[]>([]);
  const [settlements, setSettlements] = useState<BillingSettlementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      setLoading(true);
      setError("");
      Promise.all([getBillingSummary(), listMyDealFees(), listMyBillingSettlements()])
        .then(([nextSummary, nextFees, nextSettlements]) => {
          if (!active) return;
          setSummary(nextSummary);
          setFees(nextFees);
          setSettlements(nextSettlements);
        })
        .catch((loadError: unknown) => {
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) {
            window.location.replace("/login");
            return;
          }
          if (active) setError(isRu ? "Не удалось загрузить данные оплаты." : "Hisob ma’lumotlarini yuklab bo‘lmadi.");
        })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [session, isRu]);

  const progress = useMemo(() => {
    if (!summary) return 0;
    return Math.min(100, Math.round((Math.min(summary.completed_count, summary.free_limit) / summary.free_limit) * 100));
  }, [summary]);

  const t = (uz: string, ru: string) => isRu ? ru : uz;

  return <AppShell session={session} activePath="/deals">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">To‘lovlar</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">{t("Hisob va tarif", "Оплата и тариф")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{t("Per-deal tarifda har oy dastlabki 5 ta muvaffaqiyatli bitim bepul. Istasangiz Oylik Unlimited abonent tarifidan ham foydalanishingiz mumkin.", "На тарифе за сделку первые 5 успешных сделок каждого месяца бесплатны. Также доступен абонентский тариф Monthly Unlimited.")}</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/billing/subscription" className="w-fit rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">{t("Oylik Unlimited", "Monthly Unlimited")}</Link><Link href="/deals" className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300">← {t("Bitimlarga qaytish", "К сделкам")}</Link></div>
      </div>

      {loading && <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl bg-slate-200" />)}</div>}
      {error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

      {!loading && summary && <>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Shu oy", "В этом месяце")}</p>
            <p className="mt-2 text-3xl font-semibold text-[#0b1f3a]">{summary.completed_count}</p>
            <p className="mt-1 text-sm text-slate-500">{t("yakunlangan bitim", "завершённых сделок")}</p>
          </section>
          <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Bepul qoldi", "Осталось бесплатно")}</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{summary.free_remaining}</p>
            <p className="mt-1 text-sm text-slate-500">{t("5 ta limitdan", "из лимита 5")}</p>
          </section>
          <section className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Keyingi bitim", "Следующая сделка")}</p>
            <p className="mt-2 text-2xl font-semibold text-amber-700">{summary.next_fee_amount === 0 ? t("Bepul", "Бесплатно") : money(summary.next_fee_amount)}</p>
            <p className="mt-1 text-sm text-slate-500">{roleLabel(summary.agent_type, isRu)}</p>
          </section>
          <section className="rounded-3xl border border-rose-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("To‘lanmagan", "К оплате")}</p>
            <p className="mt-2 text-2xl font-semibold text-rose-700">{money(summary.outstanding_amount)}</p>
            <p className="mt-1 text-sm text-slate-500">{summary.chargeable_count} {t("ta pullik bitim", "платных сделок")}</p>
          </section>
        </div>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("Bepul limit", "Бесплатный лимит")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{Math.min(summary.completed_count, summary.free_limit)} / {summary.free_limit}</h2></div>
            <p className="text-sm font-semibold text-slate-600">{summary.free_remaining > 0 ? t(`Yana ${summary.free_remaining} ta bitim bepul`, `Ещё ${summary.free_remaining} сделок бесплатно`) : t("Bepul limit ishlatildi", "Бесплатный лимит исчерпан")}</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("Hisob faqat bitim “Yakunlangan” holatiga o‘tganda yuritiladi. Bekor qilingan yoki jarayondagi bitimlar limitga kirmaydi.", "Учёт идёт только после перехода сделки в статус «Завершена». Отменённые и незавершённые сделки не учитываются.")}</p>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("Rol bo‘yicha narx", "Цена по роли")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("6-bitimdan boshlab", "Начиная с 6-й сделки")}</h2></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ROLE_PRICES.map(([role, price]) => <div key={role} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><p className="text-sm font-semibold text-[#0b1f3a]">{role}</p><p className="mt-1 text-lg font-bold text-blue-700">{money(price)} / {t("bitim", "сделка")}</p></div>)}</div>
          <p className="mt-4 text-xs leading-5 text-slate-500">{t("Viza va boshqa faoliyat turlari uchun bazaviy narx: 5 000 UZS / bitim.", "Для визовых и прочих услуг базовая цена: 5 000 UZS / сделка.")}</p>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("Hisob tarixi", "История начислений")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("Yakunlangan bitimlar", "Завершённые сделки")}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{fees.length}</span></div>
          {fees.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{t("Hozircha hisob yozuvlari yo‘q.", "Пока начислений нет.")}</div> : <div className="mt-5 space-y-3">{fees.map((fee) => {
            const free = fee.status === "free";
            const paid = fee.status === "paid";
            const statusText = free ? t("Bepul", "Бесплатно") : paid ? t("To‘langan", "Оплачено") : fee.status === "waived" ? t("Hisobdan chiqarilgan", "Списано") : t("To‘lanishi kerak", "К оплате");
            const statusClass = free ? "bg-emerald-50 text-emerald-700" : paid ? "bg-blue-50 text-blue-700" : fee.status === "waived" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700";
            return <article key={fee.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div><Link href={`/deals/${fee.deal_id}`} className="font-semibold text-[#0b1f3a] hover:text-blue-700">{routeTitle(fee, isRu)}</Link><p className="mt-1 text-xs text-slate-500">#{fee.monthly_sequence} · {formatDate(fee.deal_completed_at, isRu)} · {roleLabel(fee.role_snapshot, isRu)}</p></div>
                <div className="text-left sm:text-right"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusText}</span><p className="mt-2 font-bold text-[#0b1f3a]">{fee.fee_amount === 0 ? money(0) : money(fee.fee_amount, fee.currency)}</p></div>
              </div>
            </article>;
          })}</div>}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("Settlement tarixi", "История оплат")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("To‘lov va hisobdan chiqarishlar", "Оплаты и списания")}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{settlements.length}</span></div>
          {settlements.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{t("Hozircha to‘lov qaydlari yo‘q.", "Пока нет записей об оплате.")}</div> : <div className="mt-5 space-y-3">{settlements.map((settlement) => <article key={settlement.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="font-semibold text-[#0b1f3a]">{settlement.kind === "payment" ? t("To‘lov", "Оплата") : t("Hisobdan chiqarish", "Списание")}</p><p className="mt-1 text-xs text-slate-500">{formatDate(settlement.created_at, isRu)} · {settlementMethod(settlement, isRu)} · {settlement.items?.length || 0} {t("ta bitim", "сделок")}</p>{settlement.reference && <p className="mt-2 text-xs text-slate-500">Ref: {settlement.reference}</p>}{settlement.note && <p className="mt-1 text-xs text-slate-500">{settlement.note}</p>}</div><div className="text-left sm:text-right"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${settlement.kind === "payment" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{settlement.kind === "payment" ? t("Tasdiqlangan", "Подтверждено") : t("Waiver", "Списание")}</span><p className="mt-2 font-bold text-[#0b1f3a]">{money(settlement.amount, settlement.currency)}</p></div></div></article>)}</div>}
          <p className="mt-4 text-xs leading-5 text-slate-500">{t("Hozirgi bosqichda to‘lov admin tomonidan tasdiqlanadi. Qarzdorlik platformaga kirishni avtomatik bloklamaydi.", "На текущем этапе оплату подтверждает администратор. Задолженность автоматически не блокирует доступ к платформе.")}</p>
        </section>
      </>}
    </div>
  </AppShell>;
}
