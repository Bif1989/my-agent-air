"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getAccessibleMessengerRoom, getMessengerRoomDetails, listGroupMembers, listMessengerConversations, type GroupMember, type MessengerMessage, type MessengerRoom } from "@/app/messenger/messenger-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useMessengerRoom } from "@/app/messenger/use-messenger-room";
import AviaSmartAssist from "@/app/components/avia-smart-assist";
import { isVkCurrentChatAvailable, sendTextToCurrentVkChat } from "@/lib/vk-chat";

function initials(name: string | null, company: string | null) {
  return (name || company || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function roomIdFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "messenger" || !parts[1] || parts[2]) return "";
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

function SenderAvatar({ message }: { message: MessengerMessage }) {
  if (message.sender?.avatar_url) return <Image src={message.sender.avatar_url} alt="" width={32} height={32} unoptimized className="h-8 w-8 rounded-full object-cover" />;
  return <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700" aria-hidden="true">{initials(message.sender?.full_name || null, message.sender?.company_name || null)}</span>;
}

function MessageBubble({ message, userId, isPublic, isGroup }: { message: MessengerMessage; userId: string; isPublic: boolean; isGroup: boolean }) {
  const isMine = message.sender_id === userId;
  const isSystem = message.message_type === "system";
  if (isSystem) return <div className="flex justify-center"><p className="rounded-full bg-slate-100 px-4 py-2 text-xs text-slate-500">{message.message}</p></div>;
  return <div className={`flex gap-2 ${isMine ? "justify-end" : "justify-start"}`}>{!isMine && <SenderAvatar message={message} />}<article className={`max-w-[86%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[70%] ${isMine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-[#0b1f3a]"}`}><div className="flex flex-wrap items-center gap-2 text-xs">{!isMine && <Link href={`/agents/${message.sender_id}`} className="font-semibold hover:text-blue-600">{message.sender?.full_name || message.sender?.company_name || "Agent"}</Link>}{!isMine && (isPublic || isGroup) && message.sender?.company_name && <span className="text-slate-400">{message.sender.company_name}</span>}{!isMine && (isPublic || isGroup) && message.sender?.is_verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">Tasdiqlangan</span>}{isMine && <span className="font-semibold">Siz</span>}</div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.message}</p><time dateTime={message.created_at} className={`mt-2 block text-right text-[11px] ${isMine ? "text-blue-100" : "text-slate-400"}`}>{formatTime(message.created_at)}</time></article></div>;
}

function RoomHeader({ room, membersCount }: { room: MessengerRoom; membersCount?: number }) {
  if (room.room_type === "group") {
    return <header className="border-b border-slate-200 px-4 py-4 sm:px-6"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0b1f3a] text-lg text-cyan-200" aria-hidden="true">◫</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-lg font-semibold text-[#0b1f3a]">{room.title || "Guruh"}</h1><span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-semibold text-cyan-700">Guruh</span>{typeof membersCount === "number" && <span className="text-xs text-slate-500">{membersCount} a’zo</span>}</div><p className="mt-1 text-sm text-slate-500">{room.description || "Guruh haqida qisqacha ma’lumot yo‘q."}</p></div><Link href={`/messenger/${room.id}/settings`} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Guruh sozlamalari</Link></div></header>;
  }
  const isPublic = room.room_type === "public";
  return <header className="border-b border-slate-200 px-4 py-4 sm:px-6"><div className="flex items-start gap-3"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-lg ${isPublic ? "bg-[#0b1f3a] text-cyan-200" : "bg-blue-100 text-blue-700"}`} aria-hidden="true">{isPublic ? "✦" : initials(room.counterpart_full_name || null, room.counterpart_company_name || null)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h1 className="truncate text-lg font-semibold text-[#0b1f3a]">{isPublic ? "Umumiy chat" : room.counterpart_full_name || "Agent"}</h1>{!isPublic && room.counterpart_is_verified && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Tasdiqlangan</span>}</div><p className="mt-1 truncate text-sm text-slate-500">{isPublic ? "Barcha faol My Agent Air agentlari uchun" : `${room.counterpart_company_name || "Kompaniya ko‘rsatilmagan"}${room.counterpart_city ? ` · ${room.counterpart_city}` : ""}`}</p></div>{!isPublic && room.counterpart_id && <Link href={`/agents/${room.counterpart_id}`} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Profilni ko‘rish</Link>}</div></header>;
}

export default function MessengerRoomPage() {
  const [roomId, setRoomId] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setRoomId(roomIdFromLocation()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  if (!roomId) return null;
  return <MessengerRoomContent key={roomId} roomId={roomId} />;
}

function MessengerRoomContent({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [session] = useState<AuthSession | null>(() => getStoredSession());
  const [room, setRoom] = useState<MessengerRoom | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const chat = useMessengerRoom(room?.id || null);
  const { messages, draft, setDraft, isSending, sendError } = chat;
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getStoredSession()) { router.replace(`/login?next=${encodeURIComponent(`/messenger/${roomId}`)}`); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const conversations = await listMessengerConversations();
        const accessible = await getAccessibleMessengerRoom(roomId, conversations);
        if (!accessible) throw new Error("Bu suhbat mavjud emas yoki kirish huquqingiz yo‘q.");
        const details = await getMessengerRoomDetails(roomId);
        const loaded = details ? { ...accessible, ...details } : accessible;
        const members = loaded.room_type === "group" ? await listGroupMembers(roomId) : [];
        if (active) { setRoom(loaded); setGroupMembers(members); }
      })().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Suhbat yuklanmadi."); }).finally(() => { if (active) setIsLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [roomId, router]);

  const newestId = messages.at(-1)?.id;
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [newestId]);
  const handleSubmit = chat.send;

  const isGroupRoom = room?.room_type === "group";
  const vkCurrentChatAvailable = isVkCurrentChatAvailable();

  return <AppShell session={session} activePath="/messenger"><div className="mx-auto max-w-5xl"><Link href="/messenger" className="mb-4 inline-flex text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Chatga qaytish</Link>{isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Suhbat yuklanmoqda...</div>}{!isLoading && error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}{!isLoading && room && session && <section className="flex min-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><RoomHeader room={room} membersCount={isGroupRoom ? groupMembers.length : undefined} /><div className="flex-1 overflow-y-auto bg-[#f7fbff] px-4 py-6 sm:px-6" aria-live="polite"><div className="space-y-4">{chat.error && <p role="alert" className="text-sm text-red-700">{chat.error} <button type="button" onClick={chat.reload} className="underline">Qayta yuklash</button></p>}{chat.hasOlder && <button type="button" onClick={chat.loadOlder} disabled={chat.loadingOlder} className="block w-full text-sm text-blue-600">{chat.loadingOlder ? "Yuklanmoqda…" : "Oldingi xabarlar"}</button>}{chat.isLoading ? <p className="text-sm text-slate-500">Xabarlar yuklanmoqda…</p> : messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} userId={session.user.id} isPublic={room.room_type === "public"} isGroup={isGroupRoom} />) : <div className="py-16 text-center text-sm text-slate-500">Hali xabarlar yo‘q. Suhbatni boshlang.</div>}<div ref={bottomRef} /></div></div><div className="border-t border-slate-200 bg-white p-4 sm:p-5"><form onSubmit={(event) => { event.preventDefault(); handleSubmit().catch(() => undefined); }}><AviaSmartAssist value={draft} onChange={setDraft} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleSubmit().catch(() => undefined); } }} maxLength={4000} rows={3} placeholder="Xabar yozing..." className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" /><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><p className={`text-xs ${draft.length > 3800 ? "text-amber-600" : "text-slate-400"}`}>{draft.length}/4000</p>{vkCurrentChatAvailable && <button type="button" onClick={() => { if (draft.trim()) sendTextToCurrentVkChat(draft.trim()); }} disabled={!draft.trim()} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0b1f3a] transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50">VK chatga yuborish</button>}</div><button type="submit" disabled={!draft.trim() || isSending} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-slate-300">{isSending ? "Yuborilmoqda..." : "Yuborish"}</button></div>{sendError && <p className="mt-3 text-sm text-red-600">{sendError}</p>}</form></div></section>}</div></AppShell>;
}
