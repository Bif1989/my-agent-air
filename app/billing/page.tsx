"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import {
  getBillingSummary,
  getBillingWalletStatus,
  getMyBillingRoles,
  listMyDealFees,
  listMyWalletLedger,
  startClickWalletTopup,
  type BillingSummary,
  type BillingWalletLedgerRecord,
  type BillingWalletStatus,
  type DealFeeRecord,
} from "@/app/billing/billing-api";
import { BILLING_ROLE_DEFINITIONS, normalizeBillingRole, type BillingRoleOption } from "@/lib/billing-roles";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

const TOPUP_PRESETS = [20_000, 50_000, 100_000] as const;

function money(value: number, currency = "UZS") {
  return `${Number(value || 0).toLocaleString("uz-UZ")} ${currency}`;
}

function formatDate(value: string, isRu: boolean) {
  return new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(value: string, isRu: boolean) {
  const role = normalizeBillingRole(value);
  return isRu ? BILLING_ROLE_DEFINITIONS[role].ru : BILLING_ROLE_DEFINITIONS[role].uz;
}

function routeTitle(fee: DealFeeRecord, isRu: boolean) {
  const request = fee.deal?.request;
  if (!request) return isRu ? "Сделка" : "Bitim";
  const route = [request.origin, request.destination].filter(Boolean).join(" → ");
  return route || request.category || (isRu ? "Сделка" : "Bitim");
}

function ledgerLabel(item: BillingWalletLedgerRecord, isRu: boolean) {
  const labels: Record<BillingWalletLedgerRecord["kind"], [string, string]> = {
    click_topup: ["Click orqali balans to‘ldirish", "Пополнение баланса через Click"],
    deal_charge: ["Bitim komissiyasi", "Комиссия за сделку"],
    refund: ["Qaytarish", "Возврат"],
    admin_credit: ["Balansga qo‘shildi", "Зачисление на баланс"],
    admin_debit: ["Balansdan yechildi", "Списание с баланса"],
  };
  return isRu ? labels[item.kind][1] : labels[item.kind][0];
}

export default function BillingPage() {
  const { isRu } = useUiSettings();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [wallet, setWallet] = useState<BillingWalletStatus | null>(null);
  const [fees, setFees] = useState<DealFeeRecord[]>([]);
  const [ledger, setLedger] = useState<BillingWalletLedgerRecord[]>([]);
  const [roles, setRoles] = useState<BillingRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [topupAmount, setTopupAmount] = useState(50_000);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupError, setTopupError] = useState("");
  const [paymentReturned, setPaymentReturned] = useState(false);

  const t = (uz: string, ru: string) => isRu ? ru : uz;

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const params = new URLSearchParams(window.location.search);
    const timeoutId = window.setTimeout(() => {
      setSession(stored);
      setPaymentReturned(params.get("payment") === "click");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [nextSummary, nextWallet, nextFees, nextLedger, nextRoles] = await Promise.all([
          getBillingSummary(),
          getBillingWalletStatus(),
          listMyDealFees(),
          listMyWalletLedger(),
          getMyBillingRoles(),
        ]);
        if (!active) return;
        setSummary(nextSummary);
        setWallet(nextWallet);
        setFees(nextFees);
        setLedger(nextLedger);
        setRoles(nextRoles);
        if (nextWallet?.topup_min && topupAmount < nextWallet.topup_min) setTopupAmount(nextWallet.topup_min);
      } catch (loadError: unknown) {
        if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) {
          window.location.replace("/login");
          return;
        }
        if (active) setError(t("Hisob ma’lumotlarini yuklab bo‘lmadi.", "Не удалось загрузить данные оплаты."));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  // topupAmount intentionally excluded: loading must not repeat while typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isRu]);

  const progress = useMemo(() => {
    if (!wallet || wallet.free_limit <= 0) return 100;
    return Math.min(100, Math.round((Math.min(wallet.completed_count, wallet.free_limit) / wallet.free_limit) * 100));
  }, [wallet]);

  const lowBalance = Boolean(
    wallet?.wallet_mode_enabled &&
    wallet.free_remaining === 0 &&
    !wallet.subscription_active &&
    wallet.balance < wallet.low_balance_warning,
  );

  async function topUp(amount = topupAmount) {
    if (!wallet?.wallet_mode_enabled || topupBusy) return;
    setTopupError("");
    if (!Number.isSafeInteger(amount) || amount < wallet.topup_min || amount > wallet.topup_max) {
      setTopupError(t(`Summani ${money(wallet.topup_min)} dan ${money(wallet.topup_max)} gacha kiriting.`, `Введите сумму от ${money(wallet.topup_min)} до ${money(wallet.topup_max)}.`));
      return;
    }
    setTopupBusy(true);
    try {
      const result = await startClickWalletTopup(amount);
      window.location.assign(result.paymentUrl);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : "";
      if (message.startsWith("TOPUP_RANGE:")) {
        const [, min, max] = message.split(":");
        setTopupError(t(`Summa ${money(Number(min))}–${money(Number(max))} oralig‘ida bo‘lsin.`, `Сумма должна быть от ${money(Number(min))} до ${money(Number(max))}.`));
      } else if (message === "WALLET_MODE_DISABLED") {
        setTopupError(t("Balans rejimi hali ishga tushirilmagan.", "Баланс ещё не запущен."));
      } else if (message === "CLICK_UNAVAILABLE") {
        setTopupError(t("Click orqali to‘lov vaqtincha mavjud emas.", "Оплата через Click временно недоступна."));
      } else if (message === "AUTH_SESSION_EXPIRED") {
        window.location.replace("/login");
      } else {
        setTopupError(t("To‘lov sahifasini ochib bo‘lmadi. Qayta urinib ko‘ring.", "Не удалось открыть оплату. Попробуйте ещё раз."));
      }
    } finally {
      setTopupBusy(false);
    }
  }

  return <AppShell session={session} activePath="/deals">
    <div className="mx-auto max-w-6xl pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{t("TO‘LOVLAR", "ОПЛАТА")}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">{t("Balans va tarif", "Баланс и тариф")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            {wallet?.wallet_mode_enabled
              ? t("Har bir akkauntga jami 5 ta bepul yakunlangan bitim beriladi. Keyingi bitimlar o‘sha bitimdagi xizmat roli bo‘yicha balansdan avtomatik yechiladi.", "Каждому аккаунту даётся всего 5 бесплатных завершённых сделок. Затем комиссия автоматически списывается с баланса по роли в конкретной сделке.")
              : t("Yangi balans tizimi tayyorlanmoqda. Hozirgi tarif qoidalari vaqtincha o‘zgarishsiz ishlaydi.", "Новая система баланса готовится. Текущие тарифные правила пока работают без изменений.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/billing/subscription" className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">♾ {t("Unlimited — 99 000 UZS", "Unlimited — 99 000 UZS")}</Link>
          <Link href="/deals" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300">← {t("Bitimlar", "Сделки")}</Link>
        </div>
      </div>

      {paymentReturned && <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">
        <p className="font-semibold">{t("Click to‘lov sahifasidan qaytdingiz.", "Вы вернулись со страницы Click.")}</p>
        <p className="mt-1">{t("Muvaffaqiyatli to‘lov callback tasdiqlangach balans avtomatik yangilanadi. Sahifani yangilasangiz yangi balans ko‘rinadi.", "После подтверждения callback успешная оплата автоматически появится на балансе. Обновите страницу, чтобы увидеть новый баланс.")}</p>
      </div>}

      {loading && <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-32 animate-pulse rounded-3xl bg-slate-200" />)}</div>}
      {error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

      {!loading && wallet && summary && <>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <section className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Balans", "Баланс")}</p>
            <p className="mt-2 text-3xl font-semibold text-blue-700">{money(wallet.balance)}</p>
            <p className="mt-1 text-sm text-slate-500">{wallet.subscription_active ? t("Unlimited faol", "Unlimited активен") : t("Umumiy hamyon", "Общий кошелёк")}</p>
          </section>
          <section className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Bepul qoldi", "Осталось бесплатно")}</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{wallet.free_remaining}</p>
            <p className="mt-1 text-sm text-slate-500">{t(`${wallet.free_limit} ta bir martalik limitdan`, `из ${wallet.free_limit} разовых бесплатных`)}</p>
          </section>
          <section className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Yakunlangan", "Завершено")}</p>
            <p className="mt-2 text-3xl font-semibold text-violet-700">{wallet.completed_count}</p>
            <p className="mt-1 text-sm text-slate-500">{t("jami bitim", "всего сделок")}</p>
          </section>
          <section className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Unlimited</p>
            <p className={`mt-2 text-2xl font-semibold ${wallet.subscription_active ? "text-emerald-700" : "text-amber-700"}`}>{wallet.subscription_active ? t("Faol", "Активен") : t("Faol emas", "Не активен")}</p>
            <p className="mt-1 text-sm text-slate-500">99 000 UZS / 30 {t("kun", "дней")}</p>
          </section>
        </div>

        {lowBalance && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <p className="font-semibold">⚠️ {t("Balansingiz kamaygan", "Баланс заканчивается")}: {money(wallet.balance)}</p>
          <p className="mt-1">{t("Bepul bitimlaringiz tugagan. Keyingi pullik bitimni yakunlashdan oldin balansni to‘ldiring.", "Бесплатные сделки закончились. Пополните баланс до завершения следующей платной сделки.")}</p>
        </div>}

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("BALANSNI TO‘LDIRISH", "ПОПОЛНЕНИЕ БАЛАНСА")}</p>
              <h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Click orqali</h2>
              <p className="mt-2 text-sm text-slate-500">{t("Pul balansga tushadi va pullik bitim yakunlanganda komissiya avtomatik yechiladi.", "Деньги поступают на баланс, а комиссия автоматически списывается при завершении платной сделки.")}</p>
            </div>
            {!wallet.wallet_mode_enabled && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">{t("Hali yoqilmagan", "Пока выключено")}</span>}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {TOPUP_PRESETS.map((amount) => <button key={amount} type="button" disabled={!wallet.wallet_mode_enabled || topupBusy} onClick={() => { setTopupAmount(amount); void topUp(amount); }} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50">+{money(amount)}</button>)}
          </div>
          <div className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row">
            <label className="flex-1 text-sm font-semibold text-slate-700">
              {t("Boshqa summa", "Другая сумма")}
              <input type="number" min={wallet.topup_min} max={wallet.topup_max} step="1000" value={topupAmount} onChange={(event) => setTopupAmount(Number(event.target.value))} disabled={!wallet.wallet_mode_enabled || topupBusy} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100" />
            </label>
            <button type="button" disabled={!wallet.wallet_mode_enabled || topupBusy} onClick={() => void topUp()} className="self-end rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{topupBusy ? t("Ochilmoqda...", "Открываем...") : t("💳 Click bilan to‘ldirish", "💳 Пополнить через Click")}</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t(`Minimal summa: ${money(wallet.topup_min)}.`, `Минимальная сумма: ${money(wallet.topup_min)}.`)}</p>
          {topupError && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{topupError}</p>}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("BEPUL START", "БЕСПЛАТНЫЙ СТАРТ")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{Math.min(wallet.completed_count, wallet.free_limit)} / {wallet.free_limit}</h2></div>
            <p className="text-sm font-semibold text-slate-600">{wallet.free_remaining > 0 ? t(`Yana ${wallet.free_remaining} ta bitim bepul`, `Ещё ${wallet.free_remaining} сделок бесплатно`) : t("5 ta bepul imkoniyat ishlatildi", "5 бесплатных сделок использованы")}</p>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} /></div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t("Bu limit har oy yangilanmaydi: akkauntga bir marta beriladi. Faqat “Yakunlangan” bitimlar hisoblanadi.", "Лимит не обновляется ежемесячно: он выдаётся аккаунту один раз. Учитываются только завершённые сделки.")}</p>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("SIZNING YO‘NALISHLARINGIZ", "ВАШИ НАПРАВЛЕНИЯ")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("Bitimdagi rol bo‘yicha komissiya", "Комиссия по роли в сделке")}</h2></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roles.map((role) => <div key={role.role} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[#0b1f3a]">{isRu ? role.ru : role.uz}</p>{role.isPrimary && <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold uppercase text-blue-700">{t("Asosiy", "Основной")}</span>}</div>
              <p className="mt-1 text-lg font-bold text-blue-700">{money(role.fee)} / {t("bitim", "сделка")}</p>
            </div>)}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">{t("Bir akkaunt bir nechta yo‘nalishda ishlashi mumkin. So‘rov yoki taklif yuborishda tanlangan rol bitimda saqlanadi; keyingi komissiya aynan shu rol bo‘yicha hisoblanadi.", "Один аккаунт может работать в нескольких направлениях. Выбранная при запросе или предложении роль фиксируется в сделке, и комиссия рассчитывается именно по ней.")}</p>
        </section>

        {summary.outstanding_amount > 0 && <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">{t("OLDINGI HISOB", "ПРЕЖНИЕ НАЧИСЛЕНИЯ")}</p>
          <h2 className="mt-2 text-xl font-semibold text-amber-900">{money(summary.outstanding_amount)}</h2>
          <p className="mt-2 text-sm text-amber-800">{t("Bu yangi wallet tizimidan oldin yozilgan eski to‘lanmagan komissiya. Yangi bitimlar qarzga yozilmaydi: balans yetmasa yakunlash bloklanadi.", "Это старое неоплаченное начисление до запуска кошелька. Новые сделки не будут уходить в долг: при нехватке баланса завершение будет заблокировано.")}</p>
        </section>}

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("BALANS TARIXI", "ИСТОРИЯ БАЛАНСА")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("Kirim va yechimlar", "Пополнения и списания")}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{ledger.length}</span></div>
          {ledger.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{t("Hozircha balans operatsiyalari yo‘q.", "Операций по балансу пока нет.")}</div> : <div className="mt-5 space-y-3">{ledger.map((item) => <article key={item.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            <div><p className="font-semibold text-[#0b1f3a]">{ledgerLabel(item, isRu)}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.created_at, isRu)}</p></div>
            <div className="text-left sm:text-right"><p className={`text-lg font-bold ${item.amount_delta > 0 ? "text-emerald-700" : "text-rose-700"}`}>{item.amount_delta > 0 ? "+" : ""}{money(item.amount_delta)}</p><p className="mt-1 text-xs text-slate-500">{t("Qoldiq", "Остаток")}: {money(item.balance_after)}</p></div>
          </article>)}</div>}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("BITIM HISOBI", "ИСТОРИЯ СДЕЛОК")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("Yakunlangan bitimlar", "Завершённые сделки")}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{fees.length}</span></div>
          {fees.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{t("Hozircha hisob yozuvlari yo‘q.", "Пока начислений нет.")}</div> : <div className="mt-5 space-y-3">{fees.map((fee) => {
            const free = fee.status === "free";
            const paid = fee.status === "paid";
            const statusText = free ? t("Bepul", "Бесплатно") : paid ? t("To‘langan", "Оплачено") : fee.status === "waived" ? t("Hisobdan chiqarilgan", "Списано") : t("Eski qarz", "Старый долг");
            const statusClass = free ? "bg-emerald-50 text-emerald-700" : paid ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
            return <article key={fee.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-semibold text-[#0b1f3a]">{routeTitle(fee, isRu)}</p><p className="mt-1 text-xs text-slate-500">#{fee.lifetime_sequence} · {roleLabel(fee.role_snapshot, isRu)} · {formatDate(fee.deal_completed_at, isRu)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>{statusText}</span><span className="font-bold text-[#0b1f3a]">{money(fee.fee_amount)}</span></div></div>
            </article>;
          })}</div>}
        </section>
      </>}
    </div>
  </AppShell>;
}
