"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getOrCreateSupportChat, getSupportContact, type SupportContact } from "@/lib/support-api";

export default function SupportPage() {
  const router = useRouter();
  const [session] = useState<AuthSession | null>(() => getStoredSession());
  const [contact, setContact] = useState<SupportContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) { window.location.replace("/login?next=/support"); return; }
    getSupportContact().then(setContact).catch(() => setError("Administrator aloqa ma’lumotlarini yuklab bo‘lmadi.")).finally(() => setLoading(false));
  }, []);

  async function openOperatorChat() {
    if (opening) return;
    setOpening(true); setError("");
    try {
      const roomId = await getOrCreateSupportChat();
      if (!roomId) throw new Error("ROOM_MISSING");
      router.push(`/messenger/${roomId}`);
    } catch {
      setError("Operator chatini ochib bo‘lmadi. Qayta urinib ko‘ring.");
      setOpening(false);
    }
  }

  return <AppShell session={session} activePath="/support"><div className="mx-auto max-w-4xl">
    <header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Yordam</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Admin bilan aloqa</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Platforma, balans, tarif, bitim yoki tasdiqlash bo‘yicha administratorga bevosita murojaat qiling.</p></header>
    {error && <p role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
    {loading ? <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 shadow-sm">Aloqa ma’lumotlari yuklanmoqda...</div> : <div className="mt-8 grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Administrator</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">{contact?.full_name || "Administrator"}</h2><p className="mt-1 text-sm text-slate-500">{contact?.company_name || "My Agent Air"}</p><div className="mt-6 space-y-3 text-sm">{contact?.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="block rounded-xl border border-slate-200 px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50">☎ {contact.phone}</a>}{contact?.email && <a href={`mailto:${contact.email}`} className="block rounded-xl border border-slate-200 px-4 py-3 font-semibold text-blue-700 hover:bg-blue-50">✉ {contact.email}</a>}</div></section>
      <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">Operator chat</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Ichki tizimda yozing</h2><p className="mt-3 text-sm leading-6 text-slate-600">Murojaatingiz platformadagi private chatda administratorga tushadi. Telefon yoki email yuborishga hojat yo‘q — akkauntingiz avtomatik aniqlanadi.</p><button type="button" onClick={openOperatorChat} disabled={opening || !contact?.ok} className="mt-6 w-full rounded-xl bg-[#0b1f3a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60">{opening ? "Chat ochilmoqda..." : "💬 Operatorga yozish"}</button></section>
    </div>}
    <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900"><strong>Muhim:</strong> parol, Click maxfiy kaliti yoki SMS kod kabi maxfiy ma’lumotlarni chatga yubormang.</section>
  </div></AppShell>;
}
