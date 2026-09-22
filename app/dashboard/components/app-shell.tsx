"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandMark from "@/app/components/brand-mark";
import { getStoredSession, signOut, type AuthSession } from "@/lib/supabase-auth";
import { getUnreadMessageCount } from "@/app/messages/messages-api";
import { getDeal } from "@/app/deals/deals-api";
import { disablePushNotifications, registerServiceWorker } from "@/lib/push-notifications";
import { listMessengerConversations } from "@/app/messenger/messenger-api";
import { getAgent } from "@/app/agents/agents-api";
import { subscribeToMessages, subscribeToMessengerMessages, type RealtimeMessagePayload } from "@/lib/supabase-realtime";
import { getCurrentProfile } from "@/app/profile/profile-api";
import { playNotificationSound } from "@/lib/notification-sound";
import ChatToastStack, { type ChatToastData } from "@/app/dashboard/components/chat-toast";
import FloatingMessengerPanel from "@/app/dashboard/components/floating-messenger-panel";

const navigation = [
  ["Dashboard", "/dashboard"],
  ["Postlar", "/feed"],
  ["So‘rovlar va takliflar", "/requests"],
  ["Agentlar", "/agents"],
  ["Bitimlar", "/deals"],
  ["Bitim chatlari", "/messages"],
  ["Chat", "/messenger"],
  ["Profil", "/profile"],
] as const;

const MAX_TOASTS = 3;

function truncatePreview(text: string, max = 80) {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

function rememberMessageId(seen: Set<string>, id: string) {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > 200) {
    const [oldest] = seen;
    seen.delete(oldest);
  }
  return true;
}

