"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getAgent, type AgentRecord } from "@/app/agents/agents-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

function initials(agent: AgentRecord) {
  return (agent.full_name || agent.company_name || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

function Avatar({ agent }: { agent: AgentRecord }) {
  return agent.avatar_url ? <Image src={agent.avatar_url} alt={agent.full_name || "Agent avatari"} width={112} height={112} unoptimized className="h-28 w-28 rounded-3xl object-cover" /> : <span aria-hidden="true" className="flex h-28 w-28 items-center justify-center rounded-3xl bg-blue-100 text-3xl font-bold text-blue-700">{initials(agent)}</span>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-[#0b1f3a]">{value}</dd></div>;
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      getAgent(params.id).then((loadedAgent) => {
        if (!loadedAgent) throw new Error("AGENT_NOT_FOUND");
        setAgent(loadedAgent);
      }).catch((loadError: unknown) => {
        if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setError(loadError instanceof Error && loadError.message === "AGENT_NOT_FOUND" ? "Bu agent topilmadi yoki faol emas." : "Agent profilini yuklashda xatolik yuz berdi.");
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [params.id]);

  const isCurrentUser = Boolean(agent && session && agent.id === session.user.id);
  return <AppShell session={session} activePath="/agents">{isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Agent profili yuklanmoqda...</div>}{!isLoading && error && <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/agents" className="ml-2 font-semibold underline">Agentlarga qaytish</Link></div>}{!isLoading && agent && <div className="mx-auto max-w-4xl"><Link href="/agents" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Agentlarga qaytish</Link><section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><div className="flex flex-col gap-6 sm:flex-row sm:items-start"><Avatar agent={agent} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight text-[#0b1f3a]">{agent.full_name || "Ism ko‘rsatilmagan"}</h1>{isCurrentUser && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Bu sizning profilingiz</span>}{agent.is_verified && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Tasdiqlangan agent</span>}</div><p className="mt-2 text-lg text-slate-500">{agent.company_name || "Kompaniya ko‘rsatilmagan"}</p><p className="mt-2 text-sm text-slate-500">{agent.city || "Shahar ko‘rsatilmagan"}</p>{isCurrentUser && <Link href="/profile" className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Profilni tahrirlash</Link>}{!isCurrentUser && agent.phone && <a href={`tel:${agent.phone}`} className="mt-5 inline-flex rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">{agent.phone} ga qo‘ng‘iroq qilish</a>}</div></div><dl className="mt-8 grid gap-6 border-t border-slate-100 pt-7 sm:grid-cols-2"><DetailItem label="Agent turi" value={agent.agent_type || "Ko‘rsatilmagan"} /><DetailItem label="Telefon" value={agent.phone || "Ko‘rsatilmagan"} /><DetailItem label="Shahar" value={agent.city || "Ko‘rsatilmagan"} /><DetailItem label="Platformaga qo‘shilgan" value={formatDate(agent.created_at)} /></dl><div className="mt-8 border-t border-slate-100 pt-7"><h2 className="text-lg font-semibold text-[#0b1f3a]">Xizmatlar</h2>{agent.services?.length ? <div className="mt-4 flex flex-wrap gap-2">{agent.services.map((service) => <span key={service} className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">{service}</span>)}</div> : <p className="mt-3 text-sm text-slate-500">Xizmatlar ko‘rsatilmagan.</p>}</div></section></div>}</AppShell>;
}
