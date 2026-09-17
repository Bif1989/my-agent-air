"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { listAgents, loadAgentFilterOptions, type AgentFilterOptions, type AgentRecord } from "@/app/agents/agents-api";

function initials(agent: AgentRecord) {
	return (agent.full_name || agent.company_name || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function Avatar({ agent, size = "h-14 w-14" }: { agent: AgentRecord; size?: string }) {
	return agent.avatar_url ? <Image src={agent.avatar_url} alt={agent.full_name || "Agent avatari"} width={56} height={56} unoptimized className={`${size} shrink-0 rounded-2xl object-cover`} /> : <span aria-hidden="true" className={`${size} flex shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-sm font-bold text-blue-700`}>{initials(agent)}</span>;
}

function AgentCard({ agent, currentUserId }: { agent: AgentRecord; currentUserId: string }) {
	return <Link href={`/agents/${agent.id}`} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100"><div className="flex items-start gap-4"><Avatar agent={agent} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-[#0b1f3a]">{agent.full_name || "Ism ko‘rsatilmagan"}</h2>{agent.id === currentUserId && <span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700">Siz</span>}{agent.is_verified && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">Tasdiqlangan</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{agent.company_name || "Kompaniya ko‘rsatilmagan"}</p><p className="mt-1 truncate text-xs text-slate-400">{agent.city || "Shahar ko‘rsatilmagan"}</p></div></div><dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-400">Agent turi</dt><dd className="truncate text-right font-medium text-slate-700">{agent.agent_type || "Ko‘rsatilmagan"}</dd></div>{agent.phone && <div className="flex justify-between gap-3"><dt className="text-slate-400">Telefon</dt><dd className="truncate text-right font-medium text-slate-700">{agent.phone}</dd></div>}</dl>{agent.services?.length ? <div className="mt-4 flex flex-wrap gap-2">{agent.services.slice(0, 4).map((service) => <span key={service} className="max-w-full truncate rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600">{service}</span>)}{agent.services.length > 4 && <span className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-500">+{agent.services.length - 4}</span>}</div> : <p className="mt-4 text-xs text-slate-400">Xizmatlar ko‘rsatilmagan</p>}</Link>;
}

export default function AgentsPage() {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [agents, setAgents] = useState<AgentRecord[]>([]);
	const [options, setOptions] = useState<AgentFilterOptions>({ cities: [], agentTypes: [], services: [] });
	const [search, setSearch] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [agentType, setAgentType] = useState("");
	const [city, setCity] = useState("");
	const [service, setService] = useState("");
	const [verifiedOnly, setVerifiedOnly] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const storedSession = getStoredSession();
		if (!storedSession) { window.location.replace("/login"); return; }
		const timeoutId = window.setTimeout(() => setSession(storedSession), 0);
		return () => window.clearTimeout(timeoutId);
	}, []);

	useEffect(() => {
		const timeoutId = window.setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 350);
		return () => window.clearTimeout(timeoutId);
	}, [search]);

	useEffect(() => {
		if (!session) return;
		const timeoutId = window.setTimeout(() => {
			listAgents().then((loadedAgents) => { setAgents(loadedAgents); setOptions(loadAgentFilterOptions(loadedAgents)); }).catch((loadError: unknown) => {
				if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
				setError("Agentlar ro‘yxatini yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
			}).finally(() => setIsLoading(false));
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [session]);

	const visibleAgents = useMemo(() => agents.filter((agent) => {
		const haystack = [agent.full_name, agent.company_name, agent.city].filter(Boolean).join(" ").toLowerCase();
		return (!debouncedSearch || haystack.includes(debouncedSearch)) && (!agentType || agent.agent_type === agentType) && (!city || agent.city === city) && (!service || agent.services?.includes(service)) && (!verifiedOnly || agent.is_verified);
	}), [agents, city, agentType, service, verifiedOnly, debouncedSearch]);

	function clearFilters() {
		setSearch(""); setAgentType(""); setCity(""); setService(""); setVerifiedOnly(false);
	}

	const hasFilters = Boolean(search || agentType || city || service || verifiedOnly);
	return <AppShell session={session} activePath="/agents"><div className="mx-auto max-w-7xl"><header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Hamkorlar tarmog‘i</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Agentlar</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Faol va tasdiqlangan hamkorlarni toping, xizmatlarini solishtiring.</p></div><p className="text-sm font-semibold text-slate-500">{isLoading ? "Yuklanmoqda..." : `${visibleAgents.length} ta agent`}</p></header><section aria-label="Agentlarni qidirish va filtrlash" className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"><label className="block text-sm font-semibold text-[#0b1f3a] lg:col-span-1">Qidirish<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ism, kompaniya yoki shahar" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></label><label className="block text-sm font-semibold text-[#0b1f3a]">Agent turi<select value={agentType} onChange={(event) => setAgentType(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="">Barchasi</option>{options.agentTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold text-[#0b1f3a]">Shahar<select value={city} onChange={(event) => setCity(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="">Barchasi</option>{options.cities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="block text-sm font-semibold text-[#0b1f3a]">Xizmat<select value={service} onChange={(event) => setService(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"><option value="">Barchasi</option>{options.services.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><button type="button" onClick={clearFilters} disabled={!hasFilters} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-40">Filtrlarni tozalash</button></div><label className="mt-4 inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={verifiedOnly} onChange={(event) => setVerifiedOnly(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Faqat tasdiqlanganlar</label></section>{isLoading && <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-2xl bg-white" />)}</div>}{error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}{!isLoading && !error && !visibleAgents.length && <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center"><h2 className="font-semibold text-[#0b1f3a]">{agents.length ? "Mos agent topilmadi" : "Hozircha faol agentlar yo‘q"}</h2><p className="mt-2 text-sm text-slate-500">{agents.length ? "Qidiruv yoki filtrlarni o‘zgartirib ko‘ring." : "Faol agentlar qo‘shilganda ular shu yerda ko‘rinadi."}</p></div>}{!isLoading && !error && visibleAgents.length > 0 && <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibleAgents.map((agent) => <AgentCard key={agent.id} agent={agent} currentUserId={session?.user.id || ""} />)}</div>}</div></AppShell>;
}
