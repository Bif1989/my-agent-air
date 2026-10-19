"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getCurrentProfile } from "@/app/profile/profile-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import {
  createSmsCampaign,
  getSmsCampaign,
  listSmsCampaigns,
  retryFailedSms,
  sendSmsCampaignBatch,
  type AdminSmsCampaign,
  type AdminSmsRecipient,
} from "@/app/admin/sms/sms-api";

const DEFAULT_MESSAGE = "Turfirmalar uchun B2B platforma! So'rov yuboring, hamkorlardan taklif oling: tur, mehmonxona, gid, transport, avia tel: +998912924010 https://agent.bifavia.uz/";
const MOBILE_PREFIXES = new Set(["33", "50", "55", "77", "88", "90", "91", "93", "94", "95", "97", "98", "99"]);

function normalizeMobile(value: string) {
  const digits = value.replace(/\D/g, "");
  let local = "";
  if (/^998\d{9}$/.test(digits)) local = digits.slice(3);
  else if (/^\d{9}$/.test(digits)) local = digits;
  else return "";
  if (!MOBILE_PREFIXES.has(local.slice(0, 2))) return "";
  return `998${local}`;
}

function parsePhones(text: string) {
  const phones = new Set<string>();
  let rejected = 0;
  for (const token of text.split(/[\s,;|]+/).filter(Boolean)) {
    const phone = normalizeMobile(token);
    if (phone) phones.add(phone);
    else if (/\d/.test(token)) rejected += 1;
  }
  return { phones: [...phones], rejected };
}

function smsSegments(message: string) {
  const gsmLike = /^[\x20-\x7E\n\r]*$/.test(message);
  const single = gsmLike ? 160 : 70;
  const joined = gsmLike ? 153 : 67;
  const units = message.length <= single ? 1 : Math.max(1, Math.ceil(message.length / joined));
  return { units, encoding: gsmLike ? "GSM/ASCII" : "Unicode" };
}

