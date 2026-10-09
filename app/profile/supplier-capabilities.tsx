"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listOwnSupplierCapabilities,
  saveOwnSupplierCapability,
  type EditableSupplierCapability,
  type SupplierCapabilityRecord,
  type SupplierCapabilityType,
  type SupplierPriceBasis,
} from "@/app/profile/supplier-capabilities-api";

const TYPE_LABELS: Record<SupplierCapabilityType, string> = {
  aviation: "Aviakassa",
  travel_agent: "Turagent",
  tour_operator: "Turoperator",
  hotel: "Mehmonxona",
  transport: "Transport",
  guide: "Gid",
  restaurant: "Restoran",
  visa: "Viza xizmati",
  other: "Boshqa",
};

const PRICE_LABELS: Record<SupplierPriceBasis, string> = {
  total: "Umumiy narx",
  per_person: "1 kishi uchun",
  per_room_night: "1 xona / tun",
  per_person_night: "1 kishi / tun",
  per_vehicle: "1 transport uchun",
  per_hour: "1 soat uchun",
  per_day: "1 kun uchun",
  per_unit: "1 birlik uchun",
};

const TYPE_OPTIONS = Object.keys(TYPE_LABELS) as SupplierCapabilityType[];
const PRICE_OPTIONS = Object.keys(PRICE_LABELS) as SupplierPriceBasis[];

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
    is_active: row.is_active,
  };
}

function fieldClass() {
  return "mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100";
}

