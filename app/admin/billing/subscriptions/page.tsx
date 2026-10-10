"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getCurrentProfile } from "@/app/profile/profile-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import {
  activateAdminSubscription,
  getAdminSubscriptionPlan,
  listAdminSubscriptions,
  listAdminSubscriptionUsers,
  setAdminSubscriptionPlan,
  type AdminSubscriptionPlan,
  type AdminSubscriptionRecord,
  type AdminSubscriptionUser,
} from "@/app/admin/billing/subscriptions/admin-subscription-api";

function money(value: number | null) {
  return value === null ? "—" : `${Number(value).toLocaleString("uz-UZ")} UZS`;
}

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

function displayName(user: AdminSubscriptionUser) {
  return user.full_name || user.company_name || "Foydalanuvchi";
}

export default function AdminBillingSubscriptionsPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [plan, setPlan] = useState<AdminSubscriptionPlan | null>(null);
  const [users, setUsers] = useState<AdminSubscriptionUser[]>([]);
  const [history, setHistory] = useState<AdminSubscriptionRecord[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [search, setSearch] = useState("");
  const [price, setPrice] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [planActive, setPlanActive] = useState(false);
  const [method, setMethod] = useState<"cash" | "bank_transfer" | "click" | "payme" | "other">("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingPlan, setSavingPlan] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function refresh() {
    const [nextPlan, nextUsers, nextHistory] = await Promise.all([
      getAdminSubscriptionPlan(),
      listAdminSubscriptionUsers(),
      listAdminSubscriptions(),
    ]);
    setPlan(nextPlan);
    setUsers(nextUsers);
    setHistory(nextHistory);
    if (nextPlan) {
      setPrice(nextPlan.price_amount === null ? "" : String(nextPlan.price_amount));
      setDurationDays(String(nextPlan.duration_days));
      setPlanActive(nextPlan.is_active);
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
          return refresh();
        })
        .catch(() => setError("Abonent tarifi ma’lumotlarini yuklashda xatolik yuz berdi."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => !q || [user.full_name, user.company_name, user.city, user.agent_type].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [users, search]);

  const selectedUser = users.find((user) => user.user_id === selectedUserId) || null;
  const selectedHistory = history.filter((item) => item.user_id === selectedUserId).slice(0, 12);
  const hasCurrentSubscription = Boolean(selectedUser?.current_ends_at && new Date(selectedUser.current_ends_at).getTime() > Date.now());

  async function savePlan() {
    const priceAmount = Number(price);
    const days = Number(durationDays);
    if (!Number.isInteger(priceAmount) || priceAmount <= 0 || !Number.isInteger(days) || days < 1 || days > 366) {
      setError("Narx va muddatni to‘g‘ri kiriting.");
      return;
    }
    setSavingPlan(true);
    setError("");
    setSuccess("");
    try {
      await setAdminSubscriptionPlan({ priceAmount, durationDays: days, isActive: planActive });
      await refresh();
      setSuccess("Oylik Unlimited tarif sozlamalari saqlandi.");
    } catch {
      setError("Tarif sozlamalarini saqlab bo‘lmadi.");
    } finally {
      setSavingPlan(false);
    }
  }

  async function activate() {
    if (!selectedUserId || !plan?.is_active || !plan.price_amount) return;
    setActivating(true);
    setError("");
    setSuccess("");
    try {
      await activateAdminSubscription({ userId: selectedUserId, method, reference, note });
      setReference("");
      setNote("");
      await refresh();
      setSuccess("Abonent tarifi muvaffaqiyatli faollashtirildi. Agar oldingi muddat faol bo‘lsa, yangi davr uning oxiridan davom etadi.");
    } catch {
      setError("Abonent tarifini faollashtirib bo‘lmadi. Tarif holati va foydalanuvchini qayta tekshiring.");
    } finally {
      setActivating(false);
    }
  }

  return <AppShell session={session} activePath="/admin">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">P5 · Unlimited</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Oylik abonent tarifi</h1><p className="mt-2 max-w-2xl text-sm text-slate-500">Unlimited tarif narxi va muddatini boshqaring, foydalanuvchilarga abonent davrini faollashtiring.</p></header>
        <div className="flex flex-wrap gap-2"><Link href="/admin/billing" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Per-deal to‘lovlar</Link><Link href="/admin" className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">← Admin panel</Link></div>
      </div>

      {loading && <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">Abonent tarifi yuklanmoqda...</div>}
      {error && <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
      {success && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div>}

      {!loading && <>
        <section className="mt-7 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Tarif sozlamasi</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Oylik Unlimited</h2><p className="mt-2 text-sm text-slate-500">Narxni o‘zgartirish faqat keyingi yangi abonent to‘lovlariga ta’sir qiladi; oldingi yozuvlar o‘zgarmaydi.</p></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold ${plan?.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{plan?.is_active ? "FAOL" : "O‘CHIQ"}</span></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-sm font-semibold text-slate-700">Narx, UZS<input inputMode="numeric" value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ""))} placeholder="Masalan: 100000" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label className="text-sm font-semibold text-slate-700">Muddat, kun<input inputMode="numeric" value={durationDays} onChange={(event) => setDurationDays(event.target.value.replace(/[^0-9]/g, ""))} className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label className="flex h-[46px] items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"><input type="checkbox" checked={planActive} onChange={(event) => setPlanActive(event.target.checked)} className="h-4 w-4" />Faol</label></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Hozirgi qiymat: {money(plan?.price_amount ?? null)} / {plan?.duration_days || 30} kun</p><button type="button" disabled={savingPlan} onClick={savePlan} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{savingPlan ? "Saqlanmoqda..." : "Tarifni saqlash"}</button></div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Foydalanuvchilar</p><h2 className="mt-1 text-xl font-semibold text-[#0b1f3a]">Abonent hisoblari</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{users.length}</span></div>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ism, kompaniya, shahar..." className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
            <div className="mt-4 max-h-[650px] space-y-2 overflow-y-auto pr-1">{visibleUsers.map((user) => {
              const active = Boolean(user.current_ends_at && new Date(user.current_ends_at).getTime() > Date.now());
              return <button key={user.user_id} type="button" onClick={() => setSelectedUserId(user.user_id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedUserId === user.user_id ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-200"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#0b1f3a]">{displayName(user)}</p><p className="mt-1 text-xs text-slate-500">{user.company_name || "Kompaniya ko‘rsatilmagan"} · {user.agent_type || "Agent"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{active ? "Unlimited" : "Per-deal"}</span></div>{user.current_ends_at && <p className="mt-3 text-xs text-slate-500">Muddat: {date(user.current_ends_at)}</p>}</button>;
            })}</div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            {!selectedUser ? <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-slate-500"><div><p className="font-semibold text-[#0b1f3a]">Foydalanuvchini tanlang</p><p className="mt-2">Chap tomondagi hisob ustiga bosing.</p></div></div> : <>
              <div className="flex flex-col justify-between gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-500">Tanlangan hisob</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{displayName(selectedUser)}</h2><p className="mt-1 text-sm text-slate-500">{selectedUser.company_name || "—"} · {selectedUser.city || "—"} · {selectedUser.agent_type || "Agent"}</p></div><div className={`rounded-2xl px-4 py-3 text-right ${hasCurrentSubscription ? "bg-emerald-50" : "bg-slate-50"}`}><p className="text-xs font-semibold text-slate-500">Hozirgi tarif</p><p className={`mt-1 text-lg font-bold ${hasCurrentSubscription ? "text-emerald-700" : "text-slate-700"}`}>{hasCurrentSubscription ? "Unlimited" : "Per-deal"}</p>{selectedUser.current_ends_at && <p className="mt-1 text-xs text-slate-500">{date(selectedUser.current_ends_at)}</p>}</div></div>

              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-[#0b1f3a]">Yangi abonent davri</p><p className="mt-1 text-xs text-slate-500">{money(plan?.price_amount ?? null)} / {plan?.duration_days || 30} kun</p></div>{hasCurrentSubscription && <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Yangi davr mavjud muddat oxiriga qo‘shiladi</span>}</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">To‘lov usuli<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"><option value="bank_transfer">Bank o‘tkazma</option><option value="cash">Naqd</option><option value="click">Click</option><option value="payme">Payme</option><option value="other">Boshqa</option></select></label><label className="text-xs font-semibold text-slate-600">Tranzaksiya / reference<input value={reference} onChange={(event) => setReference(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Ixtiyoriy" /></label></div>
                <label className="mt-3 block text-xs font-semibold text-slate-600">Admin izohi<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal" placeholder="Ixtiyoriy" /></label>
                <button type="button" disabled={activating || !plan?.is_active || !plan.price_amount} onClick={activate} className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{activating ? "Faollashtirilmoqda..." : "Unlimited tarifni faollashtirish"}</button>
                {!plan?.is_active && <p className="mt-3 text-xs text-amber-700">Avval yuqoridagi tarif narxini kiriting va “Faol” holatiga o‘tkazing.</p>}
              </div>

              <div className="mt-7 border-t border-slate-100 pt-5"><h3 className="font-semibold text-[#0b1f3a]">Abonent tarixi</h3><div className="mt-3 space-y-2">{selectedHistory.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Hozircha abonent to‘lovi yo‘q.</div> : selectedHistory.map((item) => <div key={item.subscription_id} className="rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-[#0b1f3a]">Unlimited · {item.method}</p><p className="mt-1 text-xs text-slate-500">{date(item.starts_at)} → {date(item.ends_at)} · {item.recorded_by_name}</p></div><p className="font-bold text-slate-800">{money(item.amount)}</p></div>{item.reference && <p className="mt-2 text-xs text-slate-500">Ref: {item.reference}</p>}{item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}</div>)}</div></div>
            </>}
          </section>
        </div>
      </>}
    </div>
  </AppShell>;
}
