"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getPublicMessengerRoom, listMessengerConversations, type MessengerConversation, type MessengerRoom } from "@/app/messenger/messenger-api";
import { subscribeToMessengerMessages } from "@/lib/supabase-realtime";

function initials(name: string | null, company: string | null) {
  return (name || company || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatTime(value: string | null) {
  if (!value) return "Yangi";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function PublicCard({ room }: { room: MessengerRoom }) {
  return (
    <Link href={`/messenger/${room.id}`} className="flex items-center gap-3 rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 transition hover:border-cyan-400 hover:bg-cyan-50 focus:outline-none focus:ring-4 focus:ring-cyan-100">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0b1f3a] text-lg text-cyan-200" aria-hidden="true">✦</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[#0b1f3a]">Umumiy chat</span>
        <span className="mt-1 block truncate text-xs text-slate-500">Barcha faol My Agent Air agentlari uchun</span>
      </span>
      <span className="text-cyan-700" aria-hidden="true">→</span>
    </Link>
  );
}

function GroupCard({ conversation }: { conversation: MessengerConversation }) {
  return (
    <Link href={`/messenger/${conversation.room_id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-cyan-400 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0b1f3a] text-lg text-cyan-200" aria-hidden="true">◫</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-[#0b1f3a]">{conversation.title || "Guruh"}</span>
          <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700">Guruh</span>
        </span>
        <p className="mt-1 truncate text-sm text-slate-500">{conversation.last_message || "Hali xabarlar yo‘q"}</p>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-[11px] text-slate-400">{formatTime(conversation.last_message_at)}</span>
        {Boolean(conversation.unread_count) && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{(conversation.unread_count || 0) > 99 ? "99+" : conversation.unread_count}</span>}
      </span>
    </Link>
  );
}

function DirectCard({ conversation }: { conversation: MessengerConversation }) {
  const name = conversation.counterpart_full_name || "Agent";
  return (
    <Link href={`/messenger/${conversation.room_id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm focus:outline-none focus:ring-4 focus:ring-blue-100">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700" aria-hidden="true">{initials(conversation.counterpart_full_name, conversation.counterpart_company_name)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2"><span className="truncate font-semibold text-[#0b1f3a]">{name}</span>{conversation.counterpart_is_verified && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Tasdiqlangan</span>}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{conversation.counterpart_company_name || conversation.counterpart_city || "Kompaniya ko‘rsatilmagan"}</span>
        <p className="truncate text-sm text-slate-500">{conversation.last_message || "Hali xabarlar yo‘q"}</p>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-2"><span className="text-[11px] text-slate-400">{formatTime(conversation.last_message_at)}</span>{Boolean(conversation.unread_count) && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{(conversation.unread_count || 0) > 99 ? "99+" : conversation.unread_count}</span>}</span>
    </Link>
  );
}

export default function MessengerPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [publicRoom, setPublicRoom] = useState<MessengerRoom | null>(null);
  const [groupConversations, setGroupConversations] = useState<MessengerConversation[]>([]);
  const [directConversations, setDirectConversations] = useState<MessengerConversation[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function refresh() {
    setError("");
    try {
      const [room, allConversations] = await Promise.all([getPublicMessengerRoom(), listMessengerConversations()]);
      setPublicRoom(room);
      setGroupConversations(allConversations.filter((conversation) => conversation.room_type === "group"));
      setDirectConversations(allConversations.filter((conversation) => conversation.room_type === "direct"));
    } catch (loadError: unknown) {
      if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) {
        window.location.replace("/login");
        return;
      }
      setError("Chat suhbatlarini yuklashda xatolik yuz berdi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      window.location.replace("/login");
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      refresh().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    if (!session) return;
    let refreshTimer: number | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer !== null) return;
      refreshTimer = window.setTimeout(() => {
        refreshTimer = null;
        refresh().catch(() => undefined);
      }, 400);
    };
    const realtime = subscribeToMessengerMessages(scheduleRefresh);
    const onVisibility = () => { if (document.visibilityState === "visible") scheduleRefresh(); };
    window.addEventListener("focus", scheduleRefresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", scheduleRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      if (realtime) realtime.client.removeChannel(realtime.channel);
    };
  }, [session]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("uz");
    if (!query) return groupConversations;
    return groupConversations.filter((conversation) => [conversation.title, conversation.last_message].some((value) => value?.toLocaleLowerCase("uz").includes(query)));
  }, [groupConversations, search]);

  const filteredDirect = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("uz");
    if (!query) return directConversations;
    return directConversations.filter((conversation) => [conversation.counterpart_full_name, conversation.counterpart_company_name, conversation.counterpart_city, conversation.last_message].some((value) => value?.toLocaleLowerCase("uz").includes(query)));
  }, [directConversations, search]);

  return (
    <AppShell session={session} activePath="/messenger">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Aloqa markazi</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a] sm:text-4xl">Chat</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Agentlar bilan tezkor, professional va shaxsiy yozishmalar.</p>
          </div>
          <Link href="/messenger/new-group" className="inline-flex items-center justify-center rounded-xl bg-[#0b1f3a] px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:bg-[#122d57] focus:outline-none focus:ring-4 focus:ring-cyan-200/40">Yangi guruh</Link>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(280px,390px)_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-[#0b1f3a]">Suhbatlar</h2>
              <span className="text-xs text-slate-400">{directConversations.length + groupConversations.length} ta chat</span>
            </div>

            <label className="mt-4 block">
              <span className="sr-only">Suhbatlarni qidirish</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Suhbatlarni qidiring" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
            </label>

            {isLoading && (
              <div className="mt-5 space-y-3" aria-label="Suhbatlar yuklanmoqda">
                <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
                <div className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              </div>
            )}

            {error && <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            {!isLoading && !error && (
              <div className="mt-5 space-y-4">
                {publicRoom && <PublicCard room={publicRoom} />}

                <div className="pt-1">
                  <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Guruhlar</p>
                  {filteredGroups.length ? (
                    <div className="space-y-3">{filteredGroups.map((conversation) => <GroupCard key={conversation.room_id} conversation={conversation} />)}</div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Hozircha guruhlar yo‘q.</p>
                  )}
                </div>

                <div className="pt-1">
                  <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Shaxsiy chatlar</p>
                  {filteredDirect.length ? (
                    <div className="space-y-3">{filteredDirect.map((conversation) => <DirectCard key={conversation.room_id} conversation={conversation} />)}</div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">Hozircha shaxsiy yozishmalar yo‘q.</p>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="hidden min-h-[520px] flex-col items-center justify-center rounded-3xl border border-slate-200 bg-[#0b1f3a] p-8 text-center text-white lg:flex">
            <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-cyan-300 text-3xl text-[#0b1f3a]" aria-hidden="true">✦</span>
            <h2 className="mt-6 text-2xl font-semibold">Chatni tanlang</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-blue-100">Umumiy chatga qo‘shiling, guruhlar va shaxsiy suhbatlar bilan ishlang.</p>
            {publicRoom && <Link href={`/messenger/${publicRoom.id}`} className="mt-6 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-[#0b1f3a] transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-200/40">Umumiy chatga kirish</Link>}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
