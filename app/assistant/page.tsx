"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { parseRequestDraft, type AssistantDraft } from "@/lib/request-assistant";
import { listRequests, type RequestRecord } from "@/app/requests/requests-api";

type ChatEntry = { id: number; sender: "user" | "assistant"; text: string };
const examples = ["TAS–IST 10 oktabr 2 kishi 23 kg 500 USD", "Toshkentda mehmonxona, 12 oktabr, 3 kishi", "So‘rovdan bitimgacha qanday ishlaydi?"];

export default function AssistantPage() {
  const [entries, setEntries] = useState<ChatEntry[]>([{ id: 0, sender: "assistant", text: "Qanday xizmat kerak? Yo‘nalish, sana va odamlar sonini yozing. So‘rov qoralamasini tayyorlayman; e’lon qilishdan oldin o‘zingiz tekshirasiz." }]);
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<AssistantDraft>({});
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const inFlight = useRef(false);

  async function send() {
    const text = input.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(""); setInput("");
    const id = ++sequence.current;
    setEntries((current) => [...current, { id: id * 2, sender: "user", text }]);
    try {
      if (/qanday ishlay|bitim|profil|parol/i.test(text)) {
        const answer = /parol/i.test(text) ? "Kirish sahifasidagi “Parolni unutdingizmi?” tugmasi orqali emailga tiklash havolasini oling." : /profil/i.test(text) ? "Ish panelidagi “Profilim” tugmasini bosing. So‘rov va taklif berish uchun ism, kompaniya, shahar, telefon va agent turi to‘ldiriladi." : "So‘rov yarating → agentlar taklif yuboradi → so‘rov egasi taklifni qabul qiladi → bitim ochiladi. Suhbat va ish holatini bitim sahifasida boshqarasiz.";
        setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: answer }]);
      } else {
        const parsed = parseRequestDraft(text, draft);
        setDraft(parsed.draft);
        const reply = [...parsed.notes, parsed.missing.length ? `Aniqlashtiring: ${parsed.missing.join(", ")}.` : "Qoralama tayyor. Formani ochib, barcha maydonlarni tekshiring."].join("\n");
        setEntries((current) => [...current, { id: id * 2 + 1, sender: "assistant", text: reply }]);
        if (parsed.draft.category) {
          try { setRequests(await listRequests({ category: parsed.draft.category, status: "open", freshness: "current", limit: 5 })); }
          catch { setError("Amaldagi so‘rovlar yuklanmadi. Qoralama tayyorlashni davom ettirishingiz mumkin."); }
        }
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <AppShell activePath="/dashboard"><div className="mx-auto max-w-5xl"><Link href="/dashboard" className="text-sm text-blue-600">← Ish paneli</Link><h1 className="mt-5 text-3xl font-semibold text-[#0b1f3a]">Aqlli yordamchi</h1><p className="mt-2 text-sm text-slate-500">So‘rov tayyorlash va platformadan foydalanish bo‘yicha yordam. Narx va mavjud joyni hamkor agent bilan tasdiqlang.</p>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="max-h-[440px] space-y-4 overflow-y-auto" aria-live="polite">{entries.map((entry) => <p key={entry.id} className={`whitespace-pre-wrap rounded-xl p-4 text-sm leading-6 ${entry.sender === "user" ? "ml-8 bg-blue-600 text-white" : "mr-8 bg-slate-50 text-slate-700"}`}>{entry.text}</p>)}</div><div className="my-4 flex flex-wrap gap-2">{examples.map((example) => <button key={example} onClick={() => setInput(example)} className="rounded-lg bg-blue-50 px-3 py-2 text-left text-xs text-blue-700">{example}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea aria-label="Yordamchiga xabar" value={input} onChange={(event) => setInput(event.target.value)} maxLength={1000} rows={3} placeholder="Masalan: TAS–IST 10 oktabr, 2 kishi…" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" /><button disabled={busy || !input.trim()} className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Tayyorlanmoqda…" : "Yuborish"}</button></form></section>
      <aside className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-[#0b1f3a]">So‘rov qoralamasi</h2><dl className="mt-4 space-y-2 text-sm"><div><dt className="text-slate-400">Xizmat</dt><dd>{draft.category || "Aniqlanmagan"}</dd></div><div><dt className="text-slate-400">Yo‘nalish</dt><dd>{draft.origin || "…"} → {draft.destination || "…"}</dd></div><div><dt className="text-slate-400">Sana</dt><dd>{draft.travel_date || "Aniqlanmagan"}</dd></div><div><dt className="text-slate-400">Odamlar</dt><dd>{draft.adults || 1} katta · {draft.children || 0} bola · {draft.infants || 0} go‘dak</dd></div><div><dt className="text-slate-400">Budjet</dt><dd>{draft.budget == null ? "Ko‘rsatilmagan" : `${draft.budget} ${draft.currency}`}</dd></div></dl>{draft.category && <Link href={`/requests/new?draft=${encodeURIComponent(JSON.stringify(draft))}`} className="mt-5 block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white">So‘rov formasini ochish</Link>}</section>
        {requests.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold text-[#0b1f3a]">Shu kategoriyadagi amaldagi so‘rovlar</h2>{requests.map((request) => <Link key={request.id} href={`/requests/${request.id}`} className="mt-3 block rounded-lg border border-slate-100 p-3 text-sm text-blue-700">{request.origin || "—"} → {request.destination || "—"}<span className="mt-1 block text-xs text-slate-400">{request.travel_date || "Sana ko‘rsatilmagan"}</span></Link>)}</section>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </aside></div></div></AppShell>;
}
