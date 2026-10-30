"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getCurrentProfile } from "@/app/profile/profile-api";
import {
  listMarketingLeads,
  updateMarketingLead,
  type MarketingLead,
  type MarketingLeadStatus,
} from "./leads-api";

const statusOptions: Array<{ value: MarketingLeadStatus; label: string }> = [
  { value: "new", label: "Yangi" },
  { value: "contacted", label: "Bog‘lanildi" },
  { value: "qualified", label: "Malakali" },
  { value: "won", label: "Sotuv" },
  { value: "lost", label: "Yo‘qotildi" },
  { value: "spam", label: "Spam" },
];

const statusClasses: Record<MarketingLeadStatus, string> = {
  new: "bg-blue-50 text-blue-700",
  contacted: "bg-cyan-50 text-cyan-700",
  qualified: "bg-violet-50 text-violet-700",
  won: "bg-emerald-50 text-emerald-700",
  lost: "bg-slate-100 text-slate-600",
  spam: "bg-red-50 text-red-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sourceLabel(lead: MarketingLead) {
  if (lead.platform === "instagram") return "Instagram";
  if (lead.platform === "facebook") return "Facebook";
  if (lead.source === "meta" || lead.platform === "meta") return "Meta";
  return lead.platform || lead.source || "—";
}

export default function AdminMarketingLeadsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [leads, setLeads] = useState<MarketingLead[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MarketingLeadStatus | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});

  const load = useCallback(async (nextSearch = search, nextStatus = status) => {
    setLoading(true);
    setError("");
    try {
      const rows = await listMarketingLeads({ search: nextSearch, status: nextStatus, limit: 200 });
      setLeads(rows);
      setDraftNotes(Object.fromEntries(rows.map((lead) => [lead.id, lead.notes || ""])));
    } catch {
      setError("Marketing leadlarini yuklab bo‘lmadi. Admin huquqi va ulanishni tekshiring.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    getCurrentProfile().then((profile) => {
      if (profile?.role !== "admin") { window.location.replace("/dashboard"); return; }
      setSession(stored);
      return listMarketingLeads({ limit: 200 });
    }).then((rows) => {
      if (!rows) return;
      setLeads(rows);
      setDraftNotes(Object.fromEntries(rows.map((lead) => [lead.id, lead.notes || ""])));
    }).catch(() => setError("Marketing leadlarini yuklab bo‘lmadi. Admin huquqi va ulanishni tekshiring."))
      .finally(() => setLoading(false));
  }, []);

  const counts = useMemo(() => {
    const result = Object.fromEntries(statusOptions.map((item) => [item.value, 0])) as Record<MarketingLeadStatus, number>;
    for (const lead of leads) result[lead.status] += 1;
    return result;
  }, [leads]);

  async function changeStatus(lead: MarketingLead, nextStatus: MarketingLeadStatus) {
    if (savingId) return;
    setSavingId(lead.id);
    setError("");
    try {
      const updated = await updateMarketingLead(lead.id, nextStatus, draftNotes[lead.id] || "");
      if (!updated) throw new Error("EMPTY_UPDATE");
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, ...updated } : item));
    } catch {
      setError("Lead holatini saqlab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveNote(lead: MarketingLead) {
    if (savingId) return;
    setSavingId(lead.id);
    setError("");
    try {
      const updated = await updateMarketingLead(lead.id, lead.status, draftNotes[lead.id] || "");
      if (!updated) throw new Error("EMPTY_UPDATE");
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, ...updated } : item));
    } catch {
      setError("Izohni saqlab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      setSavingId(null);
    }
  }

  return <AppShell session={session} activePath="/admin">
    <div className="mx-auto max-w-7xl">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">CRM</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Marketing leadlar</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Instagram va Facebook reklamasidan kelgan so‘rovlarni bir joyda ko‘ring, holatini yangilang va operator izohini saqlang.</p>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {statusOptions.map((item) => <div key={item.value} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-[#0b1f3a]">{counts[item.value]}</p>
        </div>)}
      </section>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex-1 text-sm font-semibold text-[#0b1f3a]">Qidirish
            <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} placeholder="Ism, telefon yoki kampaniya" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          </label>
          <label className="text-sm font-semibold text-[#0b1f3a]">Holat
            <select value={status} onChange={(event) => setStatus(event.target.value as MarketingLeadStatus | "")} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal md:w-48">
              <option value="">Barchasi</option>
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">Filtrlash</button>
        </div>
      </section>

      {error && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
      {loading && <div className="flex min-h-[30vh] items-center justify-center text-sm text-slate-500">Leadlar yuklanmoqda...</div>}

      {!loading && <section className="mt-6 space-y-4">
        {leads.map((lead) => <article key={lead.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[#0b1f3a]">{lead.full_name || "Ism ko‘rsatilmagan"}</h2>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses[lead.status]}`}>{statusOptions.find((item) => item.value === lead.status)?.label || lead.status}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{sourceLabel(lead)}</span>
              </div>
              <div className="mt-4 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Telefon</p><p className="mt-1 font-medium text-slate-700">{lead.phone || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Kampaniya</p><p className="mt-1 font-medium text-slate-700">{lead.campaign_name || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Safar vaqti</p><p className="mt-1 font-medium text-slate-700">{lead.preferred_travel || "—"}</p></div>
                <div><p className="text-xs uppercase tracking-wide text-slate-400">Kelgan vaqt</p><p className="mt-1 font-medium text-slate-700">{formatDate(lead.received_at)}</p></div>
              </div>
            </div>
            <label className="block text-sm font-semibold text-[#0b1f3a] xl:w-52">Holatni o‘zgartirish
              <select value={lead.status} disabled={savingId === lead.id} onChange={(event) => void changeStatus(lead, event.target.value as MarketingLeadStatus)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal disabled:opacity-60">
                {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="flex-1 text-sm font-semibold text-[#0b1f3a]">Operator izohi
              <textarea value={draftNotes[lead.id] || ""} onChange={(event) => setDraftNotes((current) => ({ ...current, [lead.id]: event.target.value }))} rows={2} placeholder="Qo‘ng‘iroq natijasi, mijoz talabi yoki keyingi qadam" className="mt-2 w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            </label>
            <button type="button" onClick={() => void saveNote(lead)} disabled={savingId === lead.id} className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{savingId === lead.id ? "Saqlanmoqda..." : "Izohni saqlash"}</button>
          </div>
        </article>)}
        {leads.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Hozircha filtrga mos marketing lead yo‘q.</div>}
      </section>}
    </div>
  </AppShell>;
}
