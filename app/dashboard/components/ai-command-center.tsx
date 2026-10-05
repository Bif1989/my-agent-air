"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { parseRequestDrafts } from "@/lib/request-assistant";
import { listAiChatHistory, saveAiChatMessage, type AiHistoryAction } from "@/lib/ai-chat-history";
import type { AuthSession } from "@/lib/supabase-auth";

type DashboardStats = { openRequests: number; offers: number; deals: number; agents: number };
type AiActionKey = "create_request" | "open_requests" | "open_agents" | "open_deals" | "open_chat" | "open_profile" | "open_feed" | "none";
type ChatEntry = { id: string; sender: "user" | "assistant"; text: string; actions?: AiHistoryAction[] };
type AiResponse = { message?: string; action?: AiActionKey; code?: string };

const actionMap: Record<Exclude<AiActionKey, "none">, AiHistoryAction> = {
  create_request: { label: "Yangi so‘rov yaratish", href: "/requests/new" },
  open_requests: { label: "So‘rovlar va takliflar", href: "/requests" },
  open_agents: { label: "Agentlarni ko‘rish", href: "/agents" },
  open_deals: { label: "Bitimlarni ko‘rish", href: "/deals" },
  open_chat: { label: "Chatni ochish", href: "/messenger" },
  open_profile: { label: "Profilni ochish", href: "/profile" },
  open_feed: { label: "Postlarni ko‘rish", href: "/feed" },
};

const quickPrompts = [
  { title: "Yangi so‘rov", detail: "Aviachipta, tur, hotel yoki transfer", prompt: "TAS–IST 10 oktabr 2 kishi uchun aviachipta, mehmonxona va transfer kerak" },
  { title: "Ochiq so‘rovlar", detail: "Hozirgi talablarni ko‘rish", prompt: "Ochiq so‘rovlarni ko‘rsat" },
  { title: "Agent topish", detail: "Mos hamkorni topishga yordam", prompt: "Agent topishga yordam ber" },
  { title: "Qanday ishlaydi?", detail: "So‘rovdan bitimgacha yo‘l", prompt: "So‘rovdan bitimgacha qanday ishlaydi?" },
];

