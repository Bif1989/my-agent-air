"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseRequestDrafts } from "@/lib/request-assistant";
import { parseDomesticItineraryRequests } from "@/lib/domestic-itinerary-parser";
import { domesticTourAdvice, isUzbekistanDomesticTourism } from "@/lib/uzbekistan-tourism";
import {
  createAiConversation,
  listAiChatHistory,
  listAiConversations,
  renameAiConversation,
  saveAiChatMessage,
  type AiConversation,
  type AiHistoryAction,
} from "@/lib/ai-chat-history";
import { useUiSettings } from "@/lib/ui-settings";
import type { AuthSession } from "@/lib/supabase-auth";

type DashboardStats = { openRequests: number; offers: number; deals: number; agents: number };
type AiActionKey = "create_request" | "open_requests" | "open_agents" | "open_deals" | "open_chat" | "open_profile" | "open_feed" | "none";
type ChatEntry = { id: string; sender: "user" | "assistant"; text: string; actions?: AiHistoryAction[] };
type AiResponse = { message?: string; action?: AiActionKey; code?: string };

const categoryRu: Record<string, string> = { Aviachipta: "Авиабилет", "Tur paket": "Турпакет", Mehmonxona: "Отель", Transfer: "Трансфер", Gid: "Гид", Viza: "Виза", Boshqa: "Другое" };

function actionMap(isRu: boolean): Record<Exclude<AiActionKey, "none">, AiHistoryAction> {
  return {
    create_request: { label: isRu ? "Создать новый запрос" : "Yangi so‘rov yaratish", href: "/requests/new" },
    open_requests: { label: isRu ? "Запросы и предложения" : "So‘rovlar va takliflar", href: "/requests" },
    open_agents: { label: isRu ? "Открыть агентов" : "Agentlarni ko‘rish", href: "/agents" },
    open_deals: { label: isRu ? "Открыть сделки" : "Bitimlarni ko‘rish", href: "/deals" },
    open_chat: { label: isRu ? "Открыть чат" : "Chatni ochish", href: "/messenger" },
    open_profile: { label: isRu ? "Открыть профиль" : "Profilni ochish", href: "/profile" },
    open_feed: { label: isRu ? "Открыть посты" : "Postlarni ko‘rish", href: "/feed" },
  };
}

