"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAgent, type AgentRecord } from "@/app/agents/agents-api";
import {
  declineOwnRequestTarget,
  getOwnRequestTarget,
  listRequestTargets,
  markOwnRequestTargetViewed,
  type RequestTargetRecord,
} from "@/app/requests/request-targeting-api";
import { subscribeToRequestTargets } from "@/lib/supabase-realtime";
import { useUiSettings } from "@/lib/ui-settings";

const STATUS_LABELS: Record<string, { uz: string; ru: string }> = {
  matched: { uz: "Mos keldi", ru: "Подобран" },
  notified: { uz: "Xabar yuborildi", ru: "Уведомлён" },
  viewed: { uz: "Ko‘rildi", ru: "Просмотрен" },
  responded: { uz: "Javob berdi", ru: "Ответил" },
  declined: { uz: "Rad etdi", ru: "Отклонил" },
};

const TYPE_LABELS: Record<string, { uz: string; ru: string }> = {
  aviation: { uz: "aviakassa", ru: "авиакасса" },
  travel_agent: { uz: "turagent", ru: "турагент" },
  tour_operator: { uz: "turoperator", ru: "туроператор" },
  hotel: { uz: "mehmonxona", ru: "отель" },
  transport: { uz: "transport", ru: "транспорт" },
  guide: { uz: "gid", ru: "гид" },
  restaurant: { uz: "restoran", ru: "ресторан" },
  visa: { uz: "viza xizmati", ru: "визовые услуги" },
  other: { uz: "boshqa xizmat", ru: "другая услуга" },
};

const tr = (isRu: boolean, uz: string, ru: string) => isRu ? ru : uz;
const statusLabel = (status: string, isRu: boolean) => STATUS_LABELS[status] ? (isRu ? STATUS_LABELS[status].ru : STATUS_LABELS[status].uz) : status;

function agentTypeLabel(value: string | null, isRu: boolean) {
  if (!value) return tr(isRu, "Hamkor", "Партнёр");
  const label = TYPE_LABELS[value];
  return label ? (isRu ? label.ru : label.uz) : value;
}

function reasonText(target: RequestTargetRecord, isRu: boolean) {
  const reason = target.match_reason || {};
  const parts: string[] = [];
  if (reason.capability_type) {
    const label = TYPE_LABELS[reason.capability_type];
    parts.push(label ? (isRu ? label.ru : label.uz) : reason.capability_type);
  }
  if (reason.city) parts.push(reason.city);
  if (reason.verified) parts.push(tr(isRu, "tasdiqlangan profil", "проверенный профиль"));
  if (reason.capacity != null && reason.pax != null && Number(reason.capacity) >= Number(reason.pax)) parts.push(tr(isRu, "sig‘im mos", "вместимость подходит"));
  if (target.distance_km != null) parts.push(`${Number(target.distance_km).toLocaleString(isRu ? "ru-RU" : "uz-UZ", { maximumFractionDigits: 1 })} km`);
  return parts.length ? parts.join(" · ") : tr(isRu, "Xizmat turi va so‘rov parametrlariga mos", "Соответствует типу услуги и параметрам запроса");
}

type ErrorCode = "load" | "decline" | "";
type FunnelStage = "matched" | "notified" | "viewed" | "responded" | "declined";

function targetsForStage(targets: RequestTargetRecord[], stage: FunnelStage | null) {
  if (!stage || stage === "matched") return targets;
  if (stage === "notified") return targets.filter((target) => ["notified", "viewed", "responded"].includes(target.status));
  if (stage === "viewed") return targets.filter((target) => ["viewed", "responded"].includes(target.status));
  return targets.filter((target) => target.status === stage);
}

