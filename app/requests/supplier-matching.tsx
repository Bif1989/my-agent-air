"use client";

import { useEffect, useMemo, useState } from "react";
import type { RequestRecord } from "@/app/requests/requests-api";
import RequestTargetingSummary from "@/app/requests/request-targeting-summary";
import {
  createSupplierInvite,
  listSupplierInvites,
  matchSuppliersForRequest,
  type SupplierInviteDraft,
  type SupplierInviteRow,
  type SupplierMatch,
  type SupplierType,
} from "@/app/requests/supplier-matching-api";
import { useUiSettings } from "@/lib/ui-settings";

const tr = (isRu: boolean, uz: string, ru: string) => isRu ? ru : uz;

const TYPE_LABELS: Record<SupplierType, { uz: string; ru: string }> = {
  hotel: { uz: "Mehmonxona", ru: "Отель" },
  guide: { uz: "Gid", ru: "Гид" },
  transport: { uz: "Transport", ru: "Транспорт" },
  restaurant: { uz: "Restoran", ru: "Ресторан" },
};

const STATUS_LABELS: Record<string, { uz: string; ru: string }> = {
  verified: { uz: "Tasdiqlangan", ru: "Проверен" },
  contact_verified: { uz: "Kontakt tasdiqlangan", ru: "Контакт подтверждён" },
  registry: { uz: "Rasmiy reyestr", ru: "Официальный реестр" },
  public_contact: { uz: "Ochiq biznes kontakti", ru: "Публичный бизнес-контакт" },
  queued: { uz: "Link tayyor", ru: "Ссылка готова" },
  sent: { uz: "Yuborilgan", ru: "Отправлено" },
  opened: { uz: "Ochilgan", ru: "Открыто" },
  responded: { uz: "Javob berdi", ru: "Ответил" },
  failed: { uz: "Xatolik", ru: "Ошибка" },
  opted_out: { uz: "So‘rovlarni rad etdi", ru: "Отказался от запросов" },
  cancelled: { uz: "Bekor qilingan", ru: "Отменено" },
  expired: { uz: "Muddati tugagan", ru: "Истекло" },
};

const typeLabel = (type: SupplierType, isRu: boolean) => isRu ? TYPE_LABELS[type].ru : TYPE_LABELS[type].uz;
const statusLabel = (status: string, isRu: boolean) => STATUS_LABELS[status] ? (isRu ? STATUS_LABELS[status].ru : STATUS_LABELS[status].uz) : status;

function defaultType(category: string): SupplierType {
  if (category === "Gid") return "guide";
  if (category === "Transfer") return "transport";
  return "hotel";
}

function sourceLabel(sourceType: string, isRu: boolean) {
  if (sourceType === "official_registry") return tr(isRu, "Rasmiy reyestr", "Официальный реестр");
  if (sourceType === "open_data") return "Open data";
  return tr(isRu, "Ochiq biznes manbasi", "Публичный бизнес-источник");
}

function responseSummary(invite: SupplierInviteRow, isRu: boolean) {
  if (invite.status !== "responded") return null;
  const response = invite.response || {};
  if (response.available === false) return tr(isRu, "Mavjud emas", "Недоступно");
  if (response.available === true) {
    const price = response.price == null
      ? tr(isRu, "Narx ko‘rsatilmagan", "Цена не указана")
      : `${Number(response.price).toLocaleString(isRu ? "ru-RU" : "uz-UZ")} ${response.currency || "UZS"}`;
    return response.comment ? `${price} · ${response.comment}` : price;
  }
  return tr(isRu, "Javob olindi", "Ответ получен");
}

type ErrorCode = "match" | "invite" | "";

