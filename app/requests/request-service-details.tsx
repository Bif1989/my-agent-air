"use client";

import { useEffect, useState } from "react";
import { daysBetween, hasAirTravel, hydrateServiceRequest, isCalendarDate, localize, requestBudget, serviceDefinition, serviceDetailEntries, type ServiceRequestInput } from "@/lib/service-request";
import { getStoredSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

type TargetableRequest = ServiceRequestInput & {
  created_by?: string;
  distribution_mode?: "targeted" | "broadcast";
};

function dateLabel(value: string | null | undefined, isRu: boolean) {
  return isCalendarDate(value) ? new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : value || "—";
}

export default function RequestServiceDetails({ request, compact = false }: { request: ServiceRequestInput; compact?: boolean }) {
  const { isRu } = useUiSettings();
  const [viewerId, setViewerId] = useState("");
  const data = hydrateServiceRequest(request);
  const definition = serviceDefinition(data.category);
  const tr = (uz: string, ru: string) => isRu ? ru : uz;
  const details = serviceDetailEntries(data, isRu).filter((item) => item.key !== "budget_basis").map((item) => ({ ...item, value: /^(check_out|return_date)$/.test(item.key) ? dateLabel(item.value, isRu) : item.value }));
  const nights = data.category === "Mehmonxona" ? daysBetween(data.travel_date, data.service_details.check_out) : null;
  if (nights != null && nights > 0) details.splice(2, 0, { key: "nights", label: tr("Tunlar soni", "Количество ночей"), value: String(nights) });
  const passengers = `${data.adults ?? "—"} ${tr("kattalar", "взр.")} · ${data.children ?? 0} ${tr("bolalar", "дети")} · ${data.infants ?? 0} ${tr("go‘daklar", "млад.")}`;
  const rows = compact ? details.slice(0, 3) : [
    { key: "travel_date", label: definition ? localize(definition.date, isRu) : tr("Sana", "Дата"), value: dateLabel(data.travel_date, isRu) },
    { key: "passengers", label: tr("Ishtirokchilar", "Участники"), value: passengers },
    ...details,
    ...(hasAirTravel(data) && data.baggage ? [{ key: "baggage", label: tr("Bagaj", "Багаж"), value: data.baggage }] : []),
    { key: "budget", label: tr("Budjet", "Бюджет"), value: requestBudget(data, isRu) },
  ];
  const targetable = request as TargetableRequest;
  const isMatchedTarget = Boolean(viewerId && targetable.created_by && viewerId !== targetable.created_by && targetable.distribution_mode === "targeted");

  useEffect(() => {
    const session = getStoredSession();
    setViewerId(session?.user.id || "");
  }, []);

  return <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-700">
    {isMatchedTarget && <div className="mb-4 flex items-center gap-2"><span className="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">{tr("Geo Tender · Sizga mos so‘rov", "Geo Tender · Подходящий вам запрос")}</span></div>}
    {compact && <div className="mb-4 flex flex-wrap justify-between gap-3 text-sm"><p className="text-slate-500 dark:text-slate-400">{passengers}</p><p className="font-semibold text-[#0b1f3a] dark:text-slate-100">{requestBudget(data, isRu)}</p></div>}
    <dl className={`grid gap-4 ${compact ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>{rows.map((item) => <div key={item.key} className="min-w-0"><dt className="text-xs text-slate-500 dark:text-slate-400">{item.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-[#0b1f3a] dark:text-slate-100">{item.value}</dd></div>)}</dl>
    {!compact && data.description && <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-700"><h3 className="text-sm font-semibold text-[#0b1f3a] dark:text-slate-100">{tr("Qo‘shimcha ma’lumot", "Дополнительная информация")}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600 dark:text-slate-300">{data.description}</p></div>}
  </div>;
}
