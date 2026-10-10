"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getAgent, type AgentRecord } from "@/app/agents/agents-api";
import { getOrCreateDirectChat } from "@/app/messenger/messenger-api";
import { getAgentTrustStats, listAgentReviews, type AgentReview, type AgentTrustStats } from "@/app/reviews/reviews-api";
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

function trustLabel(score: number) {
  if (score >= 80) return "Yuqori ishonch";
  if (score >= 60) return "Yaxshi ishonch";
  if (score >= 45) return "Ishonch shakllanmoqda";
  return "Yangi profil";
}

function agentIdFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "agents" || !parts[1]) return "";
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

export default function AgentDetailPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [trust, setTrust] = useState<AgentTrustStats | null>(null);
  const [reviews, setReviews] = useState<AgentReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const agentId = agentIdFromLocation();
      if (!agentId) {
        setError("Agent identifikatori topilmadi.");
        setIsLoading(false);
        return;
      }
      const storedSession = getStoredSession();
      if (!storedSession) { window.location.replace("/login"); return; }
      setSession(storedSession);
      getAgent(agentId).then(async (loadedAgent) => {
        if (!loadedAgent) throw new Error("AGENT_NOT_FOUND");
        setAgent(loadedAgent);
        const [loadedTrust, loadedReviews] = await Promise.all([
          getAgentTrustStats(agentId),
          listAgentReviews(agentId, 10),
        ]);
        setTrust(loadedTrust);
        setReviews(loadedReviews);
      }).catch((loadError: unknown) => {
        if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setError(loadError instanceof Error && loadError.message === "AGENT_NOT_FOUND" ? "Bu agent topilmadi yoki faol emas." : "Agent profilini yuklashda xatolik yuz berdi.");
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const isCurrentUser = Boolean(agent && session && agent.id === session.user.id);
  async function openChat() {
    if (!agent || isCurrentUser || isOpeningChat) return;
    setIsOpeningChat(true); setError("");
    try {
      const roomId = await getOrCreateDirectChat(agent.id);
      if (!roomId) throw new Error("CHAT_ROOM_MISSING");
      router.push(`/messenger/${roomId}`);
    } catch (openError: unknown) {
      if (openError instanceof Error && (openError.message === "AUTH_SESSION_EXPIRED" || openError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setError("Agent bilan shaxsiy chat ochilmadi. Qayta urinib ko‘ring.");
    } finally { setIsOpeningChat(false); }
  }

  const score = trust?.trust_score ?? (agent?.is_verified ? 45 : 30);

  return <AppShell session={session} activePath="/agents">
    {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Agent profili yuklanmoqda...</div>}
    {!isLoading && error && <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/agents" className="ml-2 font-semibold underline">Agentlarga qaytish</Link></div>}
    {!isLoading && agent && <div className="mx-auto max-w-4xl">
      <Link href="/agents" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Agentlarga qaytish</Link>

      <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <Avatar agent={agent} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight text-[#0b1f3a]">{agent.full_name || "Ism ko‘rsatilmagan"}</h1>
              {isCurrentUser && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Bu sizning profilingiz</span>}
              {agent.is_verified && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">✓ Tasdiqlangan agent</span>}
            </div>
            <p className="mt-2 text-lg text-slate-500">{agent.company_name || "Kompaniya ko‘rsatilmagan"}</p>
            <p className="mt-2 text-sm text-slate-500">{agent.city || "Shahar ko‘rsatilmagan"}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {isCurrentUser && <Link href="/profile" className="inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Profilni tahrirlash</Link>}
              {!isCurrentUser && <button type="button" onClick={() => openChat().catch(() => undefined)} disabled={isOpeningChat} className="inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isOpeningChat ? "Chat ochilmoqda..." : "Xabar yozish"}</button>}
              {!isCurrentUser && agent.phone && <a href={`tel:${agent.phone}`} className="inline-flex rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">{agent.phone} ga qo‘ng‘iroq qilish</a>}
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 to-blue-50 p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">Trust Score</p>
              <p className="mt-2 text-3xl font-bold text-[#0b1f3a]">{score}<span className="text-base font-semibold text-slate-400"> / 100</span></p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{trustLabel(score)}</p>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-[380px]">
              <div className="rounded-xl bg-white p-3 text-center shadow-sm"><p className="text-xl font-bold text-amber-500">{trust?.rating_average == null ? "—" : Number(trust.rating_average).toFixed(1)}</p><p className="mt-1 text-[11px] font-semibold text-slate-400">★ Reyting</p></div>
              <div className="rounded-xl bg-white p-3 text-center shadow-sm"><p className="text-xl font-bold text-blue-700">{trust?.completed_deals ?? 0}</p><p className="mt-1 text-[11px] font-semibold text-slate-400">Yakunlangan bitim</p></div>
              <div className="rounded-xl bg-white p-3 text-center shadow-sm"><p className="text-xl font-bold text-emerald-700">{trust?.review_count ?? 0}</p><p className="mt-1 text-[11px] font-semibold text-slate-400">Real baho</p></div>
            </div>
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500">Trust Score faqat platformadagi tasdiq holati, yakunlangan bitimlar va shu bitimlar ishtirokchilarining real baholari asosida shakllanadi.</p>
        </section>

        <dl className="mt-8 grid gap-6 border-t border-slate-100 pt-7 sm:grid-cols-2">
          <DetailItem label="Agent turi" value={agent.agent_type || "Ko‘rsatilmagan"} />
          <DetailItem label="Telefon" value={agent.phone || "Ko‘rsatilmagan"} />
          <DetailItem label="Shahar" value={agent.city || "Ko‘rsatilmagan"} />
          <DetailItem label="Platformaga qo‘shilgan" value={formatDate(agent.created_at)} />
        </dl>
        <div className="mt-8 border-t border-slate-100 pt-7"><h2 className="text-lg font-semibold text-[#0b1f3a]">Xizmatlar</h2>{agent.services?.length ? <div className="mt-4 flex flex-wrap gap-2">{agent.services.map((service) => <span key={service} className="rounded-xl bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">{service}</span>)}</div> : <p className="mt-3 text-sm text-slate-500">Xizmatlar ko‘rsatilmagan.</p>}</div>
      </section>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Tasdiqlangan bitim baholari</p><h2 className="mt-2 text-xl font-semibold text-[#0b1f3a]">Hamkorlar fikri</h2></div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{trust?.review_count ?? reviews.length} ta baho</span>
        </div>
        {reviews.length ? <div className="mt-5 space-y-3">{reviews.map((review) => <article key={review.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><p className="font-semibold text-[#0b1f3a]">{review.reviewer_name}</p>{review.reviewer_company && review.reviewer_company !== review.reviewer_name && <p className="mt-1 text-xs text-slate-500">{review.reviewer_company}</p>}</div><div className="text-left sm:text-right"><p className="text-lg tracking-wider text-amber-500" aria-label={`${review.rating} yulduz`}>{"★".repeat(review.rating)}<span className="text-slate-200">{"★".repeat(5 - review.rating)}</span></p><p className="mt-1 text-xs text-slate-400">{formatDate(review.created_at)}</p></div></div>{review.comment && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{review.comment}</p>}<p className="mt-3 text-[11px] font-semibold text-emerald-600">✓ Yakunlangan bitim asosida</p></article>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center"><p className="font-semibold text-[#0b1f3a]">Hozircha real baho yo‘q</p><p className="mt-2 text-sm text-slate-500">Yakunlangan bitimlardan keyin hamkorlar bergan baholar shu yerda ko‘rinadi.</p></div>}
      </section>
    </div>}
  </AppShell>;
}
