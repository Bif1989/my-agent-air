"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getDeal, type DealRecord } from "@/app/deals/deals-api";
import { listMessages, markDealMessagesRead, sendMessage, type MessageRecord, type MessageType } from "@/app/messages/messages-api";
import { subscribeToDealMessages } from "@/lib/supabase-realtime";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

const statusLabels: Record<string, string> = { accepted: "Qabul qilingan", processing: "Jarayonda", issued: "Rasmiylashtirilgan", completed: "Yakunlangan", cancelled: "Bekor qilingan" };
const statusClasses: Record<string, string> = { accepted: "bg-amber-50 text-amber-700", processing: "bg-blue-50 text-blue-700", issued: "bg-cyan-50 text-cyan-700", completed: "bg-emerald-50 text-emerald-700", cancelled: "bg-slate-100 text-slate-600" };
const typeLabels: Record<MessageType, string> = { text: "", system: "Tizim xabari", ticket: "Chipta ma’lumoti", pnr: "PNR ma’lumoti", file: "Fayl" };

type MessageSender = MessageRecord["sender"];

function formatTime(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function profileName(profile: MessageSender) {
  return profile?.full_name || profile?.company_name || "Agent";
}

function counterpart(deal: DealRecord, userId: string) {
  return deal.buyer_id === userId ? deal.seller : deal.buyer;
}

function messageSender(message: MessageRecord, deal: DealRecord, userId: string) {
  if (message.sender) return message.sender;
  if (message.sender_id === userId) return { id: userId, full_name: "Siz", company_name: null, is_verified: null };
  const agent = counterpart(deal, userId);
  return agent ? { id: agent.id, full_name: agent.full_name, company_name: agent.company_name, is_verified: agent.is_verified } : null;
}

function MessageBubble({ message, deal, userId }: { message: MessageRecord; deal: DealRecord; userId: string }) {
  const isMine = message.sender_id === userId;
  const sender = messageSender(message, deal, userId);
  const typeLabel = typeLabels[message.message_type] || message.message_type;
  return <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}><article className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${message.message_type === "system" ? "border border-blue-100 bg-blue-50 text-blue-900" : isMine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-[#0b1f3a]"}`}><div className="flex items-center gap-2 text-xs"><span className="font-semibold">{isMine ? "Siz" : profileName(sender)}</span>{sender?.is_verified && <span className={isMine ? "text-cyan-100" : "text-blue-600"}>Tasdiqlangan</span>}</div>{typeLabel && <p className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-70">{typeLabel}</p>}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.message}</p><div className={`mt-2 flex items-center justify-end gap-2 text-[11px] ${isMine ? "text-blue-100" : "text-slate-400"}`}><time dateTime={message.created_at}>{formatTime(message.created_at)}</time>{isMine && <span>{message.read_at ? "O‘qildi" : "Yuborildi"}</span>}</div></article></div>;
}

export default function MessagesDetailPage() {
  const params = useParams<{ dealId: string }>();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function reloadMessages(dealId: string, userId: string) {
    const loadedMessages = await listMessages(dealId);
    setMessages((current) => {
      const knownIds = new Set(current.map((message) => message.id));
      return loadedMessages.reduce((next, message) => knownIds.has(message.id) ? next : [...next, message], current).sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
    });
    if (loadedMessages.some((message) => message.sender_id !== userId && !message.read_at)) await markDealMessagesRead(dealId);
  }

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      Promise.all([getDeal(params.dealId), listMessages(params.dealId)]).then(([loadedDeal, loadedMessages]) => {
        if (!loadedDeal) throw new Error("DEAL_NOT_FOUND");
        setDeal(loadedDeal); setMessages(loadedMessages); return markDealMessagesRead(params.dealId);
      }).catch((loadError: unknown) => {
        if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
        setError(loadError instanceof Error && loadError.message === "DEAL_NOT_FOUND" ? "Bu bitim topilmadi yoki unga kirish huquqingiz yo‘q." : "Suhbatni yuklashda xatolik yuz berdi.");
      }).finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [params.dealId]);

  useEffect(() => {
    if (!session || !deal) return;
    const realtime = subscribeToDealMessages(deal.id, (payload) => {
      const senderId = typeof payload.new.sender_id === "string" ? payload.new.sender_id : "";
      reloadMessages(deal.id, session.user.id).catch(() => undefined);
      if (senderId && senderId !== session.user.id) markDealMessagesRead(deal.id).catch(() => undefined);
    });
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") reloadMessages(deal.id, session.user.id).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshOnVisible);
      if (realtime) realtime.client.removeChannel(realtime.channel);
    };
  }, [session, deal]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSubmit() {
    if (!deal || !session || !draft.trim() || draft.trim().length > 4000 || isSending) return;
    setIsSending(true); setSendError("");
    try {
      const created = await sendMessage(deal.id, draft);
      if (created) setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
      setDraft("");
    } catch (submitError: unknown) {
      if (submitError instanceof Error && (submitError.message === "AUTH_SESSION_EXPIRED" || submitError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setSendError(submitError instanceof Error && submitError.message === "MESSAGE_INVALID" ? "Xabar bo‘sh bo‘lmasligi va 4000 belgidan oshmasligi kerak." : "Xabar yuborilmadi. Qayta urinib ko‘ring.");
    } finally { setIsSending(false); }
  }

  const agent = deal && session ? counterpart(deal, session.user.id) : null;
  return <AppShell session={session} activePath="/messages">
    {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Suhbat yuklanmoqda...</div>}
    {!isLoading && error && <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/messages" className="ml-2 font-semibold underline">Xabarlarga qaytish</Link></div>}
    {!isLoading && deal && session && <div className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-5xl flex-col"><Link href="/messages" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Xabarlarga qaytish</Link><header className="mt-5 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-xl font-semibold text-[#0b1f3a]">{agent?.full_name || "Agent"}</h1>{agent?.is_verified && <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">Tasdiqlangan</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{agent?.company_name || "Kompaniya ko‘rsatilmagan"}{agent?.city ? ` · ${agent.city}` : ""}</p><p className="mt-2 text-sm font-medium text-[#0b1f3a]">{deal.request?.origin || "—"} <span className="px-1 text-blue-400">→</span> {deal.request?.destination || "—"}</p></div><div className="flex shrink-0 flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClasses[deal.status] || "bg-slate-100 text-slate-600"}`}>{statusLabels[deal.status] || deal.status}</span><Link href={`/deals/${deal.id}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#0b1f3a] hover:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-100">Bitimni ko‘rish</Link></div></header><div className="flex-1 overflow-y-auto py-6" aria-live="polite"><div className="space-y-4">{messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} deal={deal} userId={session.user.id} />) : <div className="py-16 text-center text-sm text-slate-500">Hali xabarlar yo‘q. Suhbatni boshlang.</div>}<div ref={bottomRef} /></div></div><div className="sticky bottom-0 border-t border-slate-200 bg-[#eef5fb] pt-4"><form onSubmit={(event) => { event.preventDefault(); handleSubmit(); }}><label htmlFor="message-input" className="sr-only">Xabar matni</label><div className="flex items-end gap-3"><textarea id="message-input" value={draft} maxLength={4000} rows={2} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleSubmit(); } }} placeholder="Xabaringizni yozing..." className="min-h-12 flex-1 resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0b1f3a] outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" disabled={isSending} /><button type="submit" disabled={isSending || !draft.trim() || draft.trim().length > 4000} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-50">{isSending ? "Yuborilmoqda..." : "Yuborish"}</button></div><div className="mt-2 flex justify-between gap-3 text-xs text-slate-400"><span>Enter yuboradi · Shift+Enter yangi qator</span><span>{draft.length}/4000</span></div>{sendError && <p role="alert" className="mt-2 text-sm text-red-700">{sendError}</p>}</form></div></div>}
  </AppShell>;
}
