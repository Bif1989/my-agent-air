"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getBillingWalletStatus, type BillingWalletStatus } from "@/app/billing/billing-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";
import {
  getBillingSubscriptionStatus,
  listMyBillingSubscriptions,
  purchaseSubscriptionFromWallet,
  startClickSubscriptionPayment,
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
    wallet: ["Balans", "Баланс"],
    other: ["Boshqa", "Другое"],
  };
  return isRu ? labels[method][1] : labels[method][0];
}

export default function BillingSubscriptionPage() {
  const { isRu } = useUiSettings();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<BillingSubscriptionStatus | null>(null);
  const [wallet, setWallet] = useState<BillingWalletStatus | null>(null);
  const [history, setHistory] = useState<BillingSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [walletPaying, setWalletPaying] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const t = (uz: string, ru: string) => isRu ? ru : uz;

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => setSession(stored), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const load = useCallback(async () => {
    const [nextStatus, nextHistory, nextWallet] = await Promise.all([
      getBillingSubscriptionStatus(),
      listMyBillingSubscriptions(),
      getBillingWalletStatus(),
    ]);
    setStatus(nextStatus);
    setHistory(nextHistory);
    setWallet(nextWallet);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const timeoutId = window.setTimeout(() => {
      load()
        .catch((loadError: unknown) => {
          if (!active) return;
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) {
            window.location.replace("/login");
            return;
          }
          setError(t("Abonent tarifi ma’lumotlarini yuklab bo‘lmadi.", "Не удалось загрузить данные абонентского тарифа."));
        })
        .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timeoutId); };
  }, [session, isRu, load]);

  async function payFromWallet() {
    if (!status?.plan_price_amount || !wallet || walletPaying) return;
    setPaymentError("");
    setWalletMessage("");
    if (wallet.balance < status.plan_price_amount) {
      setPaymentError(t(
        `Balans yetarli emas. Yana ${money(status.plan_price_amount - wallet.balance)} kerak.`,
        `Недостаточно средств. Нужно ещё ${money(status.plan_price_amount - wallet.balance)}.`,
      ));
      return;
    }
    const confirmed = window.confirm(t(
      `Balansdan ${money(status.plan_price_amount, status.currency)} yechib, Unlimited tarifini faollashtirasizmi?`,
      `Списать ${money(status.plan_price_amount, status.currency)} с баланса и активировать Unlimited?`,
    ));
    if (!confirmed) return;

    setWalletPaying(true);
    try {
      const purchase = await purchaseSubscriptionFromWallet(status.plan_code || "monthly_unlimited");
      await load();
      setWalletMessage(t(
        `Unlimited faollashtirildi. Balans qoldig‘i: ${money(purchase.balance_after || 0)}.`,
        `Unlimited активирован. Остаток баланса: ${money(purchase.balance_after || 0)}.`,
      ));
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : "WALLET_PURCHASE_FAILED";
      if (code === "AUTH_SESSION_EXPIRED" || code === "AUTH_SESSION_MISSING") {
        window.location.replace("/login");
        return;
      }
      const messages: Record<string, [string, string]> = {
        WALLET_INSUFFICIENT_BALANCE: ["Balans Unlimited uchun yetarli emas.", "Недостаточно средств для Unlimited."],
        WALLET_MODE_DISABLED: ["Balans orqali to‘lov hali yoqilmagan.", "Оплата с баланса пока не включена."],
        WALLET_PLAN_UNAVAILABLE: ["Unlimited tarifi hozir mavjud emas.", "Тариф Unlimited сейчас недоступен."],
        WALLET_ACCOUNT_NOT_ACTIVE: ["Hisob faol holatda emas.", "Аккаунт не активен."],
        WALLET_PURCHASE_FAILED: ["Balansdan to‘lashda xatolik. Qayta urinib ko‘ring.", "Ошибка оплаты с баланса. Попробуйте ещё раз."],
      };
      const message = messages[code] || messages.WALLET_PURCHASE_FAILED;
      setPaymentError(isRu ? message[1] : message[0]);
    } finally {
      setWalletPaying(false);
    }
  }

  async function payWithClick() {
    setPaymentError("");
    setWalletMessage("");
    setPaying(true);
    try {
      const payment = await startClickSubscriptionPayment(status?.plan_code || "monthly_unlimited");
      window.location.assign(payment.paymentUrl);
    } catch (paymentFailure) {
      const code = paymentFailure instanceof Error ? paymentFailure.message : "CLICK_PAYMENT_UNAVAILABLE";
      if (code === "AUTH_SESSION_EXPIRED" || code === "AUTH_SESSION_MISSING") {
        window.location.replace("/login");
        return;
      }
      const messages: Record<string, [string, string]> = {
        CLICK_PAYMENT_DISABLED: ["Click to‘lovi hali ishga tushirilmagan.", "Оплата Click пока не запущена."],
        CLICK_PLAN_UNAVAILABLE: ["Unlimited tarifi hozir to‘lov uchun mavjud emas.", "Тариф Unlimited сейчас недоступен для оплаты."],
        CLICK_PAYMENT_UNAVAILABLE: ["Click to‘lovini boshlashda vaqtinchalik xatolik. Qayta urinib ko‘ring.", "Временная ошибка запуска оплаты Click. Попробуйте ещё раз."],
      };
      const message = messages[code] || messages.CLICK_PAYMENT_UNAVAILABLE;
      setPaymentError(isRu ? message[1] : message[0]);
    } finally {
      setPaying(false);
    }
  }

  const walletEnough = Boolean(status?.plan_price_amount && wallet && wallet.balance >= status.plan_price_amount);

  return <AppShell session={session} activePath="/profile">
    <div className="mx-auto max-w-5xl pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Unlimited</p>
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
          </div> : <div className="mt-6 space-y-4">
            {status.plan_is_active && status.plan_price_amount ? <>
              <div className={`rounded-2xl border p-5 ${walletEnough ? "border-emerald-300 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{t("MY AGENT AIR BALANSI", "БАЛАНС MY AGENT AIR")}</p>
                    <p className="mt-2 text-2xl font-bold text-[#0b1f3a]">{money(wallet?.balance || 0)}</p>
                    <p className="mt-1 text-sm text-slate-600">{walletEnough
                      ? t("Balans Unlimited uchun yetarli.", "Средств достаточно для Unlimited.")
                      : t(`Yana ${money(Math.max(0, status.plan_price_amount - (wallet?.balance || 0)))} kerak.`, `Нужно ещё ${money(Math.max(0, status.plan_price_amount - (wallet?.balance || 0)))}.`)}</p>
                  </div>
                  <button type="button" onClick={payFromWallet} disabled={!walletEnough || walletPaying} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
                    {walletPaying ? t("Faollashtirilmoqda…", "Активируем…") : t(`${money(status.plan_price_amount)} — balansdan to‘lash`, `${money(status.plan_price_amount)} — оплатить с баланса`)}
                  </button>
                </div>
                {!walletEnough && <Link href="/billing" className="mt-3 inline-flex text-sm font-semibold text-blue-700 hover:underline">{t("Balansni to‘ldirish →", "Пополнить баланс →")}</Link>}
              </div>

              <div className="rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-5 text-sm leading-6 text-slate-600">
                <p>{t("Yoki tarifni Click orqali to‘lab avtomatik faollashtirishingiz mumkin.", "Либо оплатите тариф через Click для автоматической активации.")}</p>
                <button type="button" onClick={payWithClick} disabled={paying} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {paying ? t("Click ochilmoqda…", "Открываем Click…") : t(`${money(status.plan_price_amount, status.currency)} — Click orqali to‘lash`, `${money(status.plan_price_amount, status.currency)} — оплатить через Click`)}
                </button>
              </div>
            </> : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">{t("Oylik Unlimited tarifining narxi hali administrator tomonidan yoqilmagan.", "Цена тарифа Monthly Unlimited пока не активирована администратором.")}</div>}
          </div>}

          {walletMessage && <p role="status" className="mt-4 rounded-xl bg-emerald-100 px-4 py-3 text-sm font-semibold text-emerald-800">{walletMessage}</p>}
          {paymentError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{paymentError}</p>}
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
