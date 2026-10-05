"use client";

import { type FormEvent, useRef, useState } from "react";
import { useUiSettings } from "@/lib/ui-settings";
import { tashkentDate } from "@/lib/request-freshness";
import { addCalendarDays, cleanServiceData, COMMON_SERVICE_FIELDS, daysBetween, fieldVisible, hydrateServiceRequest, localize, requestIssues, SERVICE_CATEGORIES, SERVICE_DEFINITIONS, serviceDefinition, type RequestIssue, type ServiceField, type ServiceRequestInput } from "@/lib/service-request";
import AviaSmartInput from "@/app/components/avia-smart-input";
import RequestAiFill from "./request-ai-fill";
import type { RequestPayload } from "./requests-api";

type RequestFormProps = { initialValues?: Partial<RequestPayload>; submitLabel: string; submittingLabel: string; onSubmit: (payload: RequestPayload) => Promise<void> };
const fieldId = (key: string) => `request-${key.replaceAll(".", "-")}`;

function initialForm(initial?: Partial<RequestPayload>): ServiceRequestInput {
  return hydrateServiceRequest({ category: "", adults: initial ? undefined : 1, children: 0, infants: 0, currency: initial?.budget && !initial.currency ? "" : "USD", ...initial });
}

export default function RequestForm({ initialValues, submitLabel, submittingLabel, onSubmit }: RequestFormProps) {
  const { isRu } = useUiSettings();
  const [values, setValues] = useState(() => initialForm(initialValues));
  const [issues, setIssues] = useState<RequestIssue[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialValues));
  const [beforeAi, setBeforeAi] = useState<ServiceRequestInput | null>(null);
  const categoryDrafts = useRef<Record<string, ServiceRequestInput>>({});
  const submission = useRef(false);
  const definition = serviceDefinition(values.category);
  const details = values.service_details || {};
  const today = tashkentDate();
  const airBaggage = values.category === "Aviachipta" || values.category === "Tur paket" && details.transport === "flight";
  const tr = (uz: string, ru: string) => isRu ? ru : uz;
  const hasIssue = (key: string) => issues.some((item) => item.field === key);
  const inputClass = (key: string) => `mt-2 w-full min-w-0 rounded-xl border bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 dark:bg-slate-900 dark:text-slate-100 ${hasIssue(key) ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`;
  const labelClass = "min-w-0 text-sm font-semibold text-slate-700 dark:text-slate-200";
  const gridClass = "grid gap-5 sm:grid-cols-2";

  function setValue<K extends keyof ServiceRequestInput>(key: K, value: ServiceRequestInput[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setIssues((current) => current.filter((item) => item.field !== key));
  }
  function setDetail(key: string, value: string) {
    setValues((current) => ({ ...current, service_details: { ...current.service_details, [key]: value } }));
    setIssues((current) => current.filter((item) => item.field !== `service_details.${key}`));
  }
  function changeCategory(category: string) {
    if (values.category) categoryDrafts.current[values.category] = values;
    setValues(categoryDrafts.current[category] || initialForm({ category, adults: values.adults, children: values.children, infants: values.infants, travel_date: values.travel_date }));
    setIssues([]); setError(""); setBeforeAi(null);
  }
  function fieldError(key: string) {
    const issue = issues.find((item) => item.field === key);
    return issue ? <span id={`${fieldId(key)}-error`} className="mt-1 block text-xs font-normal text-red-700 dark:text-red-300">{issue.message}</span> : null;
  }
  function renderDetail(item: ServiceField) {
    if (!fieldVisible(item, details)) return null;
    const key = `service_details.${item.key}`;
    const shared = { id: fieldId(key), value: details[item.key] || "", required: item.required, "aria-invalid": hasIssue(key) || undefined, "aria-describedby": hasIssue(key) ? `${fieldId(key)}-error` : undefined, className: inputClass(key), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setDetail(item.key, event.target.value) };
    return <label key={item.key} htmlFor={shared.id} className={`${labelClass} ${item.type === "textarea" ? "sm:col-span-2" : ""}`}>
      {localize(item.label, isRu)}{item.required && <span className="ml-1 text-blue-600">*</span>}
      {item.type === "select" ? <select {...shared}><option value="">{tr("Tanlang", "Выберите")}</option>{item.options?.map(([value, uz, ru]) => <option key={value} value={value}>{isRu ? ru : uz}</option>)}</select>
        : item.type === "textarea" ? <textarea {...shared} rows={3} maxLength={item.maxLength ?? 600} />
          : <input {...shared} type={item.type || "text"} min={item.type === "date" ? values.travel_date || today : item.min} max={item.max} step={item.step ?? 1} maxLength={item.maxLength ?? 160} inputMode={item.type === "number" ? "decimal" : undefined} />}
      {item.hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">{localize(item.hint, isRu)}</span>}
      {fieldError(key)}
    </label>;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || aiBusy) return;
    const normalized = { ...values, service_details: cleanServiceData(values) };
    const problems = requestIssues(normalized, isRu);
    setIssues(problems); setError("");
    if (problems.length) {
      setAdvancedOpen(true);
      requestAnimationFrame(() => document.getElementById(fieldId(problems[0].field))?.focus());
      return;
    }
    submission.current = true; setIsSubmitting(true);
    try {
      await onSubmit({
        category: values.category!, origin: definition?.origin ? values.origin!.trim() : null, destination: values.destination!.trim(), travel_date: values.travel_date!,
        adults: values.adults!, children: values.children ?? 0, infants: values.infants ?? 0,
        baggage: airBaggage ? values.baggage?.trim() || null : null,
        budget: values.budget ?? null, currency: values.currency || "USD", description: values.description?.trim() || null,
        service_details: normalized.service_details, form_version: 1,
      });
    } catch (failure) { setError(failure instanceof Error ? failure.message : tr("So‘rovni saqlab bo‘lmadi.", "Не удалось сохранить запрос.")); }
    finally { submission.current = false; setIsSubmitting(false); }
  }

  return <form onSubmit={handleSubmit} noValidate className="space-y-7">
    <RequestAiFill values={values} disabled={isSubmitting} onBusyChange={setAiBusy} onApply={(draft) => { setBeforeAi(values); setValues(initialForm(draft)); setIssues([]); setError(""); setAdvancedOpen(true); }} />
    {beforeAi && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"><span>{tr("AI qoralamasi joylandi. Barcha maydonlarni tekshiring.", "Черновик AI перенесён. Проверьте все поля.")}</span><button type="button" disabled={aiBusy || isSubmitting} onClick={() => { setValues(beforeAi); setBeforeAi(null); setIssues([]); }} className="font-semibold underline">{tr("Oldingi ma’lumotga qaytish", "Вернуть прежние данные")}</button></div>}
    <fieldset disabled={isSubmitting || aiBusy} className="min-w-0 space-y-7 disabled:opacity-70">
      <label className={`${labelClass} block`} htmlFor={fieldId("category")}>{tr("Xizmat turi", "Вид услуги")} *<select id={fieldId("category")} value={values.category || ""} onChange={(event) => changeCategory(event.target.value)} className={inputClass("category")} aria-invalid={hasIssue("category")}><option value="">{tr("Xizmat turini tanlang", "Выберите вид услуги")}</option>{SERVICE_CATEGORIES.map((category) => <option key={category} value={category}>{localize(SERVICE_DEFINITIONS[category].label, isRu)}</option>)}</select>{fieldError("category")}</label>
      {definition && <>
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200"><p className="font-semibold">{localize(definition.label, isRu)} · {tr("so‘rov anketasi", "анкета запроса")}</p><p className="mt-1">{localize(definition.example, isRu)}</p><p className="mt-2 text-xs">{tr("* belgilangan maydonlar majburiy. Qo‘shimcha talablar ixtiyoriy.", "Поля со * обязательны. Дополнительные требования — по желанию.")}</p></div>
        <section aria-label={tr("Joy va sana", "Место и дата")} className={gridClass}>
          {(["origin", "destination"] as const).map((key) => {
            const label = definition[key];
            if (!label) return null;
            return <label key={key} htmlFor={fieldId(key)} className={labelClass}>{localize(label, isRu)} *{values.category === "Aviachipta" ? <AviaSmartInput id={fieldId(key)} required invalid={hasIssue(key)} mode="airport" value={values[key] || ""} maxLength={120} onChange={(value) => setValue(key, value)} className={inputClass(key)} /> : <input id={fieldId(key)} value={values[key] || ""} onChange={(event) => setValue(key, event.target.value)} maxLength={120} className={inputClass(key)} aria-invalid={hasIssue(key)} />}{fieldError(key)}</label>;
          })}
          <label htmlFor={fieldId("travel_date")} className={labelClass}>{localize(definition.date, isRu)} *<input id={fieldId("travel_date")} type="date" min={today} value={values.travel_date || ""} onChange={(event) => setValue("travel_date", event.target.value)} className={inputClass("travel_date")} aria-invalid={hasIssue("travel_date")} />{fieldError("travel_date")}</label>
          {definition.fields.filter((item) => item.required).map(renderDetail)}
        </section>
        {values.category === "Mehmonxona" && (daysBetween(values.travel_date, details.check_out) || 0) > 0 && <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">{tr("Tunlar soni", "Количество ночей")}: {daysBetween(values.travel_date, details.check_out)}</p>}
        {values.category === "Tur paket" && values.travel_date && Number(details.duration_days) > 0 && <p className="text-sm text-slate-500">{tr("Tur yakuni", "Окончание тура")}: {addCalendarDays(values.travel_date, Number(details.duration_days) - 1)}</p>}
        <section className="space-y-4 border-t border-slate-100 pt-6 dark:border-slate-800"><h2 className="font-semibold text-slate-900 dark:text-slate-100">{tr("Ishtirokchilar", "Участники")}</h2><div className="grid gap-4 sm:grid-cols-3">{(["adults", "children", "infants"] as const).map((key) => <label key={key} htmlFor={fieldId(key)} className={labelClass}>{key === "adults" ? tr("Kattalar", "Взрослые") : key === "children" ? tr("Bolalar", "Дети") : tr("Go‘daklar (2 yoshgacha)", "Младенцы (до 2 лет)")}<input id={fieldId(key)} type="number" min={key === "adults" ? 1 : 0} max={500} step={1} value={values[key] ?? ""} onChange={(event) => setValue(key, event.target.value === "" ? key === "adults" ? undefined : 0 : Number(event.target.value))} className={inputClass(key)} aria-invalid={hasIssue(key)} />{fieldError(key)}</label>)}</div><div className={gridClass}>{Boolean(values.children) && renderDetail({ ...COMMON_SERVICE_FIELDS[0], required: ["Aviachipta", "Mehmonxona", "Tur paket"].includes(values.category || "") })}{Boolean(values.infants) && renderDetail({ ...COMMON_SERVICE_FIELDS[1], required: ["Aviachipta", "Mehmonxona", "Tur paket"].includes(values.category || "") })}</div>{values.category === "Aviachipta" && <p className="text-xs text-slate-500">{tr("Kattalar: 12 yoshdan. Bolalar: 2–11 yosh, alohida o‘rin. Go‘dak: 2 yoshgacha, alohida o‘rinsiz. Yakuniy tarif shartini aviakompaniya bilan tekshiring.", "Взрослые: от 12 лет. Дети: 2–11 лет с местом. Младенцы: до 2 лет без места. Окончательные условия тарифа уточните у авиакомпании.")}</p>}</section>
        <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold text-blue-700 dark:text-blue-300">{tr("Qo‘shimcha talablar", "Дополнительные требования")}</summary><div className={`${gridClass} mt-5`}>{definition.fields.filter((item) => !item.required).map(renderDetail)}{airBaggage && <label htmlFor={fieldId("baggage")} className={labelClass}>{tr("Bagaj talabi", "Требования к багажу")}<input id={fieldId("baggage")} value={values.baggage || ""} onChange={(event) => setValue("baggage", event.target.value)} maxLength={120} placeholder={tr("Bagajsiz / 1 dona 23 kg", "Без багажа / 1 место 23 кг")} className={inputClass("baggage")} /></label>}</div></details>
        <section className="space-y-4"><h2 className="font-semibold text-slate-900 dark:text-slate-100">{tr("Budjet va izoh", "Бюджет и комментарий")}</h2><div className={gridClass}>
          <label htmlFor={fieldId("budget")} className={labelClass}>{tr("Taxminiy budjet (ixtiyoriy)", "Примерный бюджет (необязательно)")}<input id={fieldId("budget")} type="number" min="0.01" max="1000000000000" step="0.01" value={values.budget ?? ""} onChange={(event) => setValue("budget", event.target.value === "" ? null : Number(event.target.value))} placeholder={tr("Aniq bo‘lmasa, bo‘sh qoldiring", "Можно оставить пустым")} className={inputClass("budget")} aria-invalid={hasIssue("budget")} />{fieldError("budget")}</label>
          <label htmlFor={fieldId("currency")} className={labelClass}>{tr("Valyuta", "Валюта")}<select id={fieldId("currency")} value={values.currency || ""} onChange={(event) => setValue("currency", event.target.value)} className={inputClass("currency")}><option value="">{tr("Tanlang", "Выберите")}</option>{["USD", "UZS", "EUR", "RUB"].map((currency) => <option key={currency}>{currency}</option>)}</select>{fieldError("currency")}</label>
          {values.budget != null && renderDetail({ ...COMMON_SERVICE_FIELDS[2], required: true })}
          <label htmlFor={fieldId("description")} className={`${labelClass} sm:col-span-2`}>{tr("Qo‘shimcha izoh", "Дополнительный комментарий")}<textarea id={fieldId("description")} maxLength={1000} rows={4} value={values.description || ""} onChange={(event) => setValue("description", event.target.value)} className={inputClass("description")} placeholder={tr("Yuqoridagi maydonlarga sig‘magan shartlar", "Условия, не указанные в полях выше")} /><span className="mt-1 block text-right text-xs font-normal text-slate-400">{values.description?.length || 0}/1000</span>{fieldError("description")}</label>
        </div></section>
        {values.category === "Viza" && <p className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{tr("Bu viza bo‘yicha xizmat so‘rovi. Pasport raqami va hujjat rasmlarini ochiq so‘rovga kiritmang. Viza berish qarorini vakolatli organ qabul qiladi.", "Это запрос на визовую услугу. Не публикуйте номер и копии паспорта. Решение о выдаче визы принимает уполномоченный орган.")}</p>}
      </>}
    </fieldset>
    {issues.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200"><p className="font-semibold">{tr("Yuborishdan oldin tekshiring:", "Проверьте перед отправкой:")}</p><ul className="mt-2 list-inside list-disc space-y-1">{issues.map((item) => <li key={item.field}><button type="button" onClick={() => { setAdvancedOpen(true); requestAnimationFrame(() => document.getElementById(fieldId(item.field))?.focus()); }} className="text-left underline">{item.message}</button></li>)}</ul></div>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    <button type="submit" disabled={isSubmitting || aiBusy} className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-sm font-semibold text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-200 disabled:opacity-50">{isSubmitting ? (isRu ? "Сохранение…" : submittingLabel) : (isRu ? initialValues?.form_version !== undefined ? "Сохранить изменения" : "Создать запрос" : submitLabel)}</button>
  </form>;
}
