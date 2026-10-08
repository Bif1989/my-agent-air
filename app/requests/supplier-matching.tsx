"use client";

import { useEffect, useMemo, useState } from "react";
import type { RequestRecord } from "@/app/requests/requests-api";
import {
  createSupplierInvite,
  listSupplierInvites,
  matchSuppliersForRequest,
  type SupplierInviteDraft,
  type SupplierInviteRow,
  type SupplierMatch,
  type SupplierType,
} from "@/app/requests/supplier-matching-api";

const TYPE_LABELS: Record<SupplierType, string> = {
  hotel: "Mehmonxona",
  guide: "Gid",
  transport: "Transport",
  restaurant: "Restoran",
};

const STATUS_LABELS: Record<string, string> = {
  verified: "Verified",
  contact_verified: "Kontakt tasdiqlangan",
  registry: "Rasmiy reyestr",
  public_contact: "Ochiq biznes kontakti",
  queued: "Link tayyor",
  sent: "Yuborilgan",
  opened: "Ochilgan",
  responded: "Javob berdi",
  failed: "Xatolik",
  opted_out: "So‘rovlarni rad etdi",
  cancelled: "Bekor qilingan",
  expired: "Muddati tugagan",
};

function defaultType(category: string): SupplierType {
  if (category === "Gid") return "guide";
  if (category === "Transfer") return "transport";
  return "hotel";
}

function sourceLabel(sourceType: string) {
  if (sourceType === "official_registry") return "Rasmiy reyestr";
  if (sourceType === "open_data") return "Open data";
  return "Ochiq biznes manbasi";
}

function responseSummary(invite: SupplierInviteRow) {
  if (invite.status !== "responded") return null;
  const response = invite.response || {};
  if (response.available === false) return "Mavjud emas";
  if (response.available === true) {
    const price = response.price == null ? "Narx ko‘rsatilmagan" : `${Number(response.price).toLocaleString("uz-UZ")} ${response.currency || "UZS"}`;
    return response.comment ? `${price} · ${response.comment}` : price;
  }
  return "Javob olindi";
}

