"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getCurrentProfile } from "@/app/profile/profile-api";
import { listAdminSupportThreads, setAdminSupportThreadStatus, type AdminSupportThread } from "@/lib/support-api";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function AdminSupportPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [threads, setThreads] = useState<AdminSupportThread[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "open" | "closed">("");
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const rows = await listAdminSupportThreads();
    setThreads(rows.map((row) => ({ ...row, unread_count: Number(row.unread_count || 0) })));
  }

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login?next=/admin/support"); return; }
    setSession(stored);
    getCurrentProfile().then((profile) => {
      if (profile?.role !== "admin") { window.location.replace("/dashboard"); return; }
      return reload();
    }).catch(() => setError("Operator murojaatlarini yuklab bo‘lmadi.")).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return threads.filter((thread) => {
      const haystack = [thread.full_name, thread.company_name, thread.phone, thread.email, thread.agent_type].filter(Boolean).join(" ").toLowerCase();
      return (!query || haystack.includes(query)) && (!status || thread.status === status);
    });
  }, [threads, search, status]);

  const openCount = threads.filter((thread) => thread.status === "open").length;
  const unreadCount = threads.reduce((sum, thread) => sum + Number(thread.unread_count || 0), 0);

  async function changeStatus(thread: AdminSupportThread) {
    const next = thread.status === "open" ? "closed" : "open";
    setBusyUser(thread.user_id); setError("");
    try {
      await setAdminSupportThreadStatus(thread.user_id, next);
      await reload();
    } catch {
      setError("Murojaat holatini o‘zgartirib bo‘lmadi.");
    } finally {
      setBusyUser("");
    }
  }

  return <AppShell session={session} activePath="/admin"><div className="mx-auto max-w-7xl">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Operator markazi</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Admin bilan aloqa</h1><p className="mt-2 text-sm text-slate-500">Foydalanuvchilarning private murojaatlari va javob berish oynasi.</p></header><Link href="/admin" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-[#0b1f3a] shadow-sm">← Admin</Link></div>
    {error && <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
    <section className="mt-8 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Jami murojaatlar</p><p className="mt-3 text-3xl font-semibold">{threads.length}</p></div><div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-5 shadow-sm"><p className="text-sm text-cyan-700">Ochiq murojaatlar</p><p className="mt-3 text-3xl font-semibold text-cyan-900">{openCount}</p></div><div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm"><p className="text-sm text-rose-700">O‘qilmagan xabarlar</p><p className="mt-3 text-3xl font-semibold text-rose-900">{unreadCount}</p></div></section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex flex-col gap-3 sm:flex-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ism, firma, telefon yoki email" className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"/><select value={status} onChange={(event) => setStatus(event.target.value as "" | "open" | "closed")} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><option value="">Barcha holat</option><option value="open">Ochiq</option><option value="closed">Yopilgan</option></select></div>
      {loading ? <p className="py-10 text-center text-sm text-slate-500">Murojaatlar yuklanmoqda...</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400"><tr><th className="pb-3">Foydalanuvchi</th><th className="pb-3">Aloqa</th><th className="pb-3">So‘nggi xabar</th><th className="pb-3">Holat</th><th className="pb-3">Yangilangan</th><th className="pb-3"/></tr></thead><tbody>{visible.map((thread) => <tr key={thread.user_id} className="border-b border-slate-100 last:border-0"><td className="py-4"><p className="font-semibold text-[#0b1f3a]">{thread.full_name || "Foydalanuvchi"}</p><p className="mt-1 text-xs text-slate-500">{thread.company_name || "Kompaniya yo‘q"} · {thread.agent_type || "—"}</p>{thread.is_verified && <span className="mt-1 inline-block text-xs font-semibold text-emerald-700">✓ Tasdiqlangan</span>}</td><td className="py-4 text-slate-600"><p>{thread.phone || "—"}</p><p className="mt-1 text-xs">{thread.email || "—"}</p></td><td className="max-w-[320px] py-4"><p className="truncate text-slate-700">{thread.last_message || "Hali xabar yo‘q"}</p>{Number(thread.unread_count) > 0 && <span className="mt-1 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{thread.unread_count} yangi</span>}</td><td className="py-4"><span className={thread.status === "open" ? "font-semibold text-cyan-700" : "text-slate-500"}>{thread.status === "open" ? "Ochiq" : "Yopilgan"}</span></td><td className="py-4 text-slate-500">{formatDate(thread.last_message_at || thread.updated_at)}</td><td className="py-4 text-right"><div className="flex justify-end gap-2"><Link href={`/messenger/${thread.room_id}`} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">Javob berish</Link><button type="button" disabled={busyUser===thread.user_id} onClick={() => changeStatus(thread)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">{thread.status === "open" ? "Yopish" : "Qayta ochish"}</button></div></td></tr>)}</tbody></table>{visible.length===0 && <p className="py-10 text-center text-sm text-slate-500">Murojaat topilmadi.</p>}</div>}
    </section>
  </div></AppShell>;
}