function normalizeIntent(text: string) {
  return text.toLowerCase().replace(/[ʻ’`´]/g, "'").replace(/\s+/g, " ").trim();
}

function localAction(text: string, isRu: boolean, actions: ReturnType<typeof actionMap>): { text: string; action?: AiHistoryAction } | null {
  const value = normalizeIntent(text);
  if (/profil|akkaunt|профил|аккаунт/.test(value)) return { text: isRu ? "Данные профиля можно посмотреть и заполнить в этом разделе." : "Profil ma’lumotlaringizni shu bo‘limda ko‘rish va to‘ldirish mumkin.", action: actions.open_profile };
  if (/chat|xabar|yozish|чат|сообщен/.test(value)) return { text: isRu ? "Переписка с агентами находится в разделе Чат. Там же видны непрочитанные сообщения." : "Agentlar bilan yozishmalar Chat bo‘limida. O‘qilmagan xabarlar ham shu yerda ko‘rinadi.", action: actions.open_chat };
  if (/bitim|deal|сделк/.test(value)) return { text: isRu ? "Принятые предложения переходят в Сделки. Там можно отслеживать статус и чат сделки." : "Qabul qilingan takliflar Bitimlar bo‘limiga o‘tadi. Holat va bitim chatini shu yerdan boshqarasiz.", action: actions.open_deals };
  if (/agent.*(top|qidir|ko'r|kor)|hamkor|агент.*(най|поиск|показ)|партн[её]р/.test(value)) return { text: isRu ? "Подходящего партнёра можно найти в каталоге агентов." : "Agentlar katalogidan mos hamkorni topishingiz mumkin.", action: actions.open_agents };
  if (/post|e'lon|elon|lenta|пост|объявлен|лента/.test(value)) return { text: isRu ? "Посты и объявления платформы находятся в этом разделе." : "Platformadagi e’lon va postlar shu bo‘limda.", action: actions.open_feed };
  if (/so'rov.*(ko'r|kor|ochiq)|taklif.*ko'r|takliflar|запрос.*(показ|откр)|предложен/.test(value)) return { text: isRu ? "Текущие запросы и предложения можно управлять в этом разделе." : "Amaldagi so‘rovlar va yuborilgan takliflarni shu bo‘limdan boshqarasiz.", action: actions.open_requests };
  if (/so'rov.*(yarat|och)|yangi so'rov|созда.*запрос|новый запрос/.test(value)) return { text: isRu ? "Создадим новый запрос. В одном сообщении можно указать несколько маршрутов или услуг." : "Yangi so‘rov ochamiz. Bir xabarning o‘zida bir nechta alohida yo‘nalish yoki xizmatni yozishingiz mumkin.", action: actions.create_request };
  if (/qanday ishlay|o'rgat|orgat|nima qilay|как.*работ|что.*делать|объясни/.test(value)) return { text: isRu ? "Порядок работы: 1) создаёте запрос; 2) агенты отправляют предложения; 3) принимаете подходящее; 4) открывается сделка; 5) статус и переписка ведутся внутри Сделки." : "Ish tartibi: 1) so‘rov yaratasiz; 2) agentlar taklif yuboradi; 3) mos taklifni qabul qilasiz; 4) bitim ochiladi; 5) holat va yozishmani Bitimlar ichida boshqarasiz." };
  return null;
}

function looksLikeTravelRequest(text: string) {
  const explicit = /\b[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}\b/i.test(text) || /(avia|chipta|bilet|mehmonxona|mexmonxona|hotel|otel|transfer|transport|miniven|minivan|mikroavtobus|avtobus|gid|viza|visa|tur\b|sayohat|тур\b|авиа|чипта|билет|ме[ҳх]монхона|отель|трансфер|транспорт|минив[эе]н|автобус|гид|виза)/i.test(text);
  if (explicit) return true;
  if (!isUzbekistanDomesticTourism(text)) return false;
  return /(kerak|so['’`]?rov|tashkil|bormoqch|sayohat|tur\b|guruh|bron|buyurtma|olib bor|jo['’`]?nash|кетиш|саёхат|сафар|керак|гуру[ҳх]|нуж|организ|поездк|тур\b|брон|\d+\s*(?:kishi|odam|kun|tun|kecha|киши|одам|кун|дн|ноч|человек))/i.test(text);
}

function formatDraftLabel(draft: ReturnType<typeof parseRequestDrafts>[number]["draft"], isRu: boolean) {
  const route = [draft.origin, draft.destination].filter(Boolean).join(" → ");
  const date = draft.travel_date ? draft.travel_date.split("-").reverse().join(".") : "";
  const category = draft.category ? (isRu ? categoryRu[draft.category] || draft.category : draft.category) : (isRu ? "Запрос" : "So‘rov");
  return [category, route, date].filter(Boolean).join(" · ");
}

function domesticAdviceSuffix(text: string, isRu: boolean) {
  const advice = domesticTourAdvice(text);
  if (!advice) return "";
  if (isRu) {
    const parts: string[] = [];
    if (advice.attractions.length) parts.push(`Можно включить в маршрут: ${advice.attractions.slice(0, 5).join(", ")}.`);
    if (advice.reminders.length) parts.push("Дополнительно можно создать отдельные запросы на гида, питание/ресторан, билеты в музеи и локальный транспорт.");
    return parts.length ? `\n\nСовет по внутреннему туризму: ${parts.join(" ")}` : "";
  }
  const parts: string[] = [];
  if (advice.attractions.length) parts.push(`Yo‘nalishda ko‘rib chiqish mumkin: ${advice.attractions.slice(0, 5).join(", ")}.`);
  if (advice.reminders.length) parts.push(`Qo‘shimcha so‘rov yaratish mumkin: ${advice.reminders.join(", ")}.`);
  return parts.length ? `\n\nIchki turizm tavsiyasi: ${parts.join(" ")}` : "";
}

function conversationTitleFromMessage(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 58 ? `${compact.slice(0, 57).trimEnd()}…` : compact;
}

function isDefaultConversationTitle(title: string) {
  return title === "Yangi chat" || title === "Новый чат";
}

export default function AiCommandCenter({ session, displayName, stats }: { session: AuthSession; displayName: string; stats: DashboardStats }) {
  const { isRu, locale } = useUiSettings();
  const actions = actionMap(isRu);
  const greeting: ChatEntry = { id: "greeting", sender: "assistant", text: isRu ? `${displayName || "Партнёр"}, здравствуйте. Начните одну задачу или тур в этом чате. Я буду помнить весь текущий диалог. Для другой задачи нажмите «Новый чат».` : `${displayName || "Hamkor"}, salom. Shu chatda bitta masala yoki tur paketini boshlang. Men shu chat tarixini eslab davom ettiraman. Boshqa masala uchun “Yangi chat” bosing.` };
  const quickPrompts = isRu ? [
    { title: "Внутренний тур", detail: "Маршрут + группа + услуги", prompt: "На 10 ноября организуем тур Чуст–Самарканд–Бухара для 20 человек. Нужен минивэн, в Самарканде отель на 2 ночи с завтраком до 250 тысяч сум на человека, в Бухаре 1 ночь до 300 тысяч сум на человека" },
    { title: "Открытые запросы", detail: "Посмотреть текущие запросы", prompt: "Покажи открытые запросы" },
    { title: "Найти агента", detail: "Найти подходящего партнёра", prompt: "Помоги найти агента" },
    { title: "Как работает?", detail: "От запроса до сделки", prompt: "Как работает процесс от запроса до сделки?" },
  ] : [
    { title: "Ichki tur", detail: "Yo‘nalish + guruh + xizmatlar", prompt: "10 noyabrga Samarqand+Buxoro 20 kishiga Chustdan tur. Miniven kerak, Samarqandda 2 kecha nonushta bilan hotel 250 ming so‘m kishi boshiga, Buxoroda 1 kecha 300 ming so‘m kishi boshiga" },
    { title: "Ochiq so‘rovlar", detail: "Hozirgi talablarni ko‘rish", prompt: "Ochiq so‘rovlarni ko‘rsat" },
    { title: "Agent topish", detail: "Mos hamkorni topishga yordam", prompt: "Agent topishga yordam ber" },
    { title: "Qanday ishlaydi?", detail: "So‘rovdan bitimgacha yo‘l", prompt: "So‘rovdan bitimgacha qanday ishlaydi?" },
  ];

  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([greeting]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const [threadError, setThreadError] = useState("");
  const sequence = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((item) => item.id === activeConversationId) || null;

  useEffect(() => {
    let active = true;
    async function loadConversations() {
      try {
        const loaded = await listAiConversations(session);
        if (!active) return;
        if (loaded.length) {
          setConversations(loaded);
          setActiveConversationId((current) => current || loaded[0].id);
          return;
        }
        const created = await createAiConversation(session, isRu ? "Новый чат" : "Yangi chat");
        if (!active) return;
        setConversations([created]);
        setActiveConversationId(created.id);
      } catch {
        if (active) setThreadError(isRu ? "Не удалось загрузить историю чатов." : "Chatlar tarixini yuklab bo‘lmadi.");
      }
    }
    void loadConversations();
    return () => { active = false; };
  }, [session, isRu]);

  useEffect(() => {
    if (!activeConversationId) return;
    let active = true;
    setHistoryReady(false);
    listAiChatHistory(session, activeConversationId).then((rows) => {
      if (!active) return;
      setEntries(rows.length ? rows.map((row) => ({ id: row.id, sender: row.role, text: row.content, actions: row.actions })) : [greeting]);
    }).catch(() => {
      if (active) setEntries([greeting]);
    }).finally(() => { if (active) setHistoryReady(true); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  useEffect(() => {
    setEntries((current) => current.length === 1 && current[0]?.id === "greeting" ? [greeting] : current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (!historyReady) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries, historyReady]);

  async function startNewConversation() {
    if (busy) return;
    setThreadError("");
    try {
      const created = await createAiConversation(session, isRu ? "Новый чат" : "Yangi chat");
      setConversations((current) => [created, ...current]);
      setActiveConversationId(created.id);
      setEntries([greeting]);
      setInput("");
      setThreadsOpen(false);
    } catch {
      setThreadError(isRu ? "Не удалось создать новый чат." : "Yangi chat yaratib bo‘lmadi.");
    }
  }

  function openConversation(id: string) {
    if (id === activeConversationId) { setThreadsOpen(false); return; }
    setInput("");
    setActiveConversationId(id);
    setThreadsOpen(false);
  }

  function appendEntry(conversationId: string, sender: "user" | "assistant", text: string, entryActions: AiHistoryAction[] = []) {
    const entry: ChatEntry = { id: `${Date.now()}-${++sequence.current}`, sender, text, actions: entryActions };
    setEntries((current) => [...current.filter((item) => item.id !== "greeting"), entry].slice(-80));
    void saveAiChatMessage(session, conversationId, sender, text, entryActions).catch(() => undefined);
    return entry;
  }

  async function ensureConversation() {
    if (activeConversationId) return activeConversationId;
    const created = await createAiConversation(session, isRu ? "Новый чат" : "Yangi chat");
    setConversations((current) => [created, ...current]);
    setActiveConversationId(created.id);
    return created.id;
  }

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || busy) return;
    setBusy(true);
    setInput("");

    try {
      const conversationId = await ensureConversation();
      const previousEntries = entries.filter((entry) => entry.id !== "greeting");
      const hasPriorUserMessage = previousEntries.some((entry) => entry.sender === "user");
      const currentConversation = conversations.find((item) => item.id === conversationId);

      appendEntry(conversationId, "user", text);

      if (!hasPriorUserMessage && (!currentConversation || isDefaultConversationTitle(currentConversation.title))) {
        const title = conversationTitleFromMessage(text) || (isRu ? "Новый чат" : "Yangi chat");
        setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, title, updated_at: new Date().toISOString() } : item));
        void renameAiConversation(session, conversationId, title).catch(() => undefined);
      }

      // Fast local parsing is only used for the first turn. After that, every follow-up
      // goes through the AI together with this thread's history so edits stay contextual.
      if (!hasPriorUserMessage && looksLikeTravelRequest(text)) {
        const itineraryDrafts = parseDomesticItineraryRequests(text);
        const parsedDrafts = (itineraryDrafts.length ? itineraryDrafts : parseRequestDrafts(text)).filter((item) => item.draft.category || item.draft.origin || item.draft.destination);
        if (parsedDrafts.length) {
          const draftActions = parsedDrafts.map(({ draft }) => ({ label: formatDraftLabel(draft, isRu), href: `/requests/new?draft=${encodeURIComponent(JSON.stringify(draft))}` }));
          const missing = Array.from(new Set(parsedDrafts.flatMap((item) => item.missing)));
          const advice = itineraryDrafts.length
            ? (isRu ? "\n\nСовет: можно также создать отдельные запросы на гида/экскурсовода, ресторан для обеда или ужина, а также входные билеты в музеи и объекты." : "\n\nIchki turizm tavsiyasi: gid/ekskursovod, tushlik yoki kechki ovqat uchun guruh restorani hamda muzey va obyektlarga kirish chiptalari uchun ham alohida so‘rov yaratish mumkin.")
            : domesticAdviceSuffix(text, isRu);
          const reply = isRu
            ? (parsedDrafts.length > 1 ? `Подготовил ${parsedDrafts.length} отдельных черновика запроса.${missing.length ? ` Нужно уточнить: ${missing.join(", ")}. Напишите уточнение прямо сюда — я продолжу этот же пакет.` : " Каждый можно открыть, проверить и опубликовать отдельно."}${advice}` : `Черновик запроса готов.${missing.length ? ` Нужно уточнить: ${missing.join(", ")}. Напишите уточнение прямо сюда — я сохраню контекст.` : " Откройте форму, проверьте и опубликуйте."}${advice}`)
            : (parsedDrafts.length > 1 ? `${parsedDrafts.length} ta alohida so‘rov qoralamasi tayyorladim.${missing.length ? ` Yetishmayotgan ma’lumot: ${missing.join(", ")}. Shu chatga aniqlikni yozing — shu paketni davom ettiraman.` : " Har birini alohida ochib tekshirib e’lon qilishingiz mumkin."}${advice}` : `${parsedDrafts[0]?.draft.category || "So‘rov"} qoralamasi tayyor.${missing.length ? ` Aniqlashtirish kerak: ${missing.join(", ")}. Shu chatga yozing — oldingi ma’lumotlarni saqlab davom ettiraman.` : " Formani ochib tekshiring va keyin e’lon qiling."}${advice}`);
          appendEntry(conversationId, "assistant", reply, draftActions);
          return;
        }
      }

      if (!hasPriorUserMessage) {
        const local = localAction(text, isRu, actions);
        if (local) {
          appendEntry(conversationId, "assistant", local.text, local.action ? [local.action] : []);
          return;
        }
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          message: text,
          history: previousEntries.slice(-18).map((entry) => ({ role: entry.sender, content: entry.text })),
          context: {
            path: "/dashboard",
            stats,
            locale,
            conversationTitle: currentConversation?.title || conversationTitleFromMessage(text),
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as AiResponse;
      if (!response.ok) {
        const fallback = data.code === "AI_NOT_CONFIGURED"
          ? (isRu ? "AI-модель ещё не подключена на сервере. История этого чата сохранена и продолжит работать после подключения модели." : "AI modeli hali serverga ulanmagan. Bu chat tarixi saqlandi va model ulangach shu yerdan davom etadi.")
          : (isRu ? "Временная ошибка подключения к AI. История чата сохранена — повторите сообщение позже." : "AI xizmatiga ulanishda vaqtinchalik xatolik. Chat tarixi saqlandi — keyinroq qayta yuboring.");
        appendEntry(conversationId, "assistant", fallback);
        return;
      }
      const action = data.action && data.action !== "none" ? actions[data.action] : undefined;
      appendEntry(conversationId, "assistant", data.message || (isRu ? "Продолжаю по текущему чату." : "Shu chat bo‘yicha davom etaman."), action ? [action] : []);
    } catch {
      const conversationId = activeConversationId;
      if (conversationId) appendEntry(conversationId, "assistant", isRu ? "Ошибка подключения к AI. История текущего чата сохранена." : "AI xizmatiga ulanishda xatolik. Joriy chat tarixi saqlandi.");
    } finally {
      setBusy(false);
    }
  }

  const historyList = (
    <div className="space-y-1.5">
      {conversations.map((conversation) => (
        <button key={conversation.id} type="button" onClick={() => openConversation(conversation.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition ${conversation.id === activeConversationId ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-700 hover:bg-blue-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"}`}>
          <p className="truncate text-xs font-semibold">{conversation.title}</p>
          <p className={`mt-1 text-[10px] ${conversation.id === activeConversationId ? "text-blue-100" : "text-slate-400"}`}>{new Intl.DateTimeFormat(isRu ? "ru-RU" : "uz-UZ", { day: "2-digit", month: "short" }).format(new Date(conversation.updated_at))}</p>
        </button>
      ))}
    </div>
  );

  return (
    <section className="grid h-full min-h-0 gap-3 xl:min-h-[620px] xl:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden min-h-[620px] flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:flex">
        <button type="button" onClick={() => void startNewConversation()} className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-700">+ {isRu ? "Новый чат" : "Yangi chat"}</button>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{isRu ? "ИСТОРИЯ" : "TARIX"}</p>
          {historyList}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-center">
          <Link href="/requests" className="rounded-xl bg-blue-50 p-2"><p className="text-[9px] text-blue-500">{isRu ? "Запросы" : "So‘rov"}</p><p className="text-sm font-semibold text-[#0b1f3a]">{stats.openRequests}</p></Link>
          <Link href="/deals" className="rounded-xl bg-emerald-50 p-2"><p className="text-[9px] text-emerald-600">{isRu ? "Сделки" : "Bitim"}</p><p className="text-sm font-semibold text-[#0b1f3a]">{stats.deals}</p></Link>
        </div>
      </aside>

      <div className="relative flex h-[calc(100dvh-8.25rem)] min-h-[430px] max-h-[760px] flex-col overflow-hidden rounded-[22px] border-2 border-blue-200 bg-white shadow-[0_20px_70px_rgba(37,99,235,0.16)] xl:h-auto xl:min-h-[620px] xl:rounded-[28px]">
        {threadsOpen && <div className="absolute inset-0 z-30 flex flex-col bg-white p-3 dark:bg-slate-950 xl:hidden"><div className="flex items-center justify-between border-b border-slate-200 pb-3"><div><p className="text-sm font-semibold text-[#0b1f3a]">{isRu ? "История AI" : "AI chatlar tarixi"}</p><p className="mt-0.5 text-[10px] text-slate-400">{isRu ? "Каждая задача хранится отдельно" : "Har bir masala alohida saqlanadi"}</p></div><button type="button" onClick={() => setThreadsOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">✕</button></div><button type="button" onClick={() => void startNewConversation()} className="mt-3 rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white">+ {isRu ? "Новый чат" : "Yangi chat"}</button><div className="mt-3 min-h-0 flex-1 overflow-y-auto">{historyList}</div></div>}

        <div className="flex shrink-0 items-center justify-between gap-2 bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xs font-bold ring-1 ring-white/30 sm:h-9 sm:w-9 sm:text-sm">AI</div><div className="min-w-0"><p className="text-sm font-semibold">My Agent Air AI</p><p className="truncate text-[10px] text-blue-50 sm:text-[11px]">{activeConversation?.title || (isRu ? "Новый чат" : "Yangi chat")}</p></div></div>
          <div className="flex shrink-0 items-center gap-1.5"><button type="button" onClick={() => setThreadsOpen(true)} className="rounded-lg bg-white/15 px-2.5 py-1.5 text-[10px] font-semibold ring-1 ring-white/20 xl:hidden">{isRu ? "История" : "Tarix"}</button><button type="button" onClick={() => void startNewConversation()} className="rounded-lg bg-white px-2.5 py-1.5 text-[10px] font-bold text-blue-700">+ {isRu ? "Новый" : "Yangi"}</button></div>
        </div>

        {threadError && <div className="border-b border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{threadError}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-blue-50/40 via-white to-white px-3 py-3 sm:px-5 sm:py-5" aria-live="polite">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col">
            {!historyReady && activeConversationId && <div className="flex min-h-32 items-center justify-center text-xs text-slate-400">{isRu ? "Загрузка истории чата..." : "Chat tarixi yuklanmoqda..."}</div>}
            {historyReady && <div className="space-y-3 sm:space-y-5">
              {entries.map((entry) => (
                <div key={entry.id} className={`flex gap-3 ${entry.sender === "user" ? "justify-end" : "justify-start"}`}>
                  {entry.sender === "assistant" && <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white sm:flex">AI</div>}
                  <div className={entry.sender === "user" ? "max-w-[90%] sm:max-w-[78%]" : "max-w-[96%] sm:max-w-[84%]"}>
                    <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 sm:px-4 sm:py-3 sm:text-sm sm:leading-6 ${entry.sender === "user" ? "bg-[#0b1f3a] text-white shadow-sm" : "border border-blue-100 bg-blue-50 text-slate-700"}`}>{entry.text}</div>
                    {Boolean(entry.actions?.length) && <div className="mt-2 flex flex-wrap gap-2">{entry.actions?.map((entryAction) => <Link key={`${entry.id}-${entryAction.href}`} href={entryAction.href} className="inline-flex rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4 sm:text-xs">{entryAction.label} →</Link>)}</div>}
                  </div>
                </div>
              ))}
              {busy && <div className="flex items-center gap-3"><div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white sm:flex">AI</div><div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">{isRu ? "AI продолжает текущую тему…" : "AI joriy mavzuni davom ettiryapti…"}</div></div>}
              <div ref={bottomRef} />
            </div>}

            {historyReady && entries.length === 1 && entries[0]?.id === "greeting" && <div className="mt-auto pt-3 sm:pt-5 xl:pt-8"><p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-400">{isRu ? "БЫСТРЫЙ СТАРТ" : "Tez boshlash"}</p><div className="grid grid-cols-2 gap-2">{quickPrompts.map((item, index) => <button key={item.prompt} type="button" onClick={() => void send(item.prompt)} className={`min-h-12 rounded-xl border p-2 text-left transition sm:min-h-0 sm:rounded-2xl sm:p-3 ${index === 0 ? "border-blue-200 bg-blue-50 hover:bg-blue-100" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"}`}><p className="text-[11px] font-semibold text-[#0b1f3a] sm:text-xs">{item.title}</p><p className="mt-1 hidden text-[11px] leading-4 text-slate-400 sm:block">{item.detail}</p></button>)}</div></div>}
          </div>
        </div>

        <div className="shrink-0 border-t border-blue-100 bg-blue-50/80 px-2.5 pb-2.5 pt-2.5 backdrop-blur sm:px-5 sm:pb-4 sm:pt-3">
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="mx-auto max-w-3xl rounded-[22px] border-2 border-blue-300 bg-white p-1.5 shadow-[0_8px_30px_rgba(37,99,235,0.12)] transition focus-within:border-blue-500 focus-within:shadow-[0_10px_35px_rgba(37,99,235,0.2)] sm:rounded-[26px] sm:p-2">
            <textarea aria-label={isRu ? "Напишите AI-помощнику" : "AI yordamchiga yozing"} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} maxLength={1500} placeholder={entries.some((entry) => entry.sender === "user") ? (isRu ? "Продолжите текущую задачу: измените, уточните или дополните…" : "Joriy masalani davom ettiring: o‘zgartiring, aniqlik kiriting…") : (isRu ? "Опишите одну задачу или турпакет…" : "Bitta masala yoki tur paketini yozing…")} className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[#0b1f3a] outline-none placeholder:text-blue-300 sm:py-2.5" />
            <div className="flex items-center justify-end px-1.5 pb-1 sm:justify-between sm:px-2"><p className="hidden text-[11px] text-slate-400 sm:block">{isRu ? "Этот чат помнит текущую задачу · Новый чат — новая задача" : "Bu chat joriy masalani eslaydi · Yangi chat — yangi masala"}</p><button type="submit" disabled={busy || !input.trim() || !historyReady} className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-blue-600 px-3 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-4 sm:text-xs">{isRu ? "Отправить" : "Yuborish"}</button></div>
          </form>
        </div>
      </div>
    </section>
  );
}
