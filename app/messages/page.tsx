"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { listDeals, type DealRecord } from "@/app/deals/deals-api";
import { listConversations, type Conversation } from "@/app/messages/messages-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

const statusLabels: Record<string, string> = { accepted: "Qabul qilingan", processing: "Jarayonda", issued: "Rasmiylashtirilgan", completed: "Yakunlangan", cancelled: "Bekor qilingan" };
const statusClasses: Record<string, string> = { accepted: "bg-amber-50 text-amber-700", processing: "bg-blue-50 text-blue-700", issued: "bg-cyan-50 text-cyan-700", completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-slate-100 text-slate-600" };

function formatDate(value: string | null) {
	if (!value) return "Xabar yo‘q";
	return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function counterpart(deal: DealRecord, userId: string) {
	return deal.buyer_id === userId ? deal.seller : deal.buyer;
}

function ConversationCard({ conversation, userId }: { conversation: Conversation; userId: string }) {
	const { deal } = conversation;
	const agent = counterpart(deal, userId);
	return <Link href={`/messages/${deal.id}`} className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-100 sm:p-6"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate text-lg font-semibold text-[#0b1f3a]">{deal.request?.origin || "—"} <span className="px-1 text-blue-400">→</span> {deal.request?.destination || "—"}</p><p className="mt-1 truncate text-sm text-slate-500">{agent?.full_name || "Agent nomi ko‘rsatilmagan"} · {agent?.company_name || "Kompaniya ko‘rsatilmagan"}</p><p className="mt-1 text-xs text-slate-400">{agent?.city || "Shahar ko‘rsatilmagan"}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[deal.status] || "bg-slate-100 text-slate-600"}`}>{statusLabels[deal.status] || deal.status}</span></div><div className="mt-5 flex flex-col justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center"><p className={`min-w-0 truncate text-sm ${conversation.unread_count ? "font-semibold text-[#0b1f3a]" : "text-slate-500"}`}>{conversation.last_message || "Xabar yo‘q"}</p><div className="flex shrink-0 items-center gap-3"><span className="text-xs text-slate-400">{formatDate(conversation.last_message_at)}</span>{Boolean(conversation.unread_count) && <span aria-label={`${conversation.unread_count} ta o‘qilmagan xabar`} className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white">{conversation.unread_count}</span>}</div></div></Link>;
}

export default function MessagesPage() {
	const [session, setSession] = useState<AuthSession | null>(null);
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const storedSession = getStoredSession();
		if (!storedSession) { window.location.replace("/login"); return; }
		const timeoutId = window.setTimeout(() => setSession(storedSession), 0);
		return () => window.clearTimeout(timeoutId);
	}, []);

	useEffect(() => {
		if (!session) return;
		const timeoutId = window.setTimeout(() => {
			setIsLoading(true); setError("");
			listDeals().then((deals) => listConversations(deals)).then(setConversations).catch((loadError: unknown) => {
				if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
				setError("Xabarlar ro‘yxatini yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
			}).finally(() => setIsLoading(false));
		}, 0);
		return () => window.clearTimeout(timeoutId);
	}, [session]);

	return <AppShell session={session} activePath="/messages"><div className="mx-auto max-w-5xl"><header><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Hamkorlik aloqalari</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Xabarlar</h1><p className="mt-2 text-sm leading-6 text-slate-500">Bitimlar bo‘yicha barcha suhbatlarni bir joyda boshqaring.</p></header>{isLoading && <div className="mt-7 space-y-4" aria-label="Xabarlar yuklanmoqda"><div className="h-36 animate-pulse rounded-2xl bg-white" /><div className="h-36 animate-pulse rounded-2xl bg-white" /></div>}{error && <div role="alert" className="mt-7 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}{!isLoading && !error && !conversations.length && <div className="mt-7 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center"><h2 className="font-semibold text-[#0b1f3a]">Hozircha suhbatlar yo‘q</h2><p className="mt-2 text-sm text-slate-500">Bitim yaratilgandan keyin agent bilan yozishishingiz mumkin.</p></div>}{!isLoading && !error && conversations.length > 0 && <div className="mt-7 space-y-4">{conversations.map((conversation) => <ConversationCard key={conversation.deal_id} conversation={conversation} userId={session?.user.id || ""} />)}</div>}</div></AppShell>;
}
