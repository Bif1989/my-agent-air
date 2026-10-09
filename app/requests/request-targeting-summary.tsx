"use client";

import { useEffect, useMemo, useState } from "react";
import { getOwnRequestTarget, listRequestTargets, markOwnRequestTargetViewed, type RequestTargetRecord } from "@/app/requests/request-targeting-api";

const STATUS_LABELS: Record<string, string> = {
  matched: "Mos keldi",
  notified: "Xabar yuborildi",
  viewed: "Ko‘rildi",
  responded: "Javob berdi",
  declined: "Rad etdi",
};

const TYPE_LABELS: Record<string, string> = {
  aviation: "aviakassa",
  travel_agent: "turagent",
  tour_operator: "turoperator",
  hotel: "mehmonxona",
  transport: "transport",
  guide: "gid",
  restaurant: "restoran",
  visa: "viza xizmati",
  other: "boshqa xizmat",
};

function reasonText(target: RequestTargetRecord) {
  const reason = target.match_reason || {};
  const parts: string[] = [];
  if (reason.capability_type) parts.push(TYPE_LABELS[reason.capability_type] || reason.capability_type);
  if (reason.city) parts.push(reason.city);
  if (reason.verified) parts.push("tasdiqlangan profil");
  if (reason.capacity != null && reason.pax != null && Number(reason.capacity) >= Number(reason.pax)) parts.push("sig‘im mos");
  if (target.distance_km != null) parts.push(`${Number(target.distance_km).toLocaleString("uz-UZ", { maximumFractionDigits: 1 })} km`);
  return parts.length ? parts.join(" · ") : "Xizmat turi va so‘rov parametrlariga mos";
}

export default function RequestTargetingSummary({ requestId, isOwner, distributionMode = "targeted" }: { requestId: string; isOwner: boolean; distributionMode?: "targeted" | "broadcast" }) {
  const isTargeted = distributionMode === "targeted";
  const [targets, setTargets] = useState<RequestTargetRecord[]>([]);
  const [ownTarget, setOwnTarget] = useState<RequestTargetRecord | null>(null);
  const [loading, setLoading] = useState(isTargeted);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isTargeted) return;
    let active = true;
    const task = isOwner
      ? listRequestTargets(requestId)
      : markOwnRequestTargetViewed(requestId).catch(() => false).then(() => getOwnRequestTarget(requestId));
    Promise.resolve(task)
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data)) setTargets(data);
        else setOwnTarget(data);
      })
      .catch(() => { if (active) setError("Geo Tender matching holatini yuklab bo‘lmadi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isOwner, isTargeted, requestId]);

  const funnel = useMemo(() => {
    const total = targets.length;
    const notified = targets.filter((target) => ["notified", "viewed", "responded"].includes(target.status)).length;
    const viewed = targets.filter((target) => ["viewed", "responded"].includes(target.status)).length;
    const responded = targets.filter((target) => target.status === "responded").length;
    const declined = targets.filter((target) => target.status === "declined").length;
    return { total, notified, viewed, responded, declined };
  }, [targets]);

  if (!isTargeted) return null;
  if (loading) return <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-100" />;
  if (error) return <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;

  if (!isOwner) {
    if (!ownTarget) return null;
    return <section className="mt-6 rounded-2xl border border-cyan-200 bg-cyan-50 p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Geo Tender</p><h2 className="mt-2 text-lg font-semibold text-[#0b1f3a]">Sizga mos so‘rov</h2><p className="mt-2 text-sm leading-6 text-slate-600">{reasonText(ownTarget)}</p></div>
        <div className="flex gap-2"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-cyan-800">Moslik: {ownTarget.match_score}</span><span className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">{STATUS_LABELS[ownTarget.status] || ownTarget.status}</span></div>
      </div>
    </section>;
  }

  return <section className="mt-8 rounded-3xl border border-cyan-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Geo Tender tarqatish</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Mos hamkorlar voronkasi</h2><p className="mt-2 text-sm text-slate-500">So‘rov avtomatik matching orqali tanlangan ichki hamkorlarga yo‘naltiriladi. Ko‘rish va javob bosqichlari real harakatlardan olinadi.</p></div><span className="w-fit rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">Targeted</span></div>
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="rounded-2xl bg-slate-50 p-4"><p className="text-2xl font-semibold text-[#0b1f3a]">{funnel.total}</p><p className="mt-1 text-xs font-medium text-slate-500">Mos hamkor</p></div>
      <div className="rounded-2xl bg-blue-50 p-4"><p className="text-2xl font-semibold text-blue-800">{funnel.notified}</p><p className="mt-1 text-xs font-medium text-blue-600">Xabar yuborildi</p></div>
      <div className="rounded-2xl bg-amber-50 p-4"><p className="text-2xl font-semibold text-amber-800">{funnel.viewed}</p><p className="mt-1 text-xs font-medium text-amber-600">Ko‘rildi</p></div>
      <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-2xl font-semibold text-emerald-800">{funnel.responded}</p><p className="mt-1 text-xs font-medium text-emerald-600">Javob berdi</p></div>
      <div className="rounded-2xl bg-rose-50 p-4"><p className="text-2xl font-semibold text-rose-800">{funnel.declined}</p><p className="mt-1 text-xs font-medium text-rose-600">Rad etdi</p></div>
    </div>
    {targets.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{targets.slice(0, 8).map((target, index) => <span key={`${target.profile_id}-${index}`} title={reasonText(target)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">#{index + 1} · {target.match_score} ball · {STATUS_LABELS[target.status] || target.status}</span>)}</div>}
    {!targets.length && <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">Hozircha mos ichki hamkor topilmadi. Supplier profillari to‘ldirilgani sari matching aniqroq bo‘ladi.</p>}
  </section>;
}
