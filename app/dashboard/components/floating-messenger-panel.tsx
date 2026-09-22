"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { listMessengerConversations, type MessengerConversation } from "@/app/messenger/messenger-api";
import { subscribeToMessengerMessages } from "@/lib/supabase-realtime";

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
  const refreshTimer = useRef<number | null>(null);

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

  // Panel shouldn't overlap the full messenger page itself.
  if (activePath?.startsWith("/messenger")) return null;

  const unreadTotal = conversations.reduce((total, conversation) => total + (conversation.unread_count || 0), 0);
  const recentConversations = conversations.slice(0, 8);

  return (
    <div className="fixed bottom-4 right-4 z-40 hidden w-80 flex-col items-end sm:flex">
      {isOpen && (
        <div className="mb-3 flex h-[min(42rem,calc(100vh-6rem))] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
          <div className="flex items-start justify-between bg-[#0b1f3a] px-4 py-3 text-white">
            <div>
              <span className="block text-sm font-semibold">Chatlar</span>
              <span className="mt-0.5 block text-xs text-blue-100">My Agent Air messenjeri</span>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Yopish" className="rounded-full p-1 text-lg leading-none text-blue-100 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300">×</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {recentConversations.length === 0 && <p className="px-4 py-6 text-center text-xs text-slate-400">Hali suhbatlar yo‘q</p>}
            {recentConversations.map((conversation) => (
              <button
                key={conversation.room_id}
                type="button"
                onClick={() => { setIsOpen(false); router.push(`/messenger/${conversation.room_id}`); }}
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
          </div>
          <div className="border-t border-slate-100 bg-white p-3">
            <button
              type="button"
              onClick={() => { setIsOpen(false); router.push("/messenger"); }}
              className="w-full rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Barcha chatlarni ochish
            </button>
          </div>
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