export default function SupplierMatching({ request }: { request: RequestRecord }) {
  const [supplierType, setSupplierType] = useState<SupplierType>(() => defaultType(request.category));
  const [matches, setMatches] = useState<SupplierMatch[]>([]);
  const [invites, setInvites] = useState<SupplierInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<(SupplierInviteDraft & { url: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  const enabled = ["Mehmonxona", "Gid", "Transfer", "Tur paket", "Boshqa"].includes(request.category);
  const allowedTypes = useMemo<SupplierType[]>(() => {
    if (request.category === "Mehmonxona") return ["hotel"];
    if (request.category === "Gid") return ["guide"];
    if (request.category === "Transfer") return ["transport"];
    return ["hotel", "transport", "guide", "restaurant"];
  }, [request.category]);
  const effectiveSupplierType = allowedTypes.includes(supplierType) ? supplierType : allowedTypes[0];

  async function refresh(type = effectiveSupplierType) {
    setLoading(true);
    setError("");
    try {
      const [found, existingInvites] = await Promise.all([
        matchSuppliersForRequest(request.id, type, 20),
        listSupplierInvites(request.id),
      ]);
      setMatches(found);
      setInvites(existingInvites);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Supplierlarni topishda xatolik yuz berdi.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    const timeout = window.setTimeout(() => { void refresh(effectiveSupplierType); }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, effectiveSupplierType, request.id]);

  async function makeInvite(supplier: SupplierMatch) {
    setWorkingId(supplier.id);
    setGenerated(null);
    setCopied(false);
    setError("");
    try {
      const draft = await createSupplierInvite(request.id, supplier.id, "auto");
      const url = `${window.location.origin}/supplier-request/${draft.token}`;
      setGenerated({ ...draft, url });
      setInvites(await listSupplierInvites(request.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Taklif linkini yaratib bo‘lmadi.");
    } finally {
      setWorkingId("");
    }
  }

  async function copyLink() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.url);
    setCopied(true);
  }

  if (!enabled) return null;

  return <section className="mt-8 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Supplier Matching</p>
        <h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Tashqi hamkorlardan taklif so‘rash</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Rasmiy/open bazadagi mos hamkorlarni topadi. Kontaktning o‘zi oshkor qilinmaydi; javob individual taklif havolasi orqali olinadi.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50">{loading ? "Qidirilmoqda..." : "Qayta qidirish"}</button>
    </div>

    {allowedTypes.length > 1 && <div className="mt-5 flex flex-wrap gap-2">{allowedTypes.map((type) => <button key={type} type="button" onClick={() => setSupplierType(type)} className={`rounded-full px-4 py-2 text-sm font-semibold ${effectiveSupplierType === type ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{TYPE_LABELS[type]}</button>)}</div>}

    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

    {generated && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <p className="font-semibold text-emerald-900">{generated.supplier_name} uchun individual so‘rov havolasi tayyor.</p>
      <p className="mt-1 text-sm text-emerald-800">Kanal: {generated.channel} · Kontakt: {generated.recipient_hint}. Hozircha avtomatik SMS/email yuborilmadi — linkni sinov uchun qo‘lda ulashish mumkin.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input readOnly value={generated.url} className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs text-slate-700" /><button type="button" onClick={() => void copyLink()} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">{copied ? "Nusxalandi" : "Linkni nusxalash"}</button></div>
    </div>}

    <div className="mt-6 grid gap-3 md:grid-cols-2">
      {loading && matches.length === 0 && <div className="h-32 animate-pulse rounded-2xl bg-slate-100 md:col-span-2" />}
      {!loading && matches.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center text-sm text-slate-500 md:col-span-2">Hozircha ushbu hudud va xizmatga mos tashqi supplier topilmadi. Admin paneldan rasmiy bazani import qilgandan keyin shu yerda chiqadi.</div>}
      {matches.map((supplier) => <article key={supplier.id} className="rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-[#0b1f3a]">{supplier.name}</h3><p className="mt-1 text-sm text-slate-500">{[supplier.city, supplier.region].filter(Boolean).join(" · ") || "Hudud ko‘rsatilmagan"}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{STATUS_LABELS[supplier.status] || supplier.status}</span></div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
          <span className="rounded-full bg-slate-100 px-2.5 py-1">{sourceLabel(supplier.source_type)}</span>
          {supplier.star_rating && <span className="rounded-full bg-slate-100 px-2.5 py-1">{supplier.star_rating}★</span>}
          {supplier.capacity != null && <span className="rounded-full bg-slate-100 px-2.5 py-1">Sig‘im: {supplier.capacity}</span>}
          {supplier.has_phone && <span className="rounded-full bg-slate-100 px-2.5 py-1">Telefon bor</span>}
          {supplier.has_email && <span className="rounded-full bg-slate-100 px-2.5 py-1">Email bor</span>}
        </div>
        <button type="button" onClick={() => void makeInvite(supplier)} disabled={Boolean(workingId)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{workingId === supplier.id ? "Tayyorlanmoqda..." : "Taklif so‘rash linkini yaratish"}</button>
      </article>)}
    </div>

    {invites.length > 0 && <div className="mt-8 border-t border-slate-100 pt-6">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[#0b1f3a]">Tashqi so‘rovlar holati</h3><p className="mt-1 text-sm text-slate-500">Yaratilgan individual havolalar va supplier javoblari.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{invites.length} ta</span></div>
      <div className="mt-4 space-y-3">{invites.map((invite) => {
        const summary = responseSummary(invite);
        return <div key={invite.id} className="rounded-xl border border-slate-100 px-4 py-3 text-sm"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><span className="font-semibold text-[#0b1f3a]">{invite.supplier_name}</span><span className="ml-2 text-slate-400">{invite.recipient_hint}</span></div><span className="font-semibold text-blue-700">{STATUS_LABELS[invite.status] || invite.status}</span></div>{summary && <p className={`mt-2 ${invite.response?.available === false ? "text-amber-700" : "text-emerald-700"}`}>{summary}</p>}</div>;
      })}</div>
    </div>}
  </section>;
}