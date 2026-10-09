"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listOwnSupplierCapabilities,
  normalizeServiceAreas,
  saveOwnSupplierCapability,
  type EditableSupplierCapability,
  type SupplierCapabilityRecord,
  type SupplierCapabilityType,
  type SupplierPriceBasis,
} from "@/app/profile/supplier-capabilities-api";
import { useUiSettings } from "@/lib/ui-settings";

const TYPE_LABELS: Record<SupplierCapabilityType, { uz: string; ru: string }> = {
  aviation: { uz: "Aviakassa", ru: "Авиакасса" },
  travel_agent: { uz: "Turagent", ru: "Турагент" },
  tour_operator: { uz: "Turoperator", ru: "Туроператор" },
  hotel: { uz: "Mehmonxona", ru: "Отель" },
  transport: { uz: "Transport", ru: "Транспорт" },
  guide: { uz: "Gid", ru: "Гид" },
  restaurant: { uz: "Restoran", ru: "Ресторан" },
  visa: { uz: "Viza xizmati", ru: "Визовые услуги" },
  other: { uz: "Boshqa", ru: "Другое" },
};

const PRICE_LABELS: Record<SupplierPriceBasis, { uz: string; ru: string }> = {
  total: { uz: "Umumiy narx", ru: "Общая цена" },
  per_person: { uz: "1 kishi uchun", ru: "За 1 человека" },
  per_room_night: { uz: "1 xona / tun", ru: "За номер / ночь" },
  per_person_night: { uz: "1 kishi / tun", ru: "За человека / ночь" },
  per_vehicle: { uz: "1 transport uchun", ru: "За транспорт" },
  per_hour: { uz: "1 soat uchun", ru: "За час" },
  per_day: { uz: "1 kun uchun", ru: "За день" },
  per_unit: { uz: "1 birlik uchun", ru: "За единицу" },
};

const TYPE_OPTIONS = Object.keys(TYPE_LABELS) as SupplierCapabilityType[];
const PRICE_OPTIONS = Object.keys(PRICE_LABELS) as SupplierPriceBasis[];
const tr = (isRu: boolean, uz: string, ru: string) => isRu ? ru : uz;
const typeLabel = (type: SupplierCapabilityType, isRu: boolean) => isRu ? TYPE_LABELS[type].ru : TYPE_LABELS[type].uz;
const priceLabel = (basis: SupplierPriceBasis, isRu: boolean) => isRu ? PRICE_LABELS[basis].ru : PRICE_LABELS[basis].uz;

function serviceAreas(row: SupplierCapabilityRecord) {
  return Array.isArray(row.details?.service_areas)
    ? row.details.service_areas.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).slice(0, 20)
    : [];
}

function emptyCapability(defaultCity: string): EditableSupplierCapability {
  return {
    capability_type: "hotel",
    region: "",
    city: defaultCity,
    district: "",
    address: "",
    capacity: "",
    min_price: "",
    currency: "UZS",
    price_basis: "total",
    service_areas: "",
    notes: "",
    details: {},
    is_active: true,
  };
}

function toEditable(row: SupplierCapabilityRecord): EditableSupplierCapability {
  return {
    id: row.id,
    capability_type: row.capability_type,
    region: row.region || "",
    city: row.city || "",
    district: row.district || "",
    address: row.address || "",
    capacity: row.capacity == null ? "" : String(row.capacity),
    min_price: row.min_price == null ? "" : String(row.min_price),
    currency: row.currency || "UZS",
    price_basis: row.price_basis || "total",
    service_areas: serviceAreas(row).join(", "),
    notes: typeof row.details?.notes === "string" ? row.details.notes : "",
    details: row.details || {},
    is_active: row.is_active,
  };
}

function fieldClass() {
  return "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
}

type FeedbackCode = "load" | "city" | "duplicate" | "invalid_number" | "save" | "saved" | "";

