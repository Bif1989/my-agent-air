"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listMessengerConversations, listMessengerMessages, markMessengerRoomRead, sendMessengerMessage, type MessengerConversation, type MessengerMessage } from "@/app/messenger/messenger-api";
import { getStoredSession } from "@/lib/supabase-auth";
import { subscribeToMessengerMessages, subscribeToMessengerRoom } from "@/lib/supabase-realtime";

function initials(conversation: MessengerConversation) {
  if (conversation.room_type === "group") return "◫";
  if (conversation.room_type === "public") return "✦";
  const name = conversation.counterpart_full_name || conversation.counterpart_company_name || "Agent";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function chatTitle(conversation: MessengerConversation) {
  if (conversation.room_type === "public") return "Umumiy chat";
  if (conversation.room_type === "group") return conversation.title || "Guruh";
  return conversation.counterpart_full_name || conversation.counterpart_company_name || "Agent";
}

function formatTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function FloatingMessengerPanel({ activePath }: { activePath?: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState<MessengerConversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<MessengerConversation | null>(null);
  const [messages, setMessages] = useState<MessengerMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const refreshTimer = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userId = getStoredSession()?.user.id || "";

  const refresh = () => {
    listMessengerConversations().then(setConversations).catch(() => undefined);
  };

  useEffect(() => {
    refresh();
    const scheduleRefresh = () => {
      if (refreshTimer.current !== null) return;
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = null;
        refresh();
      }, 400);
    };
    const realtime = subscribeToMessengerMessages(scheduleRefresh);
    return () => {
      if (realtime) realtime.client.removeChannel(realtime.channel);
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedConversation) return;
    const roomId = selectedConversation.room_id;
    let active = true;
    const reloadMessages = () => listMessengerMessages(roomId).then((loaded) => {
      if (active) setMessages(loaded);
    }).catch(() => undefined);
    setMessages([]);
    setDraft("");
    setIsLoadingMessages(true);
    reloadMessages().finally(() => {
      if (active) setIsLoadingMessages(false);
    });
    markMessengerRoomRead(roomId).catch(() => undefined);
    const realtime = subscribeToMessengerRoom(roomId, () => {
      reloadMessages();
      markMessengerRoomRead(roomId).catch(() => undefined);
    });
    return () => {
      active = false;
      if (realtime) realtime.client.removeChannel(realtime.channel);
    };
  }, [selectedConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedConversation]);

  async function handleSendMessage() {
    if (!selectedConversation || !draft.trim() || isSending) return;
    setIsSending(true);
    try {
      const created = await sendMessengerMessage(selectedConversation.room_id, draft);
      if (created) setMessages((current) => [...current, created]);
      setDraft("");
    } catch {
      // The room remains usable if sending fails; the next realtime refresh can recover state.
    } finally {
      setIsSending(false);
    }
  }

  // Panel shouldn't overlap the full messenger page itself.
  if (activePath?.startsWith("/messenger")) return null;

  const unreadTotal = conversations.reduce((total, conversation) => total + (conversation.unread_count || 0), 0);
  const recentConversations = conversations.slice(0, 8);

  return (
    <div className="fixed bottom-4 right-4 z-40 hidden w-80 flex-col items-end sm:flex">
      {isOpen && (
        <div className="mb-3 flex h-[min(42rem,calc(100vh-6rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
          <div className="flex items-start justify-between bg-[#0b1f3a] px-4 py-3 text-white">
            <div className="flex min-w-0 items-start gap-2">
              {selectedConversation && <button type="button" onClick={() => setSelectedConversation(null)} aria-label="Chatlar ro‘yxatiga qaytish" className="rounded-full px-1 text-xl leading-5 text-blue-100 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">←</button>}
              <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">{selectedConversation ? chatTitle(selectedConversation) : "Chatlar"}</span>
              <span className="mt-0.5 block text-xs text-blue-100">My Agent Air messenjeri</span>
              </div>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Yopish" className="rounded-full p-1 text-lg leading-none text-blue-100 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedConversation ? (
              <div className="space-y-3 bg-[#f7fbff] px-3 py-4" aria-live="polite">
                {isLoadingMessages && <p className="py-6 text-center text-xs text-slate-400">Xabarlar yuklanmoqda...</p>}
                {!isLoadingMessages && messages.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Hali xabarlar yo‘q</p>}
                {messages.map((message) => {
                  const isMine = message.sender_id === userId;
                  return <div key={message.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}><div className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm ${isMine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-[#0b1f3a]"}`}><p className="whitespace-pre-wrap break-words">{message.message}</p><time dateTime={message.created_at} className={`mt-1 block text-right text-[10px] ${isMine ? "text-blue-100" : "text-slate-400"}`}>{formatTime(message.created_at)}</time></div></div>;
                })}
                <div ref={bottomRef} />
              </div>
            ) : (
              <>
            {recentConversations.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">Hali suhbatlar yo‘q</p>}
            {recentConversations.map((conversation) => (
              <button
                key={conversation.room_id}
                type="button"
                onClick={() => setSelectedConversation(conversation)}
                className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              >
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{initials(conversation)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-[#0b1f3a]">{chatTitle(conversation)}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{formatTime(conversation.last_message_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">{conversation.last_message || "Hali xabarlar yo‘q"}</span>
                    {Boolean(conversation.unread_count) && <span className="shrink-0 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{(conversation.unread_count || 0) > 99 ? "99+" : conversation.unread_count}</span>}
                  </span>
                </span>
              </button>
            ))}
              </>
            )}
          </div>
          {selectedConversation ? (
            <form onSubmit={(event) => { event.preventDefault(); handleSendMessage().catch(() => undefined); }} className="border-t border-slate-100 bg-white p-3">
              <div className="flex items-end gap-2">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={4000} placeholder="Xabar yozing..." className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100" />
                <button type="submit" disabled={!draft.trim() || isSending} className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Yuborish</button>
              </div>
            </form>
          ) : (
          <div className="border-t border-slate-100 bg-white p-3">
            <button
              type="button"
              onClick={() => { setIsOpen(false); router.push("/messenger"); }}
              className="w-full rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Barcha chatlarni ochish
            </button>
          </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full bg-[#0b1f3a] px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-cyan-300"
      >
        <span aria-hidden="true" className="text-cyan-300">💬</span>
        Chatlar
        {unreadTotal > 0 && <span aria-label={`${unreadTotal} ta o‘qilmagan xabar`} className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-bold text-[#0b1f3a]">{unreadTotal > 99 ? "99+" : unreadTotal}</span>}
      </button>
    </div>
  );
}