export default function SupplierCapabilities({ defaultCity }: { defaultCity: string }) {
  const [rows, setRows] = useState<SupplierCapabilityRecord[]>([]);
  const [editing, setEditing] = useState<EditableSupplierCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const usedTypes = useMemo(() => new Set(rows.map((row) => row.capability_type)), [rows]);

  useEffect(() => {
    let active = true;
    listOwnSupplierCapabilities()
      .then((data) => { if (active) setRows(data); })
      .catch(() => { if (active) setError("Geo Tender xizmatlarini yuklab bo‘lmadi."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  function startNew() {
    const firstUnused = TYPE_OPTIONS.find((type) => !usedTypes.has(type));
    const draft = emptyCapability(defaultCity);
    if (firstUnused) draft.capability_type = firstUnused;
    setEditing(draft);
    setError("");
    setMessage("");
  }

  function updateField<K extends keyof EditableSupplierCapability>(field: K, value: EditableSupplierCapability[K]) {
    setEditing((current) => current ? { ...current, [field]: value } : current);
    setMessage("");
  }

  async function save() {
    if (!editing || saving) return;
    if (!editing.city.trim()) { setError("Kamida xizmat shahri yoki asosiy hududni kiriting."); return; }
    if (!editing.id && usedTypes.has(editing.capability_type)) { setError("Bu xizmat turi allaqachon mavjud. Mavjud kartani tahrirlang."); return; }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveOwnSupplierCapability(editing);
      setRows((current) => {
        const exists = current.some((row) => row.id === saved.id);
        const next = exists ? current.map((row) => row.id === saved.id ? saved : row) : [saved, ...current];
        return next.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.capability_type.localeCompare(b.capability_type));
      });
      setEditing(toEditable(saved));
      setMessage("Geo Tender xizmati saqlandi.");
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "INVALID_NUMBER" ? "Sig‘im va minimal narx manfiy bo‘lmasligi kerak." : "Xizmatni saqlab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="mt-8 rounded-2xl border border-cyan-100 bg-white p-5 shadow-sm sm:p-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">Geo Tender</p>
        <h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Siz ko‘rsatadigan xizmatlar</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Bu ma’lumotlar AI matching uchun ishlatiladi. Xizmat turi, hudud va sig‘im qanchalik aniq bo‘lsa, sizga shunchalik mos so‘rovlar yuboriladi.</p>
      </div>
      <button type="button" onClick={startNew} disabled={usedTypes.size >= TYPE_OPTIONS.length} className="rounded-xl bg-[#0b1f3a] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">+ Xizmat qo‘shish</button>
    </div>

    {loading ? <div className="mt-6 h-28 animate-pulse rounded-2xl bg-slate-100" /> : <div className="mt-6 grid gap-3 md:grid-cols-2">{rows.length ? rows.map((row) => <button key={row.id} type="button" onClick={() => { setEditing(toEditable(row)); setError(""); setMessage(""); }} className={`rounded-2xl border p-5 text-left transition hover:border-blue-300 ${editing?.id === row.id ? "border-blue-400 ring-4 ring-blue-50" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#0b1f3a]">{TYPE_LABELS[row.capability_type]}</p><p className="mt-1 text-sm text-slate-500">{[row.city, row.district, row.region].filter(Boolean).join(" · ") || "Hudud ko‘rsatilmagan"}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{row.is_active ? "Faol" : "Nofaol"}</span></div><div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">{row.capacity != null && <span className="rounded-full bg-slate-100 px-2.5 py-1">Sig‘im: {row.capacity}</span>}{row.min_price != null && <span className="rounded-full bg-slate-100 px-2.5 py-1">Min: {Number(row.min_price).toLocaleString("uz-UZ")} {row.currency || ""}</span>}<span className="rounded-full bg-slate-100 px-2.5 py-1">{row.onboarding_status === "complete" ? "Profil tayyor" : "To‘ldirish kerak"}</span></div></button>) : <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center text-sm text-slate-500 md:col-span-2">Hali xizmat profili yo‘q. “Xizmat qo‘shish” orqali Geo Tender matchingni aniqroq qiling.</div>}</div>}

    {editing && <div className="mt-7 border-t border-slate-100 pt-6"><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm font-semibold text-[#0b1f3a]">Xizmat turi<select value={editing.capability_type} disabled={Boolean(editing.id)} onChange={(event) => updateField("capability_type", event.target.value as SupplierCapabilityType)} className={fieldClass()}>{TYPE_OPTIONS.map((type) => <option key={type} value={type} disabled={!editing.id && usedTypes.has(type)}>{TYPE_LABELS[type]}</option>)}</select></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Viloyat<input value={editing.region} maxLength={100} onChange={(event) => updateField("region", event.target.value)} placeholder="Masalan, Namangan" className={fieldClass()} /></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Shahar *<input value={editing.city} maxLength={100} onChange={(event) => updateField("city", event.target.value)} placeholder="Masalan, Chust" className={fieldClass()} /></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Tuman<input value={editing.district} maxLength={100} onChange={(event) => updateField("district", event.target.value)} className={fieldClass()} /></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Manzil<input value={editing.address} maxLength={240} onChange={(event) => updateField("address", event.target.value)} className={fieldClass()} /></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Sig‘im<input type="number" min="0" value={editing.capacity} onChange={(event) => updateField("capacity", event.target.value)} placeholder="Masalan, 50" className={fieldClass()} /></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Minimal narx<input type="number" min="0" value={editing.min_price} onChange={(event) => updateField("min_price", event.target.value)} className={fieldClass()} /></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Valyuta<select value={editing.currency} onChange={(event) => updateField("currency", event.target.value as EditableSupplierCapability["currency"])} className={fieldClass()}>{["UZS", "USD", "EUR", "RUB"].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
      <label className="text-sm font-semibold text-[#0b1f3a]">Narx birligi<select value={editing.price_basis} onChange={(event) => updateField("price_basis", event.target.value as SupplierPriceBasis)} className={fieldClass()}>{PRICE_OPTIONS.map((basis) => <option key={basis} value={basis}>{PRICE_LABELS[basis]}</option>)}</select></label>
    </div><label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a]"><input type="checkbox" checked={editing.is_active} onChange={(event) => updateField("is_active", event.target.checked)} className="h-4 w-4" />Geo Tender matchingda faol qatnashsin</label>
      {(error || message) && <div className="mt-4" aria-live="polite">{error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p className="text-sm text-emerald-700">{message}</p>}</div>}
      <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saqlanmoqda..." : "Xizmatni saqlash"}</button><button type="button" onClick={() => { setEditing(null); setError(""); setMessage(""); }} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700">Yopish</button></div>
    </div>}
  </section>;
}
