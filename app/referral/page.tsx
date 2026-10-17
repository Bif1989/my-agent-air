"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getMyReferralDashboard, type ReferralDashboard } from "@/lib/referral-api";
import { useUiSettings } from "@/lib/ui-settings";

function money(value: number) {
  return `${Number(value || 0).toLocaleString("uz-UZ")} UZS`;
}

function date(value: string, isRu: boolean) {
  return new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", { dateStyle: "medium" }).format(new Date(value));
}

export default function ReferralPage() {
  const { isRu } = useUiSettings();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const t = (uz: string, ru: string) => isRu ? ru : uz;

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const timer = window.setTimeout(() => setSession(stored), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    getMyReferralDashboard()
      .then((next) => { if (active) setDashboard(next); })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.message.includes("AUTH_SESSION")) {
          window.location.replace("/login");
          return;
        }
        if (active) setError(t("Referal ma’lumotlarini yuklab bo‘lmadi.", "Не удалось загрузить реферальные данные."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [session, isRu]);

  const referralUrl = useMemo(() => {
    if (!dashboard?.code || typeof window === "undefined") return "";
    return `${window.location.origin}/register?ref=${encodeURIComponent(dashboard.code)}`;
  }, [dashboard?.code]);

  async function copyLink() {
    if (!referralUrl) return;
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareLink() {
    if (!referralUrl) return;
    if (navigator.share) {
      await navigator.share({ title: "My Agent Air", text: t("My Agent Air platformasiga taklif", "Приглашение в My Agent Air"), url: referralUrl }).catch(() => undefined);
      return;
    }
    await copyLink();
  }

  const levels = dashboard ? [
    { level: 1, amount: 15000, earned: dashboard.level1_bonus, count: dashboard.level1_count, uz: "Siz bevosita taklif qilgan tasdiqlangan kompaniya", ru: "Подтверждённая компания, приглашённая вами напрямую" },
    { level: 2, amount: 10000, earned: dashboard.level2_bonus, count: dashboard.level2_count, uz: "Siz taklif qilgan hamkor taklif qilgan kompaniya", ru: "Компания, приглашённая вашим приглашённым партнёром" },
    { level: 3, amount: 5000, earned: dashboard.level3_bonus, count: dashboard.level3_count, uz: "Ikkinchi bosqichdagi hamkor taklif qilgan kompaniya", ru: "Компания, приглашённая партнёром второго уровня" },
  ] : [];

  return <AppShell session={session} activePath="/profile">
    <div className="mx-auto max-w-6xl pb-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-600">{t("REFERAL DASTURI", "РЕФЕРАЛЬНАЯ ПРОГРАММА")}</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">{t("Hamkor taklif qiling — bonus oling", "Приглашайте партнёров — получайте бонус")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{t("3 bosqichli tizim: 15 000 + 10 000 + 5 000 UZS. Bonus My Agent Air balansiga tushadi.", "Три уровня: 15 000 + 10 000 + 5 000 UZS. Бонус зачисляется на баланс My Agent Air.")}</p>
        </div>
        <Link href="/profile" className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300">← {t("Hisobga qaytish", "Назад к аккаунту")}</Link>
      </div>

      {loading && <div className="mt-7 h-72 animate-pulse rounded-3xl bg-slate-200" />}
      {error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}

      {!loading && dashboard?.ok && <>
        <section className="mt-7 overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-violet-600 to-blue-600 p-6 text-white sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-violet-100">{t("Sizning taklif havolangiz", "Ваша ссылка-приглашение")}</p>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1 rounded-2xl bg-white/10 px-4 py-3 font-mono text-sm break-all">{referralUrl}</div>
              <div className="flex gap-2">
                <button type="button" onClick={copyLink} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-violet-700 transition hover:bg-violet-50">{copied ? t("Nusxalandi ✓", "Скопировано ✓") : t("Nusxalash", "Копировать")}</button>
                <button type="button" onClick={shareLink} className="rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/20">{t("Ulashish", "Поделиться")}</button>
              </div>
            </div>
            <p className="mt-3 text-xs text-violet-100">{t(`Referal kod: ${dashboard.code}`, `Реферальный код: ${dashboard.code}`)}</p>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-3 sm:p-8">
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Jami bonus", "Всего бонусов")}</p><p className="mt-2 text-3xl font-bold text-violet-700">{money(dashboard.total_bonus)}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Bevosita taklif", "Прямые приглашения")}</p><p className="mt-2 text-3xl font-bold text-blue-700">{dashboard.direct_count}</p><p className="mt-1 text-xs text-slate-500">{dashboard.qualified_direct_count} {t("tasdiqlangan", "подтверждено")}</p></div>
            <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t("Tekshiruvda", "На проверке")}</p><p className="mt-2 text-3xl font-bold text-amber-600">{dashboard.pending_direct_count}</p><p className="mt-1 text-xs text-slate-500">{t("bonus hali yozilmagan", "бонус ещё не начислен")}</p></div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-3">
          {levels.map((item) => <article key={item.level} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-lg font-bold text-violet-700">{item.level}</span><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">+{money(item.amount)}</span></div>
            <h2 className="mt-5 text-lg font-semibold text-[#0b1f3a]">{item.level}-{t("bosqich", "уровень")}</h2>
            <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">{isRu ? item.ru : item.uz}</p>
            <div className="mt-5 border-t border-slate-100 pt-4"><p className="text-xs text-slate-400">{t("Siz olgan bonus", "Ваш бонус")}</p><p className="mt-1 text-xl font-bold text-[#0b1f3a]">{money(item.earned)}</p><p className="mt-1 text-xs text-slate-500">{item.count} {t("ta hisoblangan", "начислений")}</p></div>
          </article>)}
        </section>

        <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-7">
          <h2 className="text-lg font-semibold text-amber-900">✓ {t("Bonus faqat real biznes uchun", "Бонус только за реальный бизнес")}</h2>
          <p className="mt-2 text-sm leading-6 text-amber-900">{t("Taklif qilingan foydalanuvchi kompaniya yoki mehmonxona profilini to‘ldirishi va administrator tomonidan tasdiqlanishi kerak. Faqat is_verified + active holatiga o‘tgan haqiqiy biznes uchun bonus avtomatik balansga tushadi. Soxta yoki oddiy bo‘sh akkaunt uchun bonus berilmaydi.", "Приглашённый пользователь должен заполнить профиль компании или отеля и пройти подтверждение администратора. Бонус автоматически зачисляется только за реальный бизнес со статусом is_verified + active. За пустые или фиктивные аккаунты бонус не начисляется.")}</p>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">{t("SIZ TAKLIF QILGANLAR", "ВАШИ ПРИГЛАШЕНИЯ")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{t("Oxirgi hamkorlar", "Последние партнёры")}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{dashboard.direct_count}</span></div>
          {dashboard.recent_direct.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">{t("Hozircha taklif orqali ro‘yxatdan o‘tgan hamkor yo‘q.", "Пока нет партнёров, зарегистрированных по вашей ссылке.")}</div> : <div className="mt-5 space-y-3">{dashboard.recent_direct.map((item, index) => <div key={`${item.created_at}-${index}`} className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold text-[#0b1f3a]">{item.company_name || t("Kompaniya nomi hali kiritilmagan", "Название компании ещё не указано")}</p><p className="mt-1 text-xs text-slate-500">{item.agent_type || "—"} · {date(item.created_at, isRu)}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${item.status === "qualified" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status === "qualified" ? t("Tasdiqlangan", "Подтверждён") : t("Tekshiruvda", "На проверке")}</span></div>)}</div>}
        </section>
      </>}
    </div>
  </AppShell>;
}