export default function AppShell({ children, session, activePath = "" }: { children: React.ReactNode; session?: AuthSession | null; activePath?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(session ?? null);
  const [isReady, setIsReady] = useState(Boolean(session));
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadMessenger, setUnreadMessenger] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ChatToastData[]>([]);
  const unreadRefreshTimer = useRef<number | null>(null);
  const seenMessageIds = useRef<Set<string>>(new Set());
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const addToast = useCallback((toast: ChatToastData) => {
    setToasts((current) => [...current.filter((existing) => existing.id !== toast.id), toast].slice(-MAX_TOASTS));
  }, []);
  const closeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const openToast = useCallback((toast: ChatToastData) => {
    closeToast(toast.id);
    router.push(toast.href);
  }, [closeToast, router]);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      window.location.replace("/login");
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setCurrentSession(storedSession);
      setIsReady(true);
      getCurrentProfile().then((profile) => {
        if (!profile) return;
        setProfileName(profile.full_name || "");
        setCompanyName(profile.company_name || "");
        setRole(profile.role || "agent");
      }).catch(() => undefined);
      registerServiceWorker().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const visibleNavigation = role === "admin" ? [...navigation.slice(0, -1), ["Admin", "/admin"] as const, navigation[navigation.length - 1]] : navigation;

  useEffect(() => {
    if (!currentSession) return;
    const refreshUnread = () => {
      if (unreadRefreshTimer.current !== null) return;
      unreadRefreshTimer.current = window.setTimeout(() => {
        Promise.allSettled([getUnreadMessageCount(), listMessengerConversations()]).then(([dealResult, messengerResult]) => {
          if (dealResult.status === "fulfilled") setUnreadMessages(dealResult.value);
          if (messengerResult.status === "fulfilled") setUnreadMessenger(messengerResult.value.reduce((total, conversation) => total + (conversation.unread_count || 0), 0));
        }).finally(() => { unreadRefreshTimer.current = null; });
      }, 300);
    };
    const handleVisibility = () => { if (document.visibilityState === "visible") refreshUnread(); };

    const handleDealMessage = (payload: RealtimeMessagePayload) => {
      refreshUnread();
      const row = payload.new;
      const messageId = typeof row.id === "string" ? row.id : null;
      const dealId = typeof row.deal_id === "string" ? row.deal_id : null;
      const senderId = typeof row.sender_id === "string" ? row.sender_id : null;
      const text = typeof row.message === "string" ? row.message : "";
      if (!messageId || !dealId || !senderId || senderId === currentSession.user.id) return;
      if (!rememberMessageId(seenMessageIds.current, messageId)) return;
      const activeDealId = pathnameRef.current?.match(/^\/messages\/([^/]+)/)?.[1];
      if (activeDealId === dealId) return;
      playNotificationSound();
      getDeal(dealId).then((deal) => {
        if (!deal) return;
        const agent = deal.buyer_id === senderId ? deal.buyer : deal.seller;
        const senderName = agent?.full_name || agent?.company_name || "Agent";
        const routeTitle = deal.request ? `${deal.request.origin || "—"} → ${deal.request.destination || "—"}` : "Bitim chati";
        addToast({ id: messageId, sender: senderName, title: `Bitim chati: ${routeTitle}`, preview: truncatePreview(text), href: `/messages/${dealId}` });
      }).catch(() => undefined);
    };

    const handleMessengerMessage = (payload: RealtimeMessagePayload) => {
      refreshUnread();
      const row = payload.new;
      const messageId = typeof row.id === "string" ? row.id : null;
      const roomId = typeof row.room_id === "string" ? row.room_id : null;
      const senderId = typeof row.sender_id === "string" ? row.sender_id : null;
      const text = typeof row.message === "string" ? row.message : "";
      if (!messageId || !roomId || !senderId || senderId === currentSession.user.id) return;
      if (!rememberMessageId(seenMessageIds.current, messageId)) return;
      const activeRoomId = pathnameRef.current?.match(/^\/messenger\/([^/]+)/)?.[1];
      if (activeRoomId === roomId) return;
      playNotificationSound();
      Promise.all([listMessengerConversations(), getAgent(senderId)]).then(([conversations, agent]) => {
        const conversation = conversations.find((item) => item.room_id === roomId);
        const chatTitle = conversation?.room_type === "group" ? conversation.title || "Guruh chati" : conversation?.room_type === "public" ? "Umumiy chat" : conversation?.counterpart_full_name || agent?.full_name || "Chat";
        const senderName = agent?.full_name || agent?.company_name || conversation?.counterpart_full_name || "Agent";
        addToast({ id: messageId, sender: senderName, title: chatTitle, preview: truncatePreview(text), href: `/messenger/${roomId}` });
      }).catch(() => undefined);
    };

    const realtime = subscribeToMessages(handleDealMessage);
    const messengerRealtime = subscribeToMessengerMessages(handleMessengerMessage);
    refreshUnread();
    window.addEventListener("focus", refreshUnread);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshUnread);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (realtime) realtime.client.removeChannel(realtime.channel);
      if (messengerRealtime) messengerRealtime.client.removeChannel(messengerRealtime.channel);
      if (unreadRefreshTimer.current !== null) window.clearTimeout(unreadRefreshTimer.current);
      unreadRefreshTimer.current = null;
    };
  }, [currentSession, addToast]);

  async function handleLogout() {
    setIsSigningOut(true);
    await disablePushNotifications().catch(() => undefined);
    await signOut();
    window.location.replace("/login");
  }

  if (!isReady || !currentSession) {
    return <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] text-sm text-slate-500">Yuklanmoqda...</main>;
  }

  return (
    <div className="min-h-screen bg-[#eef5fb] text-[#0b1f3a] lg:flex">
      <aside className="hidden w-72 shrink-0 flex-col bg-[#0b1f3a] px-5 py-6 text-white lg:flex">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 text-sm font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-cyan-300">
          <BrandMark /> MY AGENT AIR
        </Link>
        <nav aria-label="Asosiy navigatsiya" className="mt-12 space-y-1">
            {visibleNavigation.map(([label, href]) => (
            <Link key={href} href={href} className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${activePath === href ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
              <span>{label}</span>{href === "/messages" && unreadMessages > 0 && <span aria-label={`${unreadMessages} ta o‘qilmagan xabar`} className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}{href === "/messenger" && unreadMessenger > 0 && <span aria-label={`${unreadMessenger} ta o‘qilmagan chat xabari`} className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-bold text-[#0b1f3a]">{unreadMessenger > 99 ? "99+" : unreadMessenger}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-5">
          <p className="truncate px-3 text-sm font-semibold">{profileName || currentSession.user.email || "Foydalanuvchi"}</p>
          <p className="truncate px-3 text-xs text-blue-200">{companyName || "Kompaniya ko‘rsatilmagan"} · {role === "admin" ? "Administrator" : "Agent"}</p>
          <button type="button" onClick={handleLogout} disabled={isSigningOut} className="mt-5 w-full rounded-xl border border-white/15 px-4 py-3 text-left text-sm font-medium text-blue-100 transition hover:border-red-300/50 hover:bg-red-400/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">{isSigningOut ? "Chiqilmoqda..." : "Chiqish"}</button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-8 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-500"><BrandMark /> MY AGENT AIR</Link>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">Chiqish</button>
          </div>
          <nav aria-label="Mobil navigatsiya" className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {visibleNavigation.map(([label, href]) => <Link key={href} href={href} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${activePath === href ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}><span>{label}</span>{href === "/messages" && unreadMessages > 0 && <span aria-label={`${unreadMessages} ta o‘qilmagan xabar`} className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] text-white">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}{href === "/messenger" && unreadMessenger > 0 && <span aria-label={`${unreadMessenger} ta o‘qilmagan chat xabari`} className="rounded-full bg-cyan-300 px-1.5 py-0.5 text-[10px] font-bold text-[#0b1f3a]">{unreadMessenger > 99 ? "99+" : unreadMessenger}</span>}</Link>)}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
      <ChatToastStack toasts={toasts} onClose={closeToast} onOpen={openToast} />
      <FloatingMessengerPanel activePath={activePath} />
    </div>
  );
}