export default function RequestTargetingSummary({ requestId, isOwner, distributionMode = "targeted" }: { requestId: string; isOwner: boolean; distributionMode?: "targeted" | "broadcast" }) {
  const router = useRouter();
  const { isRu } = useUiSettings();
  const isTargeted = distributionMode === "targeted";
  const [targets, setTargets] = useState<RequestTargetRecord[]>([]);
  const [ownTarget, setOwnTarget] = useState<RequestTargetRecord | null>(null);
  const [loading, setLoading] = useState(isTargeted);
  const [refreshing, setRefreshing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState<ErrorCode>("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [selectedStage, setSelectedStage] = useState<FunnelStage | null>(null);
  const [profiles, setProfiles] = useState<Record<string, AgentRecord | null>>({});

  useEffect(() => {
    if (!isTargeted) return;
    let active = true;
    const task = isOwner
      ? listRequestTargets(requestId)
      : markOwnRequestTargetViewed(requestId).catch(() => false).then(() => getOwnRequestTarget(requestId));
    Promise.resolve(task)
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data)) {
          setTargets(data);
          setLastUpdatedAt(new Date());
        } else setOwnTarget(data);
        setError("");
      })
      .catch(() => { if (active) setError("load"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOwner, isTargeted, requestId]);

  const refreshOwner = useCallback(async (showSpinner = true, showError = true) => {
    if (!isOwner) return;
    if (showSpinner) setRefreshing(true);
    if (showError) setError("");
    try {
      setTargets(await listRequestTargets(requestId));
      setLastUpdatedAt(new Date());
      setError("");
    } catch {
      if (showError) setError("load");
    } finally {
      if (showSpinner) setRefreshing(false);
    }
  }, [isOwner, requestId]);

  useEffect(() => {
    if (!isTargeted || !isOwner) return;
    let debounceTimer: number | undefined;
    const scheduleRefresh = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => { void refreshOwner(false, false); }, 150);
    };
    const subscription = subscribeToRequestTargets(requestId, scheduleRefresh);
    const onOnline = () => scheduleRefresh();
    const onVisibility = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    const fallbackInterval = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) scheduleRefresh();
    }, 180_000);
    return () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.clearInterval(fallbackInterval);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      if (subscription) void subscription.client.removeChannel(subscription.channel);
    };
  }, [isOwner, isTargeted, refreshOwner, requestId]);

  async function decline() {
    if (!ownTarget || declining || ownTarget.status === "responded" || ownTarget.status === "declined") return;
    if (!window.confirm(tr(isRu, "Bu so‘rov sizga mos emasligini tasdiqlaysizmi? U Geo Tender ro‘yxatingizdan chiqadi.", "Подтвердить, что этот запрос вам не подходит? Он исчезнет из вашего списка Geo Tender."))) return;
    setDeclining(true);
    setError("");
    try {
      const declined = await declineOwnRequestTarget(requestId);
      if (!declined) throw new Error("TARGET_NOT_DECLINED");
      router.replace("/requests?tab=market");
      router.refresh();
    } catch {
      setError("decline");
      setDeclining(false);
    }
  }

  const funnel = useMemo(() => {
    const total = targets.length;
    const notified = targets.filter((target) => ["notified", "viewed", "responded"].includes(target.status)).length;
    const viewed = targets.filter((target) => ["viewed", "responded"].includes(target.status)).length;
    const responded = targets.filter((target) => target.status === "responded").length;
    const declined = targets.filter((target) => target.status === "declined").length;
    return { total, notified, viewed, responded, declined };
  }, [targets]);

  const visibleStageTargets = useMemo(() => targetsForStage(targets, selectedStage), [targets, selectedStage]);
  const missingProfileIds = useMemo(() => selectedStage ? [...new Set(visibleStageTargets.map((target) => target.profile_id))].filter((id) => !(id in profiles)) : [], [profiles, selectedStage, visibleStageTargets]);
  const profilesLoading = Boolean(selectedStage && missingProfileIds.length);

  useEffect(() => {
    if (!isOwner || !selectedStage || !missingProfileIds.length) return;
    let active = true;
    Promise.all(missingProfileIds.map(async (id) => [id, await getAgent(id).catch(() => null)] as const))
      .then((rows) => {
        if (!active) return;
        setProfiles((current) => ({ ...current, ...Object.fromEntries(rows) }));
      });
    return () => { active = false; };
  }, [isOwner, missingProfileIds, selectedStage]);

  const lastUpdatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(lastUpdatedAt)
    : "";
  const errorText = error === "load"
    ? tr(isRu, "Geo Tender matching holatini yuklab bo‘lmadi.", "Не удалось загрузить состояние подбора Geo Tender.")
    : error === "decline"
      ? tr(isRu, "So‘rovni rad etib bo‘lmadi. Qayta urinib ko‘ring.", "Не удалось отклонить запрос. Попробуйте ещё раз.")
      : "";

  if (!isTargeted) return null;
  if (loading) return <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-100" />;
  if (error && !ownTarget && !isOwner) return <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</p>;

  if (!isOwner) {
    if (!ownTarget) return null;
    return <section className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Geo Tender</p><h2 className="mt-2 text-lg font-semibold text-[#0b1f3a]">{tr(isRu, "Sizga mos so‘rov", "Подходящий вам запрос")}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{reasonText(ownTarget, isRu)}</p></div>
        <div className="flex flex-wrap gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800">{tr(isRu, "Moslik", "Совпадение")}: {ownTarget.match_score}</span><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{statusLabel(ownTarget.status, isRu)}</span></div>
      </div>
      {errorText && <p role="alert" className="mt-4 text-sm text-red-700">{errorText}</p>}
      {ownTarget.status !== "responded" && ownTarget.status !== "declined" && <div className="mt-5 border-t border-cyan-200 pt-4"><button type="button" onClick={() => void decline()} disabled={declining} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-red-300 hover:text-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:opacity-50">{declining ? tr(isRu, "Rad etilmoqda...", "Отклонение...") : tr(isRu, "So‘rov mos emas", "Запрос не подходит")}</button></div>}
    </section>;
  }

  const stages: Array<{ id: FunnelStage; count: number; labelUz: string; labelRu: string; className: string; numberClassName: string }> = [
    { id: "matched", count: funnel.total, labelUz: "Mos hamkor", labelRu: "Подобрано", className: "bg-slate-50 hover:bg-slate-100", numberClassName: "text-[#0b1f3a]" },
    { id: "notified", count: funnel.notified, labelUz: "Xabar yuborildi", labelRu: "Уведомлено", className: "bg-blue-50 hover:bg-blue-100", numberClassName: "text-blue-800" },
    { id: "viewed", count: funnel.viewed, labelUz: "Ko‘rildi", labelRu: "Просмотрено", className: "bg-amber-50 hover:bg-amber-100", numberClassName: "text-amber-800" },
    { id: "responded", count: funnel.responded, labelUz: "Javob berdi", labelRu: "Ответило", className: "bg-emerald-50 hover:bg-emerald-100", numberClassName: "text-emerald-800" },
    { id: "declined", count: funnel.declined, labelUz: "Rad etdi", labelRu: "Отклонило", className: "bg-rose-50 hover:bg-rose-100", numberClassName: "text-rose-800" },
  ];

  return <section className="mt-8 rounded-3xl border border-cyan-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{tr(isRu, "Geo Tender tarqatish", "Распределение Geo Tender")}</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{tr(isRu, "Mos hamkorlar voronkasi", "Воронка подходящих партнёров")}</h2><p className="mt-2 text-sm text-slate-500">{tr(isRu, "Har bir bosqichni bosing — shu bosqichdagi hamkorlar kimligi va nima uchun mos kelgani ko‘rinadi.", "Нажмите на этап — увидите партнёров на этом этапе и почему они подошли.")}</p><p className="mt-2 text-xs font-medium text-emerald-700">● {tr(isRu, "Avtomatik yangilanadi", "Обновляется автоматически")}{lastUpdatedLabel ? ` · ${tr(isRu, "so‘nggi", "последнее")}: ${lastUpdatedLabel}` : ""}</p></div>
      <div className="flex flex-wrap items-center gap-2"><span className="w-fit rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">Targeted</span><button type="button" onClick={() => void refreshOwner()} disabled={refreshing} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-800 disabled:opacity-50">{refreshing ? tr(isRu, "Yangilanmoqda...", "Обновление...") : tr(isRu, "Yangilash", "Обновить")}</button></div>
    </div>

    {errorText && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</p>}

    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      {stages.map((stage) => <button key={stage.id} type="button" onClick={() => setSelectedStage((current) => current === stage.id ? null : stage.id)} aria-expanded={selectedStage === stage.id} className={`rounded-2xl p-4 text-left transition focus:outline-none focus:ring-4 focus:ring-cyan-100 ${stage.className} ${selectedStage === stage.id ? "ring-2 ring-cyan-400" : ""}`}><p className={`text-2xl font-semibold ${stage.numberClassName}`}>{stage.count}</p><p className="mt-1 text-xs font-semibold text-slate-600">{tr(isRu, stage.labelUz, stage.labelRu)}</p><p className="mt-2 text-[11px] text-slate-400">{tr(isRu, "Bosib hamkorlarni ko‘ring", "Нажмите, чтобы увидеть партнёров")}</p></button>)}
    </div>

    {selectedStage && <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Hamkorlar ro‘yxati", "Список партнёров")}</p><p className="mt-1 text-xs text-slate-500">{statusLabel(selectedStage, isRu)} · {visibleStageTargets.length} {tr(isRu, "ta hamkor", "партнёров")}</p></div><button type="button" onClick={() => setSelectedStage(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-white">{tr(isRu, "Yopish", "Закрыть")}</button></div>
      {profilesLoading && <div className="mt-4 h-20 animate-pulse rounded-xl bg-white" />}
      {!profilesLoading && visibleStageTargets.length > 0 && <div className="mt-4 grid gap-3 lg:grid-cols-2">{visibleStageTargets.map((target) => {
        const profile = profiles[target.profile_id];
        return <article key={target.profile_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-[#0b1f3a]">{profile?.full_name || profile?.company_name || tr(isRu, "Hamkor profili", "Профиль партнёра")}</p><p className="mt-1 truncate text-sm text-slate-500">{profile?.company_name || agentTypeLabel(profile?.agent_type || target.match_reason?.capability_type || null, isRu)}{profile?.city ? ` · ${profile.city}` : target.match_reason?.city ? ` · ${target.match_reason.city}` : ""}</p></div><span className="shrink-0 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800">{target.match_score}</span></div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{reasonText(target, isRu)}</p>
          <div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">{statusLabel(target.status, isRu)}</span>{profile?.is_verified && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{tr(isRu, "Tasdiqlangan", "Проверен")}</span>}{profile?.services?.slice(0, 2).map((service) => <span key={service} className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{service}</span>)}</div>
        </article>;
      })}</div>}
      {!visibleStageTargets.length && <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">{tr(isRu, "Bu bosqichda hali hamkor yo‘q.", "На этом этапе пока нет партнёров.")}</p>}
    </div>}

    {!targets.length && <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">{tr(isRu, "Hozircha mos ichki hamkor topilmadi. Supplier profillari to‘ldirilgani sari matching aniqroq bo‘ladi.", "Пока подходящие внутренние партнёры не найдены. Чем полнее профили поставщиков, тем точнее подбор.")}</p>}
  </section>;
}
