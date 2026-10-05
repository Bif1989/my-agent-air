"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { parseRequestDraft } from "@/lib/request-assistant";
import type { AuthSession } from "@/lib/supabase-auth";

type DashboardStats = {
  openRequests: number;
  offers: number;
  deals: number;
  agents: number;
};

type AiActionKey =
  | "create_request"
  | "open_requests"
  | "open_agents"
  | "open_deals"
  | "open_chat"
  | "open_profile"
  | "open_feed"
  | "none";

type ChatEntry = {
  id: number;
  sender: "user" | "assistant";
  text: string;
  action?: { label: string; href: string };
};

type AiResponse = {
  message?: string;
  action?: AiActionKey;
  code?: string;
};

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
  "Yangi aviachipta so‘rovi yaratmoqchiman",
  "Ochiq so‘rovlarni ko‘rsat",
  "Agent topishga yordam ber",
  "So‘rovdan bitimgacha qanday ishlaydi?",
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
  if (/qanday ishlay|o'rgat|orgat|nima qilay/.test(value)) {
    return { text: "Ish tartibi: 1) so‘rov yaratasiz; 2) agentlar taklif yuboradi; 3) mos taklifni qabul qilasiz; 4) bitim ochiladi; 5) holat va yozishmani Bitimlar ichida boshqarasiz." };
  }
  return null;
}

function looksLikeTravelRequest(text: string) {
  return /\b[A-Z]{3}\s*[-–—→]\s*[A-Z]{3}\b/i.test(text) || /(avia|chipta|bilet|mehmonxona|hotel|transfer|gid|viza|tur paket|tour)/i.test(text);
}

export default function AiCommandCenter({ session, displayName, stats }: { session: AuthSession; displayName: string; stats: DashboardStats }) {
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      id: 0,
      sender: "assistant",
      text: `${displayName || "Hamkor"}, salom. Men My Agent Air AI yordamchisiman. So‘rov yaratish, agent topish, bitimlar, chat va platformadan foydalanishni bir joydan boshqarishga yordam beraman.`,
    },
  ]);
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
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-h-[calc(100dvh-190px)] flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_22px_60px_rgba(15,23,42,0.08)] sm:min-h-[650px]">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">My Agent Air AI</p>
              <p className="mt-1 text-sm text-slate-500">Platformani yozib boshqaring va kerakli ishni AI bilan boshlang.</p>
            </div>
            <span className="hidden rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 sm:inline-flex">AI markaz</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-7" aria-live="polite">
          <div className="mx-auto max-w-3xl space-y-5">
            {entries.map((entry) => (
              <div key={entry.id} className={entry.sender === "user" ? "ml-auto max-w-[88%] sm:max-w-[82%]" : "mr-auto max-w-[94%] sm:max-w-[88%]"}>
                <div className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${entry.sender === "user" ? "bg-[#0b1f3a] text-white" : "bg-slate-50 text-slate-700"}`}>
                  {entry.text}
                </div>
                {entry.action && (
                  <Link href={entry.action.href} className="mt-2 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700">
                    {entry.action.label} →
                  </Link>
                )}
              </div>
            ))}
            {busy && <div className="mr-auto max-w-[88%] rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">AI o‘ylayapti…</div>}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-3 pb-4 pt-3 backdrop-blur sm:px-7 sm:pb-5">
          <div className="mx-auto max-w-3xl">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {quickPrompts.map((prompt) => (
                <button key={prompt} type="button" onClick={() => void send(prompt)} className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700">
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="rounded-[22px] border border-slate-200 bg-slate-50 p-2 shadow-inner focus-within:border-blue-300 focus-within:bg-white">
              <textarea
                aria-label="AI yordamchiga yozing"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={2}
                maxLength={1500}
                placeholder="Masalan: TAS–IST 10 oktabr 2 kishi 23 kg, 500 USD yoki ‘bitimlarimni ko‘rsat’…"
                className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[#0b1f3a] outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between gap-3 px-2 pb-1">
                <p className="hidden text-[11px] text-slate-400 sm:block">Enter — yuborish · Shift+Enter — yangi qator</p>
                <span className="sm:hidden" />
                <button type="submit" disabled={busy || !input.trim()} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  Yuborish
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <aside className="grid gap-4 sm:grid-cols-2 xl:block xl:space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Joriy holat</p>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-1">
            <Link href="/requests" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-xs text-slate-500">Ochiq so‘rovlar</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{stats.openRequests}</p></Link>
            <Link href="/deals" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-xs text-slate-500">Faol bitimlar</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{stats.deals}</p></Link>
            <Link href="/agents" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-xs text-slate-500">Agentlar</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{stats.agents}</p></Link>
            <Link href="/requests" className="rounded-xl bg-slate-50 p-3 transition hover:bg-blue-50"><p className="text-xs text-slate-500">Mening takliflarim</p><p className="mt-1 text-2xl font-semibold text-[#0b1f3a]">{stats.offers}</p></Link>
          </div>
        </section>

        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <h2 className="text-sm font-semibold text-blue-900">AI nimalarni qiladi?</h2>
          <p className="mt-2 text-xs leading-5 text-blue-800">Yo‘nalishni tushuntiradi, so‘rov qoralamasini tayyorlaydi, kerakli bo‘limni ochadi va keyingi qadamni ko‘rsatadi. Ma’lumotni o‘zgartiradigan amallar foydalanuvchi tasdig‘idan keyin bajariladi.</p>
        </section>
      </aside>
    </section>
  );
}