function statusLabel(status: AdminSmsCampaign["status"]) {
  if (status === "draft") return "Draft";
  if (status === "sending") return "Yuborilmoqda";
  if (status === "completed") return "Tugagan";
  return "Bekor qilingan";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function campaignPending(campaign: AdminSmsCampaign) {
  return Math.max(0, campaign.recipient_count - campaign.sent_count - campaign.failed_count);
}

export default function AdminSmsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [campaigns, setCampaigns] = useState<AdminSmsCampaign[]>([]);
  const [selected, setSelected] = useState<AdminSmsCampaign | null>(null);
  const [recipients, setRecipients] = useState<AdminSmsRecipient[]>([]);
  const [name, setName] = useState("Namangan turfirmalari");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [recipientText, setRecipientText] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const stopRef = useRef(false);

  const preview = useMemo(() => parsePhones(recipientText), [recipientText]);
  const segmentInfo = useMemo(() => smsSegments(message), [message]);
  const estimatedUnits = preview.phones.length * segmentInfo.units;
  const failedRecipients = recipients.filter((item) => item.status === "failed");

  function upsertCampaign(campaign: AdminSmsCampaign) {
    setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    setSelected((current) => current?.id === campaign.id ? campaign : current);
  }

  async function loadCampaigns() {
    const data = await listSmsCampaigns();
    setCampaigns(data.campaigns);
  }

  async function openCampaign(id: string) {
    setError("");
    try {
      const data = await getSmsCampaign(id);
      setSelected(data.campaign);
      setRecipients(data.recipients);
      upsertCampaign(data.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kampaniyani yuklab bo‘lmadi.");
    }
  }

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(stored);
      getCurrentProfile()
        .then((profile) => {
          if (profile?.role !== "admin") { window.location.replace("/dashboard"); return null; }
          return listSmsCampaigns();
        })
        .then((data) => { if (data) setCampaigns(data.campaigns); })
        .catch(() => setError("SMS kampaniyalarini yuklab bo‘lmadi."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1024 * 1024) { setError("Fayl juda katta. 1 MB gacha CSV/TXT ishlating."); return; }
    try {
      const text = await file.text();
      setRecipientText((current) => current ? `${current}\n${text}` : text);
      setNotice(`${file.name} qo‘shildi. Server yuborishdan oldin raqamlarni yana tekshiradi.`);
    } catch {
      setError("Faylni o‘qib bo‘lmadi. CSV/TXT yoki Excel'dan nusxa ko‘chirib joylang.");
    }
  }

  async function handleCreate() {
    setError(""); setNotice("");
    if (!preview.phones.length) { setError("Kamida bitta yaroqli mobil raqam kiriting."); return; }
    if (!name.trim()) { setError("Kampaniya nomini kiriting."); return; }
    if (!message.trim() || message.length > 480) { setError("SMS matni 1-480 belgi bo‘lishi kerak."); return; }
    setCreating(true);
    try {
      const data = await createSmsCampaign({ name: name.trim(), message: message.trim(), recipients: preview.phones });
      upsertCampaign(data.campaign);
      setSelected(data.campaign);
      const detail = await getSmsCampaign(data.campaign.id);
      setRecipients(detail.recipients);
      setRecipientText("");
      setConsentConfirmed(false);
      setNotice(`Draft yaratildi: ${data.accepted ?? data.campaign.recipient_count} ta unique mobil raqam. Hali SMS yuborilmadi.`);
      await loadCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kampaniya yaratilmadi.");
    } finally {
      setCreating(false);
    }
  }

  async function runSending(campaign: AdminSmsCampaign, askConfirmation = true) {
    if (!consentConfirmed) { setError("Yuborishdan oldin biznes kontaktlari/marketing ruxsatini tasdiqlang."); return; }
    if (askConfirmation && !window.confirm(`${campaign.recipient_count} ta raqamli kampaniyani ESKIZ orqali yuborishni boshlaysizmi?`)) return;

    stopRef.current = false;
    setSending(true); setError(""); setNotice("Yuborish boshlandi. Bu sahifani yopmang.");
    try {
      let current = campaign;
      for (let guard = 0; guard < 500 && !stopRef.current; guard += 1) {
        const result = await sendSmsCampaignBatch(current.id);
        current = result.campaign;
        upsertCampaign(current);
        setNotice(`Yuborildi: ${current.sent_count}/${current.recipient_count}. Xato: ${current.failed_count}. Navbat: ${result.pending_count ?? campaignPending(current)}.`);
        if ((result.pending_count ?? campaignPending(current)) === 0) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      await openCampaign(current.id);
      if (stopRef.current) setNotice("Yuborish shu qurilmada to‘xtatildi. Kampaniyani keyin davom ettirish mumkin.");
      else setNotice(`Kampaniya yakunlandi. Yuborildi: ${current.sent_count}, xato: ${current.failed_count}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMS yuborishda xatolik yuz berdi.");
    } finally {
      setSending(false);
    }
  }

  async function handleRetryFailed() {
    if (!selected || selected.failed_count === 0) return;
    if (!consentConfirmed) { setError("Qayta yuborishdan oldin biznes kontaktlari/marketing ruxsatini tasdiqlang."); return; }
    if (!window.confirm(`${selected.failed_count} ta xato SMSni qayta yuborishga tayyorlaysizmi?`)) return;
    setSending(true); setError("");
    try {
      const reset = await retryFailedSms(selected.id);
      upsertCampaign(reset.campaign);
      setSending(false);
      await runSending(reset.campaign, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Qayta yuborish boshlanmadi.");
      setSending(false);
    }
  }

  return <AppShell session={session} activePath="/admin">
    <div className="mx-auto max-w-7xl pb-16">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Admin / SMS</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">SMS rassilka</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500">ESKIZ orqali admin-only SMS kampaniya. Draft yaratilmaguncha va alohida tasdiqlanmaguncha hech qanday SMS yuborilmaydi.</p>
        </header>
        <Link href="/admin" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-[#0b1f3a] hover:bg-slate-50">← Admin panel</Link>
      </div>

      {loading && <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">SMS moduli yuklanmoqda...</div>}
      {error && <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
      {notice && <p className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-800">{notice}</p>}

      {!loading && <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-semibold text-[#0b1f3a]">Yangi kampaniya</h2>
          <p className="mt-2 text-sm text-slate-500">Excel ustunidan raqamlarni nusxa ko‘chirib joylang yoki CSV/TXT yuklang. Dublikatlar avtomatik olib tashlanadi.</p>

          <label className="mt-6 block text-sm font-semibold text-[#0b1f3a]">Kampaniya nomi
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          </label>

          <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]">SMS matni
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={5} maxLength={480} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          </label>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span>{message.length}/480 belgi</span><span>{segmentInfo.encoding}</span><span>≈ {segmentInfo.units} SMS segment / raqam</span></div>

          <label className="mt-5 block text-sm font-semibold text-[#0b1f3a]">Telefon raqamlar
            <textarea value={recipientText} onChange={(event) => setRecipientText(event.target.value)} rows={9} placeholder={"+998901234567\n+998911234567\n..."} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-mono text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">CSV/TXT qo‘shish<input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(event) => void handleFile(event.target.files?.[0])} /></label>
            <span className="text-sm text-slate-500">Unique mobil: <strong className="text-[#0b1f3a]">{preview.phones.length}</strong>{preview.rejected ? ` · tekshirilmagan token: ${preview.rejected}` : ""}</span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Qabul qilinadigan raqam</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{preview.phones.length}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Segment / raqam</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{segmentInfo.units}</p></div>
            <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Taxminiy SMS unit</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{estimatedUnits}</p></div>
          </div>

          <button type="button" onClick={() => void handleCreate()} disabled={creating || !preview.phones.length} className="mt-6 w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{creating ? "Draft yaratilmoqda..." : "Draft kampaniya yaratish"}</button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-semibold text-[#0b1f3a]">Kampaniyalar</h2><p className="mt-1 text-sm text-slate-500">So‘nggi 50 ta kampaniya</p></div><button type="button" onClick={() => void loadCampaigns()} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Yangilash</button></div>
          <div className="mt-5 space-y-3">{campaigns.map((campaign) => <button key={campaign.id} type="button" onClick={() => void openCampaign(campaign.id)} className={`w-full rounded-xl border p-4 text-left transition ${selected?.id === campaign.id ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#0b1f3a]">{campaign.name}</p><p className="mt-1 text-xs text-slate-500">{formatDate(campaign.created_at)}</p></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{statusLabel(campaign.status)}</span></div>
            <p className="mt-3 text-xs text-slate-500">Jami {campaign.recipient_count} · yuborildi {campaign.sent_count} · xato {campaign.failed_count}</p>
          </button>)}{campaigns.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Hozircha kampaniya yo‘q.</p>}</div>
        </section>
      </div>}

      {selected && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Tanlangan kampaniya</p><h2 className="mt-2 text-2xl font-semibold text-[#0b1f3a]">{selected.name}</h2><p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm text-slate-600">{selected.message}</p></div><span className="w-fit rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700">{statusLabel(selected.status)}</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Jami</p><p className="mt-1 text-2xl font-semibold">{selected.recipient_count}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Yuborildi</p><p className="mt-1 text-2xl font-semibold text-emerald-800">{selected.sent_count}</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Navbat</p><p className="mt-1 text-2xl font-semibold text-amber-800">{campaignPending(selected)}</p></div><div className="rounded-xl bg-red-50 p-4"><p className="text-xs text-red-700">Xato</p><p className="mt-1 text-2xl font-semibold text-red-800">{selected.failed_count}</p></div></div>

        <label className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><input type="checkbox" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4" /><span>Bu kampaniyadagi raqamlar biznes kontaktlari ekanini va marketing SMS yuborish uchun foydalanish mumkinligini tasdiqlayman.</span></label>

        <div className="mt-5 flex flex-wrap gap-3">
          {(selected.status === "draft" || selected.status === "sending") && campaignPending(selected) > 0 && <button type="button" disabled={sending} onClick={() => void runSending(selected)} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{sending ? "Yuborilmoqda..." : selected.status === "draft" ? "ESKIZ orqali yuborishni boshlash" : "Yuborishni davom ettirish"}</button>}
          {sending && <button type="button" onClick={() => { stopRef.current = true; }} className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800">Shu qurilmada to‘xtatish</button>}
          {selected.failed_count > 0 && !sending && <button type="button" onClick={() => void handleRetryFailed()} className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-100">Xato {selected.failed_count} ta SMSni qayta yuborish</button>}
          <button type="button" onClick={() => void openCampaign(selected.id)} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">Holatni yangilash</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Batch hajmi serverda 5 ta. Brauzer navbat tugaguncha keyingi batchni chaqiradi; yuborilgan raqam qayta yuborilmaydi.</p>

        {failedRecipients.length > 0 && <div className="mt-7"><h3 className="font-semibold text-[#0b1f3a]">Xato raqamlar</h3><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400"><tr><th className="pb-3">Telefon</th><th className="pb-3">Urinish</th><th className="pb-3">Sabab</th></tr></thead><tbody>{failedRecipients.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-mono">+{item.phone}</td><td className="py-3">{item.attempts}</td><td className="py-3 text-xs text-red-700">{item.failure_reason || "Noma’lum"}</td></tr>)}</tbody></table></div></div>}
      </section>}
    </div>
  </AppShell>;
}