export default function SupplierCapabilities({ defaultCity }: { defaultCity: string }) {
  const { isRu } = useUiSettings();
  const [rows, setRows] = useState<SupplierCapabilityRecord[]>([]);
  const [editing, setEditing] = useState<EditableSupplierCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackCode>("");

  const usedTypes = useMemo(() => new Set(rows.map((row) => row.capability_type)), [rows]);

  useEffect(() => {
    let active = true;
    listOwnSupplierCapabilities()
      .then((data) => { if (active) setRows(data); })
      .catch(() => { if (active) setFeedback("load"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function startNew() {
    const firstUnused = TYPE_OPTIONS.find((type) => !usedTypes.has(type));
    const draft = emptyCapability(defaultCity);
    if (firstUnused) draft.capability_type = firstUnused;
    setEditing(draft);
    setFeedback("");
  }

  function updateField<K extends keyof EditableSupplierCapability>(field: K, value: EditableSupplierCapability[K]) {
    setEditing((current) => current ? { ...current, [field]: value } : current);
    setFeedback("");
  }

  async function save() {
    if (!editing || saving) return;
    if (!editing.city.trim()) { setFeedback("city"); return; }
    if (!editing.id && usedTypes.has(editing.capability_type)) { setFeedback("duplicate"); return; }
    setSaving(true);
    setFeedback("");
    try {
      const saved = await saveOwnSupplierCapability(editing);
      setRows((current) => {
        const exists = current.some((row) => row.id === saved.id);
        const next = exists ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current];
        return next.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.capability_type.localeCompare(b.capability_type));
      });
      setEditing(toEditable(saved));
      setFeedback("saved");
    } catch (cause) {
      setFeedback(cause instanceof Error && cause.message === "INVALID_NUMBER" ? "invalid_number" : "save");
    } finally {
      setSaving(false);
    }
  }

  const feedbackText = feedback === "load" ? tr(isRu, "Geo Tender xizmatlarini yuklab bo‘lmadi.", "Не удалось загрузить услуги Geo Tender.")
    : feedback === "city" ? tr(isRu, "Kamida asosiy xizmat shahrini kiriting.", "Укажите основной город оказания услуги.")
      : feedback === "duplicate" ? tr(isRu, "Bu xizmat turi allaqachon mavjud. Mavjud kartani tahrirlang.", "Этот тип услуги уже добавлен. Отредактируйте существующую карточку.")
        : feedback === "invalid_number" ? tr(isRu, "Sig‘im va minimal narx manfiy bo‘lmasligi kerak.", "Вместимость и минимальная цена не могут быть отрицательными.")
          : feedback === "save" ? tr(isRu, "Xizmatni saqlab bo‘lmadi. Qayta urinib ko‘ring.", "Не удалось сохранить услугу. Попробуйте ещё раз.")
            : feedback === "saved" ? tr(isRu, "Geo Tender xizmati saqlandi.", "Услуга Geo Tender сохранена.") : "";
  const feedbackIsError = feedback !== "" && feedback !== "saved";

  return <section className="mt-8 rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Geo Tender</p>
        <h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{tr(isRu, "Siz ko‘rsatadigan xizmatlar", "Ваши услуги")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{tr(isRu, "Asosiy shahar bilan birga xizmat ko‘rsatadigan qo‘shimcha hududlarni ham kiriting. Geo Tender so‘rov manzilini shu qamrov bilan solishtiradi.", "Укажите основной город и дополнительные зоны обслуживания. Geo Tender сопоставляет место запроса с вашей зоной покрытия.")}</p>
      </div>
      <button type="button" onClick={startNew} disabled={usedTypes.size >= TYPE_OPTIONS.length} className="rounded-xl bg-[#0b1f3a] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">+ {tr(isRu, "Xizmat qo‘shish", "Добавить услугу")}</button>
    </div>

    {loading ? <div className="mt-6 h-28 animate-pulse rounded-2xl bg-slate-100" /> : <div className="mt-6 grid gap-3 md:grid-cols-2">{rows.length ? rows.map((row) => {
      const areas = serviceAreas(row);
      return <button key={row.id} type="button" onClick={() => { setEditing(toEditable(row)); setFeedback(""); }} className={`rounded-2xl border p-5 text-left transition hover:border-blue-300 ${editing?.id === row.id ? "border-blue-400 ring-4 ring-blue-50" : "border-slate-200"}`}>
        <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#0b1f3a]">{typeLabel(row.capability_type, isRu)}</p><p className="mt-1 text-sm text-slate-500">{[row.city, row.district, row.region].filter(Boolean).join(" · ") || tr(isRu, "Hudud ko‘rsatilmagan", "Регион не указан")}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.is_active ? tr(isRu, "Faol", "Активно") : tr(isRu, "Nofaol", "Неактивно")}</span></div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">{row.capacity != null && <span className="rounded-full bg-slate-100 px-2.5 py-1">{tr(isRu, "Sig‘im", "Вместимость")}: {row.capacity}</span>}{row.min_price != null && <span className="rounded-full bg-slate-100 px-2.5 py-1">{tr(isRu, "Min", "Мин")}: {Number(row.min_price).toLocaleString(isRu ? "ru-RU" : "uz-UZ")} {row.currency || ""}</span>}{areas.length > 0 && <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-cyan-800">{tr(isRu, "Qamrov", "Зона")}: {areas.slice(0, 2).join(", ")}{areas.length > 2 ? ` +${areas.length - 2}` : ""}</span>}<span className="rounded-full bg-slate-100 px-2.5 py-1">{row.onboarding_status === "complete" ? tr(isRu, "Profil tayyor", "Профиль готов") : tr(isRu, "To‘ldirish kerak", "Нужно заполнить")}</span></div>
      </button>;
    }) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center text-sm text-slate-500 md:col-span-2">{tr(isRu, "Hali xizmat profili yo‘q. “Xizmat qo‘shish” orqali Geo Tender matchingni aniqroq qiling.", "Пока нет профиля услуг. Добавьте услугу, чтобы Geo Tender точнее подбирал запросы.")}</div>}</div>}

    {editing && <div className="mt-7 border-t border-slate-100 pt-6">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Xizmat turi", "Тип услуги")}<select value={editing.capability_type} disabled={Boolean(editing.id)} onChange={(event) => updateField("capability_type", event.target.value as SupplierCapabilityType)} className={fieldClass()}>{TYPE_OPTIONS.map((type) => <option key={type} value={type} disabled={!editing.id && usedTypes.has(type)}>{typeLabel(type, isRu)}</option>)}</select></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Viloyat", "Область")}<input value={editing.region} maxLength={100} onChange={(event) => updateField("region", event.target.value)} placeholder={tr(isRu, "Masalan, Namangan", "Например, Наманган")} className={fieldClass()} /></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Asosiy shahar *", "Основной город *")}<input value={editing.city} maxLength={100} onChange={(event) => updateField("city", event.target.value)} placeholder={tr(isRu, "Masalan, Chust", "Например, Чуст")} className={fieldClass()} /></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Tuman", "Район")}<input value={editing.district} maxLength={100} onChange={(event) => updateField("district", event.target.value)} className={fieldClass()} /></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Manzil", "Адрес")}<input value={editing.address} maxLength={240} onChange={(event) => updateField("address", event.target.value)} className={fieldClass()} /></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Maksimal sig‘im", "Макс. вместимость")}<input type="number" min="0" value={editing.capacity} onChange={(event) => updateField("capacity", event.target.value)} placeholder={tr(isRu, "Masalan, 50", "Например, 50")} className={fieldClass()} /></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Minimal narx", "Минимальная цена")}<input type="number" min="0" value={editing.min_price} onChange={(event) => updateField("min_price", event.target.value)} className={fieldClass()} /></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Valyuta", "Валюта")}<select value={editing.currency} onChange={(event) => updateField("currency", event.target.value as EditableSupplierCapability["currency"])} className={fieldClass()}>{["UZS", "USD", "EUR", "RUB"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Narx birligi", "Единица цены")}<select value={editing.price_basis} onChange={(event) => updateField("price_basis", event.target.value as SupplierPriceBasis)} className={fieldClass()}>{PRICE_OPTIONS.map((basis) => <option key={basis} value={basis}>{priceLabel(basis, isRu)}</option>)}</select></label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Qo‘shimcha xizmat hududlari", "Дополнительные зоны обслуживания")}<textarea value={editing.service_areas} maxLength={1600} rows={4} onChange={(event) => updateField("service_areas", event.target.value)} placeholder={tr(isRu, "Masalan: Namangan, Pop, Chust, Farg‘ona\nVergul yoki yangi qator bilan ajrating", "Например: Наманган, Пап, Чуст, Фергана\nРазделяйте запятыми или новой строкой")} className={fieldClass()} /><span className="mt-1 block text-xs font-normal text-slate-400">{tr(isRu, `20 tagacha hudud · hozir ${normalizeServiceAreas(editing.service_areas).length} ta`, `До 20 зон · сейчас ${normalizeServiceAreas(editing.service_areas).length}`)}</span></label>
        <label className="text-sm font-semibold text-[#0b1f3a]">{tr(isRu, "Xizmat haqida qisqa izoh", "Кратко об услуге")}<textarea value={editing.notes} maxLength={1200} rows={4} onChange={(event) => updateField("notes", event.target.value)} placeholder={tr(isRu, "Masalan: 8 o‘rinli Staria, aeroport transferi, 24/7...", "Например: Staria на 8 мест, трансфер из аэропорта, 24/7...")} className={fieldClass()} /></label>
      </div>

      <label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a]"><input type="checkbox" checked={editing.is_active} onChange={(event) => updateField("is_active", event.target.checked)} className="h-4 w-4" />{tr(isRu, "Geo Tender matchingda faol qatnashsin", "Участвовать в подборе Geo Tender")}</label>
      {feedbackText && <div className="mt-4" aria-live="polite">{feedbackIsError ? <p role="alert" className="text-sm text-red-600">{feedbackText}</p> : <p className="text-sm text-emerald-700">{feedbackText}</p>}</div>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? tr(isRu, "Saqlanmoqda...", "Сохранение...") : tr(isRu, "Xizmatni saqlash", "Сохранить услугу")}</button><button type="button" onClick={() => { setEditing(null); setFeedback(""); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">{tr(isRu, "Yopish", "Закрыть")}</button></div>
    </div>}
  </section>;
}
