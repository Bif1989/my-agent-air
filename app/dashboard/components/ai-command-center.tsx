"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { parseRequestDraft } from "@/lib/request-assistant";
import type { AuthSession } from "@/lib/supabase-auth";

type DashboardStats = { openRequests: number; offers: number; deals: number; agents: number };
type AiActionKey = "create_request" | "open_requests" | "open_agents" | "open_deals" | "open_chat" | "open_profile" | "open_feed" | "none";
type ChatEntry = { id: number; sender: "user" | "assistant"; text: string; action?: { label: string; href: string } };
type AiResponse = { message?: string; action?: AiActionKey; code?: string };

const actionMap: Record<Exclude<AiActionKey, "none">, { label: string; href: string }> = {
  create_request: { label: "Yangi so‘rov yaratish", href: "/requests/new" },
  open_requests: { label: "So‘rovlar va takliflar", href: "/requests" },
  open_agents: { label: "Agentlarni ko‘rish", href: "/agents" },
  open_deals: { label: "Bitimlarni ko‘rish", href: "/deals" },
  open_chat: { label: "Chatni ochish", href: "/messenger" },
  open_profile: { label: "Profilni ochish", href: "/profile" },
  open_feed: { label: "Postlarni ko‘rish", href: "/feed" },
};

const quickPrompts = [
  { title: "Yangi so‘rov", detail: "Aviachipta, tur, hotel yoki transfer", prompt: "Yangi aviachipta so‘rovi yaratmoqchiman" },
  { title: "Ochiq so‘rovlar", detail: "Hozirgi talablarni ko‘rish", prompt: "Ochiq so‘rovlarni ko‘rsat" },
  { title: "Agent topish", detail: "Mos hamkorni topishga yordam", prompt: "Agent topishga yordam ber" },
  { title: "Qanday ishlaydi?", detail: "So‘rovdan bitimgacha yo‘l", prompt: "So‘rovdan bitimgacha qanday ishlaydi?" },
];