function normalizeIntent(text: string) {
  return text.toLowerCase().replace(/[ʻ’`´]/g, "'").replace(/\s+/g, " ").trim();
}

function localAction(text: string): { text: string; action?: AiHistoryAction } | null {
  const value = normalizeIntent(text);
  if (/profil|akkaunt/.test(value)) return { text: "Profil ma’lumotlaringizni shu bo‘limda ko‘rish va to‘ldirish mumkin.", action: actionMap.open_profile };
  if (/chat|xabar|yozish/.test(value)) return { text: "Agentlar bilan yozishmalar Chat bo‘limida. O‘qilmagan xabarlar ham shu yerda ko‘rinadi.", action: actionMap.open_chat };
  if (/bitim|deal/.test(value)) return { text: "Qabul qilingan takliflar Bitimlar bo‘limiga o‘tadi. Holat va bitim chatini shu yerdan boshqarasiz.", action: actionMap.open_deals };
  if (/agent.*(top|qidir|ko'r|kor)|hamkor/.test(value)) return { text: "Agentlar katalogidan mos hamkorni topishingiz mumkin.", action: actionMap.open_agents };
  if (/post|e'lon|elon|lenta/.test(value)) return { text: "Platformadagi e’lon va postlar shu bo‘limda.", action: actionMap.open_feed };
  if (/so'rov.*(ko'r|kor|ochiq)|taklif.*ko'r|takliflar/.test(value)) return { text: "Amaldagi so‘rovlar va yuborilgan takliflarni shu bo‘limdan boshqarasiz.", action: actionMap.open_requests };
  if (/so'rov.*(yarat|och)|yangi so'rov/.test(value)) return { text: "Yangi so‘rov ochamiz. Bir xabarning o‘zida bir nechta xizmatni ham yozishingiz mumkin: masalan aviachipta + mehmonxona + transfer.", action: actionMap.create_request };
  if (/qanday ishlay|o'rgat|orgat|nima qilay/.test(value)) return { text: "Ish tartibi: 1) so‘rov yaratasiz; 2) agentlar taklif yuboradi; 3) mos taklifni qabul qilasiz; 4) bitim ochiladi; 5) holat va yozishmani Bitimlar ichida boshqarasiz." };
  return null;
}

function looksLikeTravelRequest(text: string) {
  return /\b[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}\b/i.test(text) || /(avia|chipta|bilet|mehmonxona|hotel|otel|transfer|gid|viza|visa|tur paket|turpaket|tour)/i.test(text);
}

function safeLocalEntries(value: string | null): ChatEntry[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-80).filter((item) => item && (item.sender === "user" || item.sender === "assistant") && typeof item.text === "string").map((item) => ({
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      sender: item.sender,
      text: item.text.slice(0, 8000),
      actions: Array.isArray(item.actions) ? item.actions.filter((action: unknown) => Boolean(action && typeof action === "object" && typeof (action as AiHistoryAction).label === "string" && typeof (action as AiHistoryAction).href === "string")).slice(0, 8) : [],
    }));
  } catch {
    return [];
  }
}

export default function AiCommandCenter({ session, displayName, stats }: { session: AuthSession; displayName: string; stats: DashboardStats }) {
  const greeting: ChatEntry = { id: "greeting", sender: "assistant", text: `${displayName || "Hamkor"}, salom. Men My Agent Air AI yordamchisiman. Nima kerakligini oddiy tilda yozing — bitta xabardan bir nechta xizmat so‘rovini ham tayyorlay olaman.` };
  const [entries, setEntries] = useState<ChatEntry[]>([greeting]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const sequence = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const localHistoryKey = `my-agent-air:ai-history:${session.user.id}`;

  useEffect(() => {
    let active = true;
    const local = safeLocalEntries(window.localStorage.getItem(localHistoryKey));
    if (local.length) setEntries(local);
    listAiChatHistory(session).then((rows) => {
      if (!active) return;
      if (rows.length) {
        setEntries(rows.map((row) => ({ id: row.id, sender: row.role, text: row.content, actions: row.actions })));
      } else if (!local.length) {
        setEntries([greeting]);
      }
    }).catch(() => undefined).finally(() => { if (active) setHistoryReady(true); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user.id]);

  useEffect(() => {
    if (!historyReady) return;
    window.localStorage.setItem(localHistoryKey, JSON.stringify(entries.slice(-80)));
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [entries, historyReady, localHistoryKey]);

  function appendEntry(sender: "user" | "assistant", text: string, actions: AiHistoryAction[] = []) {
    const entry: ChatEntry = { id: `${Date.now()}-${++sequence.current}`, sender, text, actions };
    setEntries((current) => [...current.filter((item) => item.id !== "greeting" || current.length === 1), entry].slice(-80));
    void saveAiChatMessage(session, sender, text, actions).catch(() => undefined);
    return entry;
  }

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    appendEntry("user", text);

    try {
      if (looksLikeTravelRequest(text)) {
        const parsedDrafts = parseRequestDrafts(text).filter((item) => item.draft.category || item.draft.origin || item.draft.destination);
        if (parsedDrafts.length) {
          const actions = parsedDrafts.map(({ draft }) => ({
            label: `${draft.category || "So‘rov"} qoralamasini ochish`,
            href: `/requests/new?draft=${encodeURIComponent(JSON.stringify(draft))}`,
          }));
          const categories = parsedDrafts.map((item) => item.draft.category).filter(Boolean);
          const missing = Array.from(new Set(parsedDrafts.flatMap((item) => item.missing)));
          const reply = parsedDrafts.length > 1
            ? `${parsedDrafts.length} ta xizmat turi aniqlandi: ${categories.join(", ")}. Har biri uchun alohida so‘rov qoralamasi tayyorladim.${missing.length ? ` Yetishmayotgan umumiy ma’lumot: ${missing.join(", ")}.` : " Qoralamalarni tekshirib e’lon qilishingiz mumkin."}`
            : `${categories[0] || "So‘rov"} qoralamasi tayyor.${missing.length ? ` Aniqlashtirish kerak: ${missing.join(", ")}.` : " Formani ochib tekshiring va keyin e’lon qiling."}`;
          appendEntry("assistant", reply, actions);
          return;
        }
      }

      const local = localAction(text);
      if (local) {
        appendEntry("assistant", local.text, local.action ? [local.action] : []);
        return;
      }

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: text, context: { path: "/dashboard", stats } }),
      });
      const data = (await response.json().catch(() => ({}))) as AiResponse;
      if (!response.ok) {
        const fallback = data.code === "AI_NOT_CONFIGURED"
          ? "AI modeli uchun server kaliti hali ulanmagan. Hozircha so‘rov qoralamasi, navigatsiya va platforma bo‘yicha yo‘l-yo‘riq ishlaydi."
          : "AI xizmatiga ulanishda vaqtinchalik xatolik bo‘ldi. Platformaning asosiy bo‘limlari ishlashda davom etadi.";
        appendEntry("assistant", fallback);
        return;
      }
      const action = data.action && data.action !== "none" ? actionMap[data.action] : undefined;
      appendEntry("assistant", data.message || "Buyruqni tushundim.", action ? [action] : []);
    } catch {
      appendEntry("assistant", "AI xizmatiga ulanishda xatolik bo‘ldi. Platformaning asosiy bo‘limlari ishlashda davom etadi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid h-full min-h-0 gap-3 xl:min-h-[620px] xl:grid-cols-[minmax(0,1fr)_220px]">
      <div className="flex h-[calc(100dvh-8.25rem)] min-h-[430px] max-h-[760px] flex-col overflow-hidden rounded-[22px] border-2 border-blue-200 bg-white shadow-[0_20px_70px_rgba(37,99,235,0.16)] xl:h-auto xl:min-h-[620px] xl:rounded-[28px]">
        <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-blue-600 to-cyan-500 px-3 py-2.5 text-white sm:px-5 sm:py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-xs font-bold ring-1 ring-white/30 sm:h-9 sm:w-9 sm:text-sm">AI</div>
            <div>
              <p className="text-sm font-semibold">My Agent Air AI</p>
              <p className="hidden text-[11px] text-blue-50 sm:block">Asosiy boshqaruv markazi</p>
            </div>
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-semibold ring-1 ring-white/20 sm:px-3 sm:text-[11px]">● AI faol</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-blue-50/40 via-white to-white px-3 py-3 sm:px-5 sm:py-5" aria-live="polite">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col">
            <div className="space-y-3 sm:space-y-5">
              {entries.map((entry) => (
                <div key={entry.id} className={`flex gap-3 ${entry.sender === "user" ? "justify-end" : "justify-start"}`}>
                  {entry.sender === "assistant" && <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white sm:flex">AI</div>}
                  <div className={entry.sender === "user" ? "max-w-[90%] sm:max-w-[78%]" : "max-w-[96%] sm:max-w-[84%]"}>
                    <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 sm:px-4 sm:py-3 sm:text-sm sm:leading-6 ${entry.sender === "user" ? "bg-[#0b1f3a] text-white shadow-sm" : "border border-blue-100 bg-blue-50 text-slate-700"}`}>{entry.text}</div>
                    {Boolean(entry.actions?.length) && <div className="mt-2 flex flex-wrap gap-2">{entry.actions?.map((action) => <Link key={`${entry.id}-${action.href}`} href={action.href} className="inline-flex rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:px-4 sm:text-xs">{action.label} →</Link>)}</div>}
                  </div>
                </div>
              ))}
              {busy && <div className="flex items-center gap-3"><div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white sm:flex">AI</div><div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">AI o‘ylayapti…</div></div>}
              <div ref={bottomRef} />
            </div>

            {entries.length === 1 && entries[0]?.id === "greeting" && (
              <div className="mt-auto pt-3 sm:pt-5 xl:pt-8">
                <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-400">Tez boshlash</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickPrompts.map((item, index) => (
                    <button key={item.prompt} type="button" onClick={() => void send(item.prompt)} className={`min-h-12 rounded-xl border p-2 text-left transition sm:min-h-0 sm:rounded-2xl sm:p-3 ${index === 0 ? "border-blue-200 bg-blue-50 hover:bg-blue-100" : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"}`}>
                      <p className="text-[11px] font-semibold text-[#0b1f3a] sm:text-xs">{item.title}</p>
                      <p className="mt-1 hidden text-[11px] leading-4 text-slate-400 sm:block">{item.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-blue-100 bg-blue-50/80 px-2.5 pb-2.5 pt-2.5 backdrop-blur sm:px-5 sm:pb-4 sm:pt-3">
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="mx-auto max-w-3xl rounded-[22px] border-2 border-blue-300 bg-white p-1.5 shadow-[0_8px_30px_rgba(37,99,235,0.12)] transition focus-within:border-blue-500 focus-within:shadow-[0_10px_35px_rgba(37,99,235,0.2)] sm:rounded-[26px] sm:p-2">
            <textarea
              aria-label="AI yordamchiga yozing"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
              rows={1}
              maxLength={1500}
              placeholder="AI ga yozing: TAS–IST, avia + hotel + transfer, 2 kishi…"
              className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[#0b1f3a] outline-none placeholder:text-blue-300 sm:py-2.5"
            />
            <div className="flex items-center justify-end px-1.5 pb-1 sm:justify-between sm:px-2">
              <p className="hidden text-[11px] text-slate-400 sm:block">Enter — yuborish · Shift+Enter — yangi qator</p>
              <button type="submit" disabled={busy || !input.trim()} className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-blue-600 px-3 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-4 sm:text-xs">Yuborish</button>
            </div>
          </form>
          <p className="mx-auto mt-1 max-w-3xl text-center text-[9px] text-blue-400 sm:text-[10px]">AI tarixi hisobingizda saqlanadi. Bir xabarda bir nechta xizmat yozish mumkin.</p>
        </div>
      </div>

      <aside className="hidden xl:block xl:space-y-2.5">
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Joriy holat</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Link href="/requests" className="rounded-xl bg-blue-50 p-2.5"><p className="text-[10px] text-blue-500">So‘rov</p><p className="mt-0.5 text-lg font-semibold text-[#0b1f3a]">{stats.openRequests}</p></Link>
            <Link href="/deals" className="rounded-xl bg-emerald-50 p-2.5"><p className="text-[10px] text-emerald-600">Bitim</p><p className="mt-0.5 text-lg font-semibold text-[#0b1f3a]">{stats.deals}</p></Link>
            <Link href="/agents" className="rounded-xl bg-violet-50 p-2.5"><p className="text-[10px] text-violet-600">Agent</p><p className="mt-0.5 text-lg font-semibold text-[#0b1f3a]">{stats.agents}</p></Link>
            <Link href="/requests" className="rounded-xl bg-amber-50 p-2.5"><p className="text-[10px] text-amber-600">Taklif</p><p className="mt-0.5 text-lg font-semibold text-[#0b1f3a]">{stats.offers}</p></Link>
          </div>
        </section>
        <section className="rounded-2xl border border-blue-100 bg-blue-50/80 p-3"><h2 className="text-[11px] font-semibold text-blue-900">AI markaz</h2><p className="mt-1.5 text-[10px] leading-4 text-blue-700">Bitta xabardan bir nechta xizmat so‘rovini tayyorlaydi va tarixni hisobingizda saqlaydi.</p></section>
      </aside>
    </section>
  );
}
