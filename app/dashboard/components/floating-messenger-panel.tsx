"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { listMessengerConversations, type MessengerConversation } from "@/app/messenger/messenger-api";
import { useMessengerRoom } from "@/app/messenger/use-messenger-room";
import { getStoredSession } from "@/lib/supabase-auth";
import { ACTIVE_MESSENGER_ROOM_EVENT } from "@/lib/chat-state";
import { subscribeToMessengerMessages } from "@/lib/supabase-realtime";

function chatTitle(conversation: MessengerConversation) {
  if (conversation.room_type === "public") return "Umumiy chat";
  if (conversation.room_type === "group") return conversation.title || "Guruh";
  return conversation.counterpart_full_name || conversation.counterpart_company_name || "Agent";
}
function initials(conversation: MessengerConversation) {
  if (conversation.room_type === "group") return "◫";
  if (conversation.room_type === "public") return "✦";
  return chatTitle(conversation).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "";
}

export default function FloatingMessengerPanel({ activePath }: { activePath?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<MessengerConversation[]>([]);
  const [selected, setSelected] = useState<MessengerConversation | null>(null);
  const [listError, setListError] = useState("");
  const [isLoadingList, setIsLoadingList] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hidden = Boolean(activePath?.startsWith("/messenger"));
  const chat = useMessengerRoom(selected?.room_id || null, isOpen && !hidden);
  const newestId = chat.messages.at(-1)?.id;
  const userId = getStoredSession()?.user.id || "";

  const refresh = useCallback(() => {
    return listMessengerConversations().then((loaded) => { setConversations(loaded); setListError(""); })
      .catch((error: unknown) => { setListError(error instanceof Error ? error.message : "Chatlar yuklanmadi."); })
      .finally(() => setIsLoadingList(false));
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | null = null;
    const reload = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => { timer = null; if (active) void refresh(); }, 300);
    };
    reload();
    const subscription = subscribeToMessengerMessages(reload);
    window.addEventListener("online", reload);
    window.addEventListener("my-agent-air:chat-read", reload);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("online", reload);
      window.removeEventListener("my-agent-air:chat-read", reload);
      if (subscription) void subscription.client.removeChannel(subscription.channel);
    };
  }, [refresh]);

  useEffect(() => {
    const announce = () => window.dispatchEvent(new CustomEvent(ACTIVE_MESSENGER_ROOM_EVENT, { detail: isOpen && !hidden && document.visibilityState === "visible" ? selected?.room_id || null : null }));
    announce();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("visibilitychange", announce);
    window.addEventListener("keydown", onKey);
    return () => {
      window.dispatchEvent(new CustomEvent(ACTIVE_MESSENGER_ROOM_EVENT, { detail: null }));
      document.removeEventListener("visibilitychange", announce);
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, hidden, selected?.room_id]);

  useEffect(() => {
    if (isOpen && !hidden) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [newestId, selected?.room_id, isOpen, hidden]);

  if (hidden) return null;
  const unread = conversations.reduce((total, conversation) => total + (conversation.unread_count || 0), 0);

  return <div className="fixed bottom-4 right-3 z-40 flex w-[min(23rem,calc(100vw-1.5rem))] flex-col items-end sm:right-4">
    {isOpen && <section aria-label="My Agent Air messenjeri" className="mb-3 flex h-[min(42rem,calc(100dvh-7rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
      <div className="flex items-start justify-between gap-2 bg-[#0b1f3a] px-4 py-3 text-white">
        <div className="flex min-w-0 gap-2">{selected && <button type="button" onClick={() => setSelected(null)} aria-label="Chatlar ro‘yxatiga qaytish" className="rounded-lg px-1 text-xl focus:outline-none focus:ring-2 focus:ring-cyan-300">←</button>}
          <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{selected ? chatTitle(selected) : "Chatlar"}</h2><p className="mt-0.5 text-xs text-blue-100">My Agent Air messenjeri</p></div>
        </div><button type="button" onClick={() => setIsOpen(false)} aria-label="Yopish" className="rounded-lg px-2 text-xl focus:outline-none focus:ring-2 focus:ring-cyan-300">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {selected ? <div className="min-h-full space-y-3 bg-[#f7fbff] px-3 py-4">
          {chat.hasOlder && <button type="button" disabled={chat.loadingOlder} onClick={() => void chat.loadOlder()} className="w-full rounded-xl border border-blue-100 bg-white py-2 text-xs font-semibold text-blue-700 disabled:opacity-50">{chat.loadingOlder ? "Yuklanmoqda..." : "Oldingi xabarlar"}</button>}
          {chat.error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{chat.error}<button type="button" onClick={chat.reload} className="mt-2 block font-semibold underline">Qayta yuklash</button></div>}
          {chat.isLoading && <p className="py-6 text-center text-xs text-slate-500">Xabarlar yuklanmoqda...</p>}
          {!chat.isLoading && !chat.error && chat.messages.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Hali xabarlar yo‘q</p>}
          {chat.messages.map((message) => {
            const mine = message.sender_id === userId;
            return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-[#0b1f3a]"}`}>
              {!mine && selected.room_type !== "direct" && <p className="mb-1 text-[11px] font-semibold text-blue-600">{message.sender?.full_name || "Agent"}</p>}
              <p className="whitespace-pre-wrap break-words">{message.message}</p><time dateTime={message.created_at} className={`mt-1 block text-right text-[10px] ${mine ? "text-blue-100" : "text-slate-400"}`}>{formatTime(message.created_at)}</time>
            </div></div>;
          })}<div ref={bottomRef} />
        </div> : <>
          {listError && <div role="alert" className="m-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{listError}<button type="button" onClick={() => void refresh()} className="mt-2 block font-semibold underline">Qayta yuklash</button></div>}
          {isLoadingList && <p className="p-6 text-center text-xs text-slate-500">Chatlar yuklanmoqda...</p>}
          {!isLoadingList && !listError && conversations.length === 0 && <p className="p-6 text-center text-xs text-slate-500">Hali chatlar yo‘q. Agentlar bo‘limidan suhbat boshlang.</p>}
          {conversations.map((conversation) => <button type="button" key={conversation.room_id} onClick={() => setSelected(conversation)} className="flex w-full items-center gap-3 border-b border-slate-100 p-4 text-left transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">{initials(conversation)}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#0b1f3a]">{chatTitle(conversation)}</span><span className="mt-1 block truncate text-xs text-slate-500">{conversation.last_message || "Suhbatni ochish"}</span></span>
            <span className="shrink-0 text-right"><span className="block text-[10px] text-slate-400">{formatTime(conversation.last_message_at)}</span>{Boolean(conversation.unread_count) && <span className="mt-1 inline-block rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{conversation.unread_count}</span>}</span>
          </button>)}
        </>}
      </div>
      {selected && <form onSubmit={(event) => { event.preventDefault(); void chat.send(); }} className="border-t border-slate-100 p-3">
        {chat.sendError && <p role="alert" className="mb-2 rounded-xl bg-red-50 p-2 text-xs text-red-700">{chat.sendError} Qoralama saqlandi.</p>}
        <div className="flex gap-2"><textarea aria-label="Xabar" rows={2} maxLength={4000} value={chat.draft} onChange={(event) => chat.setDraft(event.target.value)} placeholder="Xabar yozing..." className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /><button type="submit" disabled={chat.isSending || !chat.draft.trim()} className="rounded-xl bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50">{chat.isSending ? "..." : chat.sendError ? "Qayta yuborish" : "Yuborish"}</button></div>
      </form>}
      <div className="border-t border-slate-100 p-3"><Link href="/messenger" className="block rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-600 hover:bg-blue-100">Barcha chatlarni ochish</Link></div>
    </section>}
    <button type="button" aria-expanded={isOpen} aria-label="Chatlarni ochish yoki yopish" onClick={() => setIsOpen((open) => !open)} className="flex items-center gap-2 rounded-full border-2 border-cyan-400 bg-[#0b1f3a] px-5 py-3 text-sm font-semibold text-white shadow-lg focus:outline-none focus:ring-4 focus:ring-blue-200">☏ Chatlar{unread > 0 && <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px]">{unread > 99 ? "99+" : unread}</span>}</button>
  </div>;
}
