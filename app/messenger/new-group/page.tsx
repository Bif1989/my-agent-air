"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { listAgents, type AgentRecord } from "@/app/agents/agents-api";
import AppShell from "@/app/dashboard/components/app-shell";
import { createGroupChat } from "@/app/messenger/messenger-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

function initials(name: string | null, company: string | null) {
  return (name || company || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function NewGroupPage() {
  const router = useRouter();
  const [session] = useState<AuthSession | null>(() => getStoredSession());
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      router.replace("/login");
      return;
    }
    listAgents()
      .then((loadedAgents) => setAgents(loadedAgents.filter((agent) => agent.id !== storedSession.user.id)))
      .catch(() => setError("Agentlar ro‘yxati yuklanmadi."))
      .finally(() => setIsLoading(false));
  }, [router]);

  const filteredAgents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("uz");
    if (!query) return agents;
    return agents.filter((agent) => [agent.full_name, agent.company_name, agent.city].some((value) => value?.toLocaleLowerCase("uz").includes(query)));
  }, [agents, search]);

  const selectedAgents = useMemo(() => agents.filter((agent) => selectedIds.includes(agent.id)), [agents, selectedIds]);

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setError("Guruh nomi kiritilishi shart.");
      return;
    }
    if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
      setError("Guruh nomi 3 dan 100 belgigacha bo‘lishi kerak.");
      return;
    }
    if (trimmedDescription.length > 500) {
      setError("Tavsif 500 belgidan ko‘p bo‘la olmaydi.");
      return;
    }
    if (selectedIds.length > 99) {
      setError("Guruhga 99 dan ortiq a’zo qo‘shib bo‘lmaydi.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const roomId = await createGroupChat(trimmedTitle, trimmedDescription, selectedIds);
      if (!roomId) throw new Error("ROOM_CREATE_FAILED");
      router.push(`/messenger/${roomId}`);
    } catch (submitError: unknown) {
      if (submitError instanceof Error && (submitError.message === "AUTH_SESSION_EXPIRED" || submitError.message === "AUTH_SESSION_MISSING")) {
        router.replace("/login");
        return;
      }
      setError("Guruh yaratilmadi. Ma’lumotlarni tekshirib qayta urinib ko‘ring.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleAgent(agentId: string) {
    setSelectedIds((current) => current.includes(agentId) ? current.filter((value) => value !== agentId) : [...current, agentId]);
  }

  return (
    <AppShell session={session} activePath="/messenger">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Yangi guruh</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Guruh yaratish</h1>
          </div>
          <Link href="/messenger" className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Chat</Link>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
            <div className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Guruh nomi</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Masalan: Namangan aviakassalar" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Tavsif</span>
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={5} placeholder="Guruh haqida qisqacha ma’lumot..." className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
              </label>

              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <p className="text-sm font-medium text-slate-700">Tanlangan agentlar</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedAgents.length ? selectedAgents.map((agent) => (
                    <button key={agent.id} type="button" onClick={() => toggleAgent(agent.id)} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{agent.full_name || "Agent"} ×</button>
                  )) : <span className="text-sm text-slate-400">Hech kim tanlanmagan</span>}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <label className="block w-full">
                  <span className="sr-only">Agentlarni qidirish</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nomi, kompaniya yoki shahar bo‘yicha qidiring" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
              </div>

              <div className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="space-y-3">{[1,2,3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}</div>
                ) : filteredAgents.length ? (
                  filteredAgents.map((agent) => {
                    const isSelected = selectedIds.includes(agent.id);
                    return (
                      <label key={agent.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition ${isSelected ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleAgent(agent.id)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{initials(agent.full_name, agent.company_name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold text-[#0b1f3a]">{agent.full_name || "Agent"}</span>
                            {agent.is_verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Tasdiqlangan</span>}
                          </span>
                          <span className="mt-1 block truncate text-xs text-slate-500">{agent.company_name || "Kompaniya ko‘rsatilmagan"}</span>
                          <span className="mt-1 block truncate text-xs text-slate-400">{agent.city || "Shahar ko‘rsatilmagan"}</span>
                        </span>
                      </label>
                    );
                  })
                ) : (
                  <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Mos agentlar topilmadi.</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-between gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center">
            <div className="text-sm text-slate-500">{selectedIds.length} ta a’zo tanlandi · limit 100</div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300">{isSubmitting ? "Yaratilmoqda..." : "Guruh yaratish"}</button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