function normalizeIntent(text: string) {
  return text.toLowerCase().replace(/[ʻ’`´]/g, "'").replace(/\s+/g, " ").trim();
}

function localAction(text: string): { text: string; action?: { label: string; href: string } } | null {
  const value = normalizeIntent(text);
  if (/profil|akkaunt/.test(value)) return { text: "Profil ma’lumotlaringizni shu bo‘limda ko‘rish va to‘ldirish mumkin.", action: actionMap.open_profile };
  if (/chat|xabar|yozish/.test(value)) return { text: "Agentlar bilan yozishmalar Chat bo‘limida. O‘qilmagan xabarlar ham shu yerda ko‘rinadi.", action: actionMap.open_chat };
  if (/bitim|deal/.test(value)) return { text: "Qabul qilingan takliflar Bitimlar bo‘limiga o‘tadi. Holat va bitim chatini shu yerdan boshqarasiz.", action: actionMap.open_deals };
  if (/agent.*(top|qidir|ko'r|kor)|hamkor/.test(value)) return { text: "Agentlar katalogidan mos hamkorni topishingiz mumkin.", action: actionMap.open_agents };
  if (/post|e'lon|elon|lenta/.test(value)) return { text: "Platformadagi e’lon va postlar shu bo‘limda.", action: actionMap.open_feed };
  if (/so'rov.*(ko'r|kor|ochiq)|taklif.*ko'r|takliflar/.test(value)) return { text: "Amaldagi so‘rovlar va yuborilgan takliflarni shu bo‘limdan boshqarasiz.", action: actionMap.open_requests };
  if (/so'rov.*(yarat|och)|yangi so'rov/.test(value)) return { text: "Yangi so‘rov ochamiz. Xizmat turi, yo‘nalish, sana va yo‘lovchilarni yozing yoki formani oching.", action: actionMap.create_request };
  if (/qanday ishlay|o'rgat|orgat|nima qilay/.test(value)) return { text: "Ish tartibi: 1) so‘rov yaratasiz; 2) agentlar taklif yuboradi; 3) mos taklifni qabul qilasiz; 4) bitim ochiladi; 5) holat va yozishmani Bitimlar ichida boshqarasiz." };
  return null;
}

function looksLikeTravelRequest(text: string) {
  return /\b[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}\b/i.test(text) || /(avia|chipta|bilet|mehmonxona|hotel|transfer|gid|viza|tur paket|tour)/i.test(text);
}

export default function AiCommandCenter({ session, displayName, stats }: { session: AuthSession; displayName: string; stats: DashboardStats }) {
  const [entries, setEntries] = useState<ChatEntry[]>([{ id: 0, sender: "assistant", text: `${displayName || "Hamkor"}, salom. Nima qilmoqchi ekaningizni yozing. So‘rov yaratish, agent topish va bitimlarni boshqarishda yordam beraman.` }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);

  async function send(message?: string) {
    const text = (message ?? input).trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    const id = ++sequence.current;
    setEntries((current) => [...current, { id: id * 2, sender: "user", text }]);

    try {
      if (looksLikeTravelRequest(text)) {
        const parsed = parseRequestDraft(text);
        if (parsed.draft.category || parsed.draft.origin || parsed.draft.destination) {
          const href = `/requests/new?draft=${encodeURIComponent(JSON.stringify(parsed.draft))}`;
          const reply = [...parsed.notes, parsed.missing.length ? `Aniqlashtirish kerak: ${parsed.missing.join(", ")}.` : "So‘rov qoralamasi tayyor. Formani ochib tekshiring va keyin e’lon qiling."].join("\n");
          setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: reply, action: { label: "Qoralamani ochish", href } }]);
          return;
        }
      }

      const local = localAction(text);
      if (local) {
        setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: local.text, action: local.action }]);
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
        setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: fallback }]);
        return;
      }

      const action = data.action && data.action !== "none" ? actionMap[data.action] : undefined;
      setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: data.message || "Buyruqni tushundim.", action }]);
    } catch {
      setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: "AI xizmatiga ulanishda xatolik bo‘ldi. So‘rovlar, agentlar va bitimlar bo‘limlari ishlashda davom etadi." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid h-full min-h-0 gap-4 xl:min-h-[620px] xl:grid-cols-[minmax(0,1fr)_250px]">
      <div className="flex h-[calc(100dvh-10.5rem)] min-h-[430px] max-h-[720px] flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.07)] sm:h-auto sm:min-h-[560px] sm:rounded-[28px] xl:min-h-[620px]">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-3 py-2.5 sm:px-6 sm:py-3">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0b1f3a] text-xs font-bold text-white sm:h-9 sm:w-9 sm:text-sm">AI</div>
            <div>
              <p className="text-sm font-semibold text-[#0b1f3a]">My Agent Air AI</p>
              <p className="hidden text-[11px] text-slate-400 sm:block">B2B travel boshqaruv yordamchisi</p>
            </div>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:px-3 sm:text-[11px]">Faol</span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-5 xl:py-7" aria-live="polite">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col">
            <div className="space-y-3 sm:space-y-5">
              {entries.map((entry) => (
                <div key={entry.id} className={`flex gap-3 ${entry.sender === "user" ? "justify-end" : "justify-start"}`}>
                  {entry.sender === "assistant" && <div className="mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white sm:flex">AI</div>}
                  <div className={entry.sender === "user" ? "max-w-[90%] sm:max-w-[78%]" : "max-w-[96%] sm:max-w-[84%]"}>
                    <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 sm:px-4 sm:py-3 sm:text-sm sm:leading-6 ${entry.sender === "user" ? "bg-[#0b1f3a] text-white" : "bg-slate-50 text-slate-700"}`}>{entry.text}</div>
                    {entry.action && <Link href={entry.action.href} className="mt-2 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">{entry.action.label} →</Link>}
                  </div>
                </div>
              ))}
              {busy && <div className="flex items-center gap-3"><div className="hidden h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[11px] font-bold text-white sm:flex">AI</div><div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">AI o‘ylayapti…</div></div>}
            </div>

            {entries.length === 1 && (
              <div className="mt-auto pt-3 sm:pt-5 xl:pt-8">
                <p className="mb-2 text-center text-[11px] font-medium text-slate-400">Tez boshlash</p>
                <div className="grid grid-cols-2 gap-2">
                  {quickPrompts.map((item) => (
                    <button key={item.prompt} type="button" onClick={() => void send(item.prompt)} className="min-h-12 rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-blue-300 hover:bg-blue-50/50 sm:min-h-0 sm:rounded-2xl sm:p-3">
                      <p className="text-[11px] font-semibold text-[#0b1f3a] sm:text-xs">{item.title}</p>
                      <p className="mt-1 hidden text-[11px] leading-4 text-slate-400 sm:block">{item.detail}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 bg-white/95 px-2.5 pb-2.5 pt-2.5 backdrop-blur sm:px-6 sm:pb-4 sm:pt-3">
          <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="mx-auto max-w-3xl rounded-[22px] border border-slate-200 bg-slate-50 p-1.5 shadow-sm transition focus-within:border-blue-300 focus-within:bg-white focus-within:shadow-md sm:rounded-[26px] sm:p-2">
            <textarea
              aria-label="AI yordamchiga yozing"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
              rows={1}
              maxLength={1500}
              placeholder="Nima qilmoqchisiz? Masalan: TAS–IST, 2 kishi…"
              className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[#0b1f3a] outline-none placeholder:text-slate-400 sm:py-2.5"
            />
            <div className="flex items-center justify-end px-1.5 pb-1 sm:justify-between sm:px-2">
              <p className="hidden text-[11px] text-slate-400 sm:block">Enter — yuborish · Shift+Enter — yangi qator</p>
              <button type="submit" disabled={busy || !input.trim()} className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-blue-600 px-3 text-[11px] font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:px-4 sm:text-xs">Yuborish</button>
            </div>
          </form>
          <p className="mx-auto mt-1 max-w-3xl text-center text-[9px] text-slate-400 sm:text-[10px]">Muhim amallar bajarilishidan oldin tasdiq so‘raladi.</p>
        </div>
      </div>

      <aside className="hidden xl:block xl:space-y-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Joriy holat</p><span className="h-2 w-2 rounded-full bg-emerald-400" /></div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Link href="/requests" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-[11px] text-slate-500">Ochiq so‘rovlar</p><p className="mt-1 text-xl font-semibold text-[#0b1f3a]">{stats.openRequests}</p></Link>
            <Link href="/deals" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-[11px] text-slate-500">Faol bitimlar</p><p className="mt-1 text-xl font-semibold text-[#0b1f3a]">{stats.deals}</p></Link>
            <Link href="/agents" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-[11px] text-slate-500">Agentlar</p><p className="mt-1 text-xl font-semibold text-[#0b1f3a]">{stats.agents}</p></Link>
            <Link href="/requests" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-[11px] text-slate-500">Takliflarim</p><p className="mt-1 text-xl font-semibold text-[#0b1f3a]">{stats.offers}</p></Link>
          </div>
        </section>
        <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4"><h2 className="text-xs font-semibold text-blue-900">AI yordamchi nima qiladi?</h2><p className="mt-2 text-[11px] leading-5 text-blue-800">So‘rov tayyorlaydi, agent va bo‘limlarni topadi, bitim jarayonini tushuntiradi va keyingi qadamni ko‘rsatadi.</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-semibold text-slate-500">Tez kirish</p><div className="mt-2 space-y-1"><Link href="/requests" className="block rounded-lg px-2 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-700">So‘rovlar va takliflar →</Link><Link href="/messenger" className="block rounded-lg px-2 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-700">Chat →</Link><Link href="/feed" className="block rounded-lg px-2 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-blue-700">Postlar →</Link></div></section>
      </aside>
    </section>
  );
}
