"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getCurrentProfile } from "@/app/profile/profile-api";
import {
  listAdminBillingAccounts,
  listAdminBillingFees,
  listAdminBillingSettlements,
  recordAdminBillingSettlement,
  type AdminBillingAccount,
  type AdminBillingFee,
  type AdminBillingSettlement,
} from "@/app/admin/billing/admin-billing-api";

function money(value: number) { return `${Number(value || 0).toLocaleString("uz-UZ")} UZS`; }
function date(value: string | null) { return value ? new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"; }
function name(account: AdminBillingAccount) { return account.full_name || account.company_name || "Foydalanuvchi"; }

export default function AdminBillingPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [accounts, setAccounts] = useState<AdminBillingAccount[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [fees, setFees] = useState<AdminBillingFee[]>([]);
  const [settlements, setSettlements] = useState<AdminBillingSettlement[]>([]);
  const [selectedFeeIds, setSelectedFeeIds] = useState<string[]>([]);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "click" | "payme" | "other">("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refreshAccounts() {
    const [nextAccounts, nextSettlements] = await Promise.all([listAdminBillingAccounts(), listAdminBillingSettlements()]);
    setAccounts(nextAccounts);
    setSettlements(nextSettlements);
  }

  async function loadUser(userId: string) {
    setSelectedUserId(userId);
    setSelectedFeeIds([]);
    setDetailLoading(true);
    setError("");
    try {
      setFees(await listAdminBillingFees(userId));
    } catch {
      setError("Agent hisobini yuklab bo‘lmadi.");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(stored);
      getCurrentProfile().then((profile) => {
        if (profile?.role !== "admin") { window.location.replace("/dashboard"); return null; }
        return Promise.all([listAdminBillingAccounts(), listAdminBillingSettlements()]);
      }).then((result) => {
        if (!result) return;
        setAccounts(result[0]);
        setSettlements(result[1]);
      }).catch(() => setError("Billing ma’lumotlarini yuklashda xatolik yuz berdi.")).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const selectedAccount = accounts.find((item) => item.user_id === selectedUserId) || null;
  const pendingFees = fees.filter((fee) => fee.fee_status === "pending");
  const selectedAmount = fees.filter((fee) => selectedFeeIds.includes(fee.fee_id)).reduce((sum, fee) => sum + fee.fee_amount, 0);
  const visibleAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((account) => !q || [account.full_name, account.company_name, account.city, account.agent_type].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [accounts, search]);

  async function submit(kind: "payment" | "waiver") {
    if (!selectedUserId || selectedFeeIds.length === 0) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await recordAdminBillingSettlement({ userId: selectedUserId, feeIds: selectedFeeIds, kind, method, reference, note });
      setSuccess(kind === "payment" ? "To‘lov muvaffaqiyatli qayd etildi." : "Tanlangan qarzdorlik hisobdan chiqarildi.");
      setReference(""); setNote(""); setSelectedFeeIds([]);
      await Promise.all([refreshAccounts(), loadUser(selectedUserId)]);
    } catch {
      setError("Amal bajarilmadi. Tanlangan qarzdorlik holatini qayta tekshiring.");
    } finally {
      setSaving(false);
    }
  }

  return <AppShell session={session} activePath="/admin">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">P5 · Billing</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">To‘lovlar boshqaruvi</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Qarzdorliklarni ko‘ring, to‘lovni yoki waiver holatini admin tomonidan qayd eting.</p></header>
        <Link href="/admin" className="w-fit rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">← Admin panel</Link>
      </div>

      {loading && <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">Billing yuklanmoqda...</div>}
      {error && <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div>}

      {!loading && <div className="mt-7 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Agentlar</p><h2 className="mt-1 text-xl font-semibold text-[#0b1f3a]">Hisoblar</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{accounts.length}</span></div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ism, kompaniya, shahar..." className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto pr-1">{visibleAccounts.map((account) => <button key={account.user_id} type="button" onClick={() => loadUser(account.user_id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedUserId === account.user_id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}>
            <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#0b1f3a]">{name(account)}</p><p className="mt-1 text-xs text-slate-500">{account.company_name || "Kompaniya ko‘rsatilmagan"} · {account.agent_type || "Agent"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${account.outstanding_amount > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{money(account.outstanding_amount)}</span></div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500"><span>Pending: {account.pending_count}</span><span>Paid: {account.paid_count}</span><span>Waived: {account.waived_count}</span></div>
          </button>)}</div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {!selectedAccount ? <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-slate-500"><div><p className="font-semibold text-[#0b1f3a]">Agentni tanlang</p><p className="mt-2">Chap tomondagi hisob ustiga bosing.</p></div></div> : <>
            <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Tanlangan hisob</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{name(selectedAccount)}</h2><p className="mt-1 text-sm text-slate-500">{selectedAccount.company_name || "—"} · {selectedAccount.city || "—"} · {selectedAccount.agent_type || "Agent"}</p></div><div className="rounded-2xl bg-amber-50 px-4 py-3 text-right"><p className="text-xs font-semibold text-amber-600">Qarzdorlik</p><p className="mt-1 text-xl font-bold text-amber-800">{money(selectedAccount.outstanding_amount)}</p></div></div>

            {detailLoading ? <div className="py-14 text-center text-sm text-slate-500">Hisob yuklanmoqda...</div> : <>
              <div className="mt-5 flex items-center justify-between gap-3"><h3 className="font-semibold text-[#0b1f3a]">Pending bitimlar</h3>{pendingFees.length > 0 && <button type="button" onClick={() => setSelectedFeeIds(selectedFeeIds.length === pendingFees.length ? [] : pendingFees.map((fee) => fee.fee_id))} className="text-xs font-semibold text-blue-600">{selectedFeeIds.length === pendingFees.length ? "Bekor qilish" : "Barchasini tanlash"}</button>}</div>
              <div className="mt-3 space-y-2">{pendingFees.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Pending qarzdorlik yo‘q.</div> : pendingFees.map((fee) => <label key={fee.fee_id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 hover:border-blue-200"><input type="checkbox" checked={selectedFeeIds.includes(fee.fee_id)} onChange={(e) => setSelectedFeeIds((current) => e.target.checked ? [...current, fee.fee_id] : current.filter((id) => id !== fee.fee_id))} className="mt-1 h-4 w-4" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium text-[#0b1f3a]">{[fee.origin, fee.destination].filter(Boolean).join(" → ") || fee.category || "Bitim"}</p><p className="mt-1 text-xs text-slate-500">#{fee.monthly_sequence} · {date(fee.deal_completed_at)}</p></div><p className="font-bold text-amber-700">{money(fee.fee_amount)}</p></div></div></label>)}</div>

              {selectedFeeIds.length > 0 && <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold text-[#0b1f3a]">Tanlandi: {selectedFeeIds.length}</p><p className="text-lg font-bold text-blue-700">{money(selectedAmount)}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">To‘lov usuli<select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value="bank_transfer">Bank o‘tkazma</option><option value="cash">Naqd</option><option value="click">Click</option><option value="payme">Payme</option><option value="other">Boshqa</option></select></label><label className="text-xs font-semibold text-slate-600">Tranzaksiya / izoh raqami<input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Ixtiyoriy" /></label></div><label className="mt-3 block text-xs font-semibold text-slate-600">Admin izohi<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Ixtiyoriy" /></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => submit("payment")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{saving ? "Saqlanmoqda..." : "To‘landi deb belgilash"}</button><button type="button" disabled={saving} onClick={() => submit("waiver")} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60">Hisobdan chiqarish</button></div></div>}

              <div className="mt-7 border-t border-slate-100 pt-5"><h3 className="font-semibold text-[#0b1f3a]">So‘nggi settlementlar</h3><div className="mt-3 space-y-2">{settlements.filter((item) => item.user_id === selectedUserId).slice(0, 8).map((item) => <div key={item.settlement_id} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[#0b1f3a]">{item.kind === "payment" ? "To‘lov" : "Waiver"} · {item.fee_count} ta bitim</p><p className="mt-1 text-xs text-slate-500">{date(item.created_at)} · {item.recorded_by_name}</p></div><p className="font-bold text-slate-800">{money(item.amount)}</p></div>{item.reference && <p className="mt-2 text-xs text-slate-500">Ref: {item.reference}</p>}{item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}</div>)}</div></div>
            </>}
          </>}
        </section>
      </div>}
    </div>
  </AppShell>;
}
