"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import BrandMark from "@/app/components/brand-mark";
import { UiControls, useUiSettings } from "@/lib/ui-settings";
import { AUTH_SESSION_CHANGED_EVENT, SESSION_STORAGE_KEY, getStoredSession, signOut, type AuthSession } from "@/lib/supabase-auth";
import { ACTIVE_MESSENGER_ROOM_EVENT, CHAT_READ_EVENT } from "@/lib/chat-state";
import { missingProfileFields } from "@/lib/profile-completion";
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
  const { isRu } = useUiSettings();
  const [currentSession, setCurrentSession] = useState<AuthSession | null>(session ?? null);
  const [isReady, setIsReady] = useState(Boolean(session));
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadMessenger, setUnreadMessenger] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState<string | null>(null);
  const [accountActive, setAccountActive] = useState(true);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [toasts, setToasts] = useState<ChatToastData[]>([]);
  const unreadRefreshTimer = useRef<number | null>(null);
  const seenMessageIds = useRef<Set<string>>(new Set());
  const pathnameRef = useRef(pathname);
  const activeFloatingRoom = useRef<string | null>(null);
  const isDashboard = activePath === "/dashboard";

  const navigation = isRu ? [
    ["AI центр", "/dashboard"], ["Посты", "/feed"], ["Запросы", "/requests"], ["Агенты", "/agents"], ["Сделки", "/deals"], ["Чат", "/messenger"],
  ] as const : [
    ["AI markaz", "/dashboard"], ["Postlar", "/feed"], ["So‘rovlar", "/requests"], ["Agentlar", "/agents"], ["Bitimlar", "/deals"], ["Chat", "/messenger"],
  ] as const;
  const mobileNavigation = isRu ? [
    ["AI", "/dashboard", "✦"], ["Запрос", "/requests", "↔"], ["Агент", "/agents", "◎"], ["Сделка", "/deals", "◇"], ["Чат", "/messenger", "◌"],
  ] as const : [
    ["AI", "/dashboard", "✦"], ["So‘rov", "/requests", "↔"], ["Agent", "/agents", "◎"], ["Bitim", "/deals", "◇"], ["Chat", "/messenger", "◌"],
  ] as const;

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const addToast = useCallback((toast: ChatToastData) => {
    setToasts((current) => [...current.filter((existing) => existing.id !== toast.id), toast].slice(-MAX_TOASTS));
  }, []);
  const closeToast = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const openToast = useCallback((toast: ChatToastData) => { closeToast(toast.id); router.push(toast.href); }, [closeToast, router]);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
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
        setAccountActive(profile.is_active !== false);
        setMissingFields(missingProfileFields(profile));
      }).catch(() => undefined);
      registerServiceWorker().catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const update = () => {
      const stored = getStoredSession();
      if (!stored) { window.location.replace("/login"); return; }
      setCurrentSession((current) => current?.user.id === stored.user.id ? current : stored);
    };
    const onStorage = (event: StorageEvent) => { if (event.key === SESSION_STORAGE_KEY || event.key === null) update(); };
    const updateProfile = () => { void getCurrentProfile().then((profile) => {
      if (!profile) return;
      setProfileName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
      setRole(profile.role || "agent");
      setAccountActive(profile.is_active !== false);
      setMissingFields(missingProfileFields(profile));
    }).catch(() => undefined); };
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, update);
    window.addEventListener("storage", onStorage);
    window.addEventListener("my-agent-air:profile-updated", updateProfile);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, update);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("my-agent-air:profile-updated", updateProfile);
    };
  }, []);

  const visibleNavigation = role === "admin" ? [...navigation, ["Admin", "/admin"] as const] : navigation;

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
      if (!messageId || !dealId || !senderId || senderId === currentSession.user.id || !rememberMessageId(seenMessageIds.current, messageId)) return;
      const activeDealId = pathnameRef.current?.match(/^\/messages\/([^/]+)/)?.[1];
      if (document.visibilityState === "visible" && (activeDealId === dealId || pathnameRef.current === `/deals/${dealId}`)) return;
      playNotificationSound();
      getDeal(dealId).then((deal) => {
        if (!deal) return;
        const agent = deal.buyer_id === senderId ? deal.buyer : deal.seller;
        const senderName = agent?.full_name || agent?.company_name || "Agent";
        const routeTitle = deal.request ? `${deal.request.origin || "—"} → ${deal.request.destination || "—"}` : (isRu ? "Чат сделки" : "Bitim chati");
        addToast({ id: messageId, sender: senderName, title: `${isRu ? "Чат сделки" : "Bitim chati"}: ${routeTitle}`, preview: truncatePreview(text), href: `/deals/${dealId}` });
      }).catch(() => undefined);
    };

    const handleMessengerMessage = (payload: RealtimeMessagePayload) => {
      refreshUnread();
      const row = payload.new;
      const messageId = typeof row.id === "string" ? row.id : null;
      const roomId = typeof row.room_id === "string" ? row.room_id : null;
      const senderId = typeof row.sender_id === "string" ? row.sender_id : null;
      const text = typeof row.message === "string" ? row.message : "";
      if (!messageId || !roomId || !senderId || senderId === currentSession.user.id || !rememberMessageId(seenMessageIds.current, messageId)) return;
      const activeRoomId = pathnameRef.current?.match(/^\/messenger\/([^/]+)/)?.[1];
      if (document.visibilityState === "visible" && (activeRoomId === roomId || activeFloatingRoom.current === roomId)) return;
      playNotificationSound();
      Promise.all([listMessengerConversations(), getAgent(senderId)]).then(([conversations, agent]) => {
        const conversation = conversations.find((item) => item.room_id === roomId);
        const chatTitle = conversation?.room_type === "group" ? conversation.title || (isRu ? "Групповой чат" : "Guruh chati") : conversation?.room_type === "public" ? (isRu ? "Общий чат" : "Umumiy chat") : conversation?.counterpart_full_name || agent?.full_name || "Chat";
        const senderName = agent?.full_name || agent?.company_name || conversation?.counterpart_full_name || "Agent";
        addToast({ id: messageId, sender: senderName, title: chatTitle, preview: truncatePreview(text), href: `/messenger/${roomId}` });
      }).catch(() => undefined);
    };

    const realtime = subscribeToMessages(handleDealMessage);
    const messengerRealtime = subscribeToMessengerMessages(handleMessengerMessage);
    refreshUnread();
    window.addEventListener("focus", refreshUnread);
    window.addEventListener(CHAT_READ_EVENT, refreshUnread);
    const onActiveRoom = (event: Event) => { activeFloatingRoom.current = (event as CustomEvent<string | null>).detail; };
    window.addEventListener(ACTIVE_MESSENGER_ROOM_EVENT, onActiveRoom);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshUnread);
      window.removeEventListener(CHAT_READ_EVENT, refreshUnread);
      window.removeEventListener(ACTIVE_MESSENGER_ROOM_EVENT, onActiveRoom);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (realtime) realtime.client.removeChannel(realtime.channel);
      if (messengerRealtime) messengerRealtime.client.removeChannel(messengerRealtime.channel);
      if (unreadRefreshTimer.current !== null) window.clearTimeout(unreadRefreshTimer.current);
      unreadRefreshTimer.current = null;
    };
  }, [currentSession, addToast, isRu]);

  async function handleLogout() {
    setIsSigningOut(true);
    await disablePushNotifications().catch(() => undefined);
    await signOut();
    window.location.replace("/login");
  }

  if (!isReady || !currentSession) return <main className="flex min-h-screen items-center justify-center bg-[#eef5fb] text-sm text-slate-500">{isRu ? "Загрузка..." : "Yuklanmoqda..."}</main>;

  return (
    <div className="min-h-screen bg-[#eef5fb] text-[#0b1f3a] lg:flex">
      <aside className="hidden w-56 shrink-0 flex-col bg-[#0b1f3a] px-4 py-5 text-white lg:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 text-sm font-semibold tracking-wide focus:outline-none focus:ring-2 focus:ring-cyan-300"><BrandMark /> MY AGENT AIR</Link>
        <nav aria-label={isRu ? "Основная навигация" : "Asosiy navigatsiya"} className="mt-8 space-y-1">
          {visibleNavigation.map(([label, href]) => (
            <Link key={href} href={href} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${(activePath === href || (href === "/deals" && activePath === "/messages")) ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30" : "text-blue-100 hover:bg-white/10 hover:text-white"}`}>
              <span>{label}</span>
              {href === "/deals" && unreadMessages > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-bold text-white">{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
              {href === "/messenger" && unreadMessenger > 0 && <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-bold text-[#0b1f3a]">{unreadMessenger > 99 ? "99+" : unreadMessenger}</span>}
            </Link>
          ))}
        </nav>
        <div className="mt-5 px-1">
          <UiControls inverse />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/profile" className="rounded-xl border border-white/15 px-3 py-2.5 text-center text-xs font-medium text-blue-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300">{isRu ? "Профиль" : "Profil"}</Link>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} aria-label={isRu ? "Выйти" : "Chiqish"} className="rounded-xl border border-white/15 px-3 py-2.5 text-center text-xs font-medium text-blue-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 disabled:opacity-60">{isSigningOut ? (isRu ? "Выход..." : "Chiqilmoqda...") : (isRu ? "Выйти" : "Chiqish")}</button>
          </div>
        </div>
        <div className="mt-auto border-t border-white/10 pt-4">
          <p className="truncate px-2 text-sm font-semibold">{profileName || currentSession.user.email || (isRu ? "Пользователь" : "Foydalanuvchi")}</p>
          <p className="truncate px-2 text-[11px] text-blue-200">{companyName || (isRu ? "Компания" : "Kompaniya")} · {role === "admin" ? "Admin" : "Agent"}</p>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-16 lg:pb-0">
        <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-5 lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-bold tracking-wide"><BrandMark /> MY AGENT AIR</Link>
          <div className="flex items-center gap-1.5">
            <UiControls compact />
            <Link href="/profile" className="hidden rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 sm:block">{isRu ? "Профиль" : "Profil"}</Link>
            <button type="button" onClick={handleLogout} disabled={isSigningOut} aria-label={isRu ? "Выйти" : "Chiqish"} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600">{isRu ? "Выход" : "Chiqish"}</button>
          </div>
        </header>

        <main className={`mx-auto w-full max-w-[1500px] ${isDashboard ? "px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-5" : "px-4 py-5 sm:px-8 sm:py-8"}`}>
          {!accountActive && <div role="alert" className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:mb-4 sm:p-4 sm:text-sm">{isRu ? "Ваш аккаунт заблокирован. Новые действия ограничены." : "Hisobingiz bloklangan. Yangi amallar cheklangan."}</div>}
          {missingFields.length > 0 && activePath !== "/profile" && !isDashboard && <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{isRu ? "Чтобы начать работу с партнёрами, заполните профиль." : `Hamkorlikni boshlash uchun profilingizni to‘ldiring: ${missingFields.join(", ")}.`} <Link href="/profile?complete=1" className="font-semibold underline">{isRu ? "Заполнить профиль →" : "Profilni to‘ldirish →"}</Link></div>}
          {children}
          {!isDashboard && <footer className="mt-10 flex flex-wrap gap-4 border-t border-slate-200 pt-4 text-xs text-slate-500"><Link href="/terms">{isRu ? "Условия использования" : "Foydalanish shartlari"}</Link><Link href="/privacy">{isRu ? "Конфиденциальность" : "Maxfiylik"}</Link><Link href="/help">{isRu ? "Помощь" : "Yordam"}</Link></footer>}
        </main>
      </div>

      <nav aria-label={isRu ? "Мобильная навигация" : "Mobil asosiy navigatsiya"} className="fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden dark:bg-slate-950/95">
        {mobileNavigation.map(([label, href, icon]) => {
          const active = activePath === href || (href === "/deals" && activePath === "/messages");
          const badge = href === "/deals" ? unreadMessages : href === "/messenger" ? unreadMessenger : 0;
          return <Link key={href} href={href} className={`relative flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-semibold ${active ? "text-blue-600" : "text-slate-500"}`}>
            <span className={`flex h-7 w-9 items-center justify-center rounded-xl text-base ${active ? "bg-blue-50" : ""}`}>{icon}</span>
            <span className="truncate">{label}</span>
            {badge > 0 && <span className="absolute right-[18%] top-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] leading-none text-white">{badge > 99 ? "99+" : badge}</span>}
          </Link>;
        })}
      </nav>

      <ChatToastStack toasts={toasts} onClose={closeToast} onOpen={openToast} />
      <FloatingMessengerPanel activePath={activePath} />
    </div>
  );
}