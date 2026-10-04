"use client";

import { useEffect, useRef } from "react";
import { useDealChat } from "@/app/messenger/use-messenger-room";
import type { DealRecord } from "./deals-api";

export default function DealChat({ deal, userId }: { deal: DealRecord; userId: string }) {
  const chat = useDealChat(deal.id);
  const bottom = useRef<HTMLDivElement>(null);
  const newestId = chat.messages.at(-1)?.id;
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [newestId]);
  return <section id="chat" className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <header className="border-b border-slate-100 p-5"><h2 className="text-lg font-semibold text-[#0b1f3a]">Bitim suhbati</h2><p className="mt-1 text-sm text-slate-500">Ushbu kelishuv bo‘yicha yozishmalar shu yerda saqlanadi.</p></header>
    <div className="max-h-[420px] min-h-48 space-y-3 overflow-y-auto bg-slate-50 p-5" aria-live="polite">
      {chat.error && <p role="alert" className="text-sm text-red-700">{chat.error} <button onClick={chat.reload} className="underline">Qayta yuklash</button></p>}
      {chat.hasOlder && <button onClick={chat.loadOlder} disabled={chat.loadingOlder} className="w-full text-sm text-blue-600">{chat.loadingOlder ? "Yuklanmoqda…" : "Oldingi xabarlar"}</button>}
      {chat.isLoading ? <p className="text-sm text-slate-500">Xabarlar yuklanmoqda…</p> : !chat.messages.length && !chat.error ? <p className="text-sm text-slate-500">Hali xabarlar yo‘q.</p> : null}
      {chat.messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === userId ? "justify-end" : "justify-start"}`}><article className={`max-w-[90%] rounded-xl px-4 py-3 text-sm sm:max-w-[75%] ${message.message_type === "system" ? "bg-blue-50 text-blue-900" : message.sender_id === userId ? "bg-blue-600 text-white" : "border border-slate-200 bg-white"}`}><p className="text-xs font-semibold">{message.message_type === "system" ? "Tizim" : message.sender_id === userId ? "Siz" : message.sender?.full_name || "Hamkor"}</p><p className="mt-1 whitespace-pre-wrap break-words">{message.message}</p><time dateTime={message.created_at} className="mt-2 block text-right text-[10px] opacity-70">{new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(message.created_at))}</time></article></div>)}
      <div ref={bottom} />
    </div>
    <form className="border-t border-slate-100 p-4" onSubmit={(event) => { event.preventDefault(); void chat.send(); }}>
      <textarea aria-label="Bitimga xabar" rows={3} value={chat.draft} maxLength={4000} onChange={(event) => chat.setDraft(event.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500" placeholder="Hamkoringizga xabar yozing…" />
      {chat.sendError && <p role="alert" className="mt-2 text-sm text-red-700">{chat.sendError}</p>}
      <button disabled={!chat.draft.trim() || chat.isSending} className="mt-3 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{chat.isSending ? "Yuborilmoqda…" : "Yuborish"}</button>
    </form>
  </section>;
}