export default function SupplierMatching({ request }: { request: RequestRecord }) {
  const { isRu } = useUiSettings();
  const [supplierType, setSupplierType] = useState<SupplierType>(() => defaultType(request.category));
  const [matches, setMatches] = useState<SupplierMatch[]>([]);
  const [invites, setInvites] = useState<SupplierInviteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState<ErrorCode>("");
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
  const inviteStats = useMemo(() => ({
    total: invites.length,
    opened: invites.filter((invite) => ["opened", "responded"].includes(invite.status)).length,
    responded: invites.filter((invite) => invite.status === "responded").length,
  }), [invites]);

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
    } catch {
      setError("match");
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
    } catch {
      setError("invite");
    } finally {
      setWorkingId("");
    }
  }

  async function copyLink() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.url);
    setCopied(true);
  }

  const errorText = error === "match"
    ? tr(isRu, "Tashqi supplierlarni topishda xatolik yuz berdi. Qayta urinib ko‘ring.", "Не удалось найти внешних поставщиков. Попробуйте ещё раз.")
    : error === "invite"
      ? tr(isRu, "Taklif linkini yaratib bo‘lmadi. Qayta urinib ko‘ring.", "Не удалось создать ссылку запроса. Попробуйте ещё раз.")
      : "";
  const targetingSummary = <RequestTargetingSummary requestId={request.id} isOwner distributionMode={request.distribution_mode || "targeted"} />;
  if (!enabled) return targetingSummary;

  return <>
    {targetingSummary}
    <section className="mt-8 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Supplier Matching</p>
          <h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{tr(isRu, "Tashqi hamkorlardan taklif so‘rash", "Запросить предложение у внешних партнёров")}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{tr(isRu, "Rasmiy va ochiq bazadagi mos hamkorlarni topadi. Kontakt oshkor qilinmaydi; javob individual taklif havolasi orqali olinadi.", "Система подбирает партнёров из официальных и открытых баз. Контакты не раскрываются; ответ поступает через индивидуальную ссылку запроса.")}</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50">{loading ? tr(isRu, "Qidirilmoqda...", "Поиск...") : tr(isRu, "Qayta qidirish", "Повторить поиск")}</button>
      </div>

      {allowedTypes.length > 1 && <div className="mt-5 flex flex-wrap gap-2">{allowedTypes.map((type) => <button key={type} type="button" onClick={() => setSupplierType(type)} className={`rounded-full px-4 py-2 text-sm font-semibold ${effectiveSupplierType === type ? "bg-[#0b1f3a] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{typeLabel(type, isRu)}</button>)}</div>}

      {invites.length > 0 && <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xl font-semibold text-[#0b1f3a]">{inviteStats.total}</p><p className="mt-1 text-xs text-slate-500">{tr(isRu, "So‘rov linki", "Ссылок")}</p></div>
        <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xl font-semibold text-amber-800">{inviteStats.opened}</p><p className="mt-1 text-xs text-amber-700">{tr(isRu, "Ochilgan", "Открыто")}</p></div>
        <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xl font-semibold text-emerald-800">{inviteStats.responded}</p><p className="mt-1 text-xs text-emerald-700">{tr(isRu, "Javob", "Ответов")}</p></div>
      </div>}

      {errorText && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</p>}

      {generated && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">{tr(isRu, `${generated.supplier_name} uchun individual so‘rov havolasi tayyor.`, `Индивидуальная ссылка для ${generated.supplier_name} готова.`)}</p>
        <p className="mt-1 text-sm text-emerald-800">{tr(isRu, `Kanal: ${generated.channel} · Kontakt: ${generated.recipient_hint}. Hozircha avtomatik SMS/email yuborilmadi — linkni qo‘lda ulashish mumkin.`, `Канал: ${generated.channel} · Контакт: ${generated.recipient_hint}. Автоматическая SMS/email отправка пока не выполняется — ссылкой можно поделиться вручную.`)}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input readOnly value={generated.url} className="min-w-0 flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-xs text-slate-700" /><button type="button" onClick={() => void copyLink()} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">{copied ? tr(isRu, "Nusxalandi", "Скопировано") : tr(isRu, "Linkni nusxalash", "Скопировать ссылку")}</button></div>
      </div>}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {loading && matches.length === 0 && <div className="h-32 animate-pulse rounded-2xl bg-slate-100 md:col-span-2" />}
        {!loading && matches.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-7 text-center text-sm text-slate-500 md:col-span-2">{tr(isRu, "Hozircha ushbu hudud va xizmatga mos tashqi supplier topilmadi. Rasmiy baza kengaygani sari natijalar shu yerda chiqadi.", "Пока внешние поставщики для этого региона и услуги не найдены. По мере расширения базы результаты появятся здесь.")}</div>}
        {matches.map((supplier) => <article key={supplier.id} className="rounded-2xl border border-slate-200 p-5">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-[#0b1f3a]">{supplier.name}</h3><p className="mt-1 text-sm text-slate-500">{[supplier.city, supplier.region].filter(Boolean).join(" · ") || tr(isRu, "Hudud ko‘rsatilmagan", "Регион не указан")}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">{statusLabel(supplier.status, isRu)}</span></div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-cyan-50 px-2.5 py-1 font-semibold text-cyan-800">{tr(isRu, "Moslik", "Совпадение")}: {supplier.match_score}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{sourceLabel(supplier.source_type, isRu)}</span>
            {supplier.star_rating && <span className="rounded-full bg-slate-100 px-2.5 py-1">{supplier.star_rating}★</span>}
            {supplier.capacity != null && <span className="rounded-full bg-slate-100 px-2.5 py-1">{tr(isRu, "Sig‘im", "Вместимость")}: {supplier.capacity}</span>}
            {supplier.has_phone && <span className="rounded-full bg-slate-100 px-2.5 py-1">{tr(isRu, "Telefon bor", "Есть телефон")}</span>}
            {supplier.has_email && <span className="rounded-full bg-slate-100 px-2.5 py-1">{tr(isRu, "Email bor", "Есть email")}</span>}
          </div>
          <button type="button" onClick={() => void makeInvite(supplier)} disabled={Boolean(workingId)} className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{workingId === supplier.id ? tr(isRu, "Tayyorlanmoqda...", "Подготовка...") : tr(isRu, "Taklif so‘rash linkini yaratish", "Создать ссылку для запроса")}</button>
        </article>)}
      </div>

      {invites.length > 0 && <div className="mt-8 border-t border-slate-100 pt-6">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[#0b1f3a]">{tr(isRu, "Tashqi so‘rovlar holati", "Статус внешних запросов")}</h3><p className="mt-1 text-sm text-slate-500">{tr(isRu, "Yaratilgan individual havolalar va supplier javoblari.", "Индивидуальные ссылки и ответы поставщиков.")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{invites.length} {tr(isRu, "ta", "шт.")}</span></div>
        <div className="mt-4 space-y-3">{invites.map((invite) => {
          const summary = responseSummary(invite, isRu);
          return <div key={invite.id} className="rounded-xl border border-slate-100 px-4 py-3 text-sm"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center"><div><span className="font-semibold text-[#0b1f3a]">{invite.supplier_name}</span><span className="ml-2 text-slate-400">{invite.recipient_hint}</span></div><span className="font-semibold text-blue-700">{statusLabel(invite.status, isRu)}</span></div>{summary && <p className={`mt-2 ${invite.response?.available === false ? "text-amber-700" : "text-emerald-700"}`}>{summary}</p>}</div>;
        })}</div>
      </div>}
    </section>
  </>;
}
