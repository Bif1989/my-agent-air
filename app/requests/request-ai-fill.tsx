"use client";

import { useEffect, useRef, useState } from "react";
import { aiErrorMessage } from "@/lib/ai-error-message";
import { aiRequestToDraft } from "@/lib/ai-request-draft";
import { getStoredSession, refreshSession, sessionNeedsRefresh } from "@/lib/supabase-auth";
import { requestTitle, serviceDefinition, localize, type ServiceRequestInput } from "@/lib/service-request";
import { useUiSettings } from "@/lib/ui-settings";
import type { AssistantDraft } from "@/lib/request-assistant";

export default function RequestAiFill({ values, disabled, onApply, onBusyChange }: { values: ServiceRequestInput; disabled: boolean; onApply: (draft: AssistantDraft) => void; onBusyChange: (busy: boolean) => void }) {
  const { isRu, locale } = useUiSettings();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<AssistantDraft[]>([]);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function fill() {
    if (!text.trim() || pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller; setBusy(true); onBusyChange(true); setError(""); setChoices([]);
    try {
      let session = getStoredSession();
      const owner = session?.user.id;
      if (session && sessionNeedsRefresh(session)) session = await refreshSession();
      const body = JSON.stringify({ message: text.trim(), context: { path: "/requests/new", locale, formDraft: values } });
      const send = () => {
        if (!session || session.user.id !== owner || getStoredSession()?.user.id !== owner) throw new Error("AUTH_REQUIRED");
        controller.signal.throwIfAborted();
        return fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) });
      };
      let response = await send();
      if (response.status === 401) { session = await refreshSession(); response = await send(); }
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || "AI_ERROR");
      if (getStoredSession()?.user.id !== owner) throw new Error("AUTH_REQUIRED");
      const drafts = Array.isArray(data.requests) ? data.requests.map(aiRequestToDraft).filter((item: AssistantDraft | null): item is AssistantDraft => Boolean(item)) : [];
      if (!drafts.length) throw new Error("NO_DRAFT");
      if (drafts.length === 1) onApply(drafts[0]); else setChoices(drafts);
    } catch (failure) {
      if (!controller.signal.aborted) {
        const code = failure instanceof Error ? failure.message : "AI_ERROR";
        setError(aiErrorMessage(code, isRu) || (code === "AUTH_REQUIRED" ? (isRu ? "Войдите в аккаунт снова." : "Hisobingizga qayta kiring.") : code === "AI_NOT_CONFIGURED" ? (isRu ? "AI пока не подключён. Заполните анкету вручную." : "AI hali ulanmagan. Anketani qo‘lda to‘ldirishingiz mumkin.") : code === "NO_DRAFT" ? (isRu ? "Укажите конкретную услугу, место и дату. Данные анкеты сохранены." : "Xizmat, joy va sanani aniqroq yozing. Anketadagi ma’lumotlar saqlandi.") : (isRu ? "AI не ответил. Текст и анкета сохранены; можно повторить или заполнить вручную." : "AI javob bermadi. Matn va anketa saqlandi; qayta urining yoki qo‘lda to‘ldiring.")));
      }
    } finally { if (pending.current === controller) { pending.current = null; setBusy(false); onBusyChange(false); } }
  }

  return <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
    <label htmlFor="request-ai-text" className="text-sm font-semibold text-blue-800 dark:text-blue-200">{isRu ? "Заполнить с AI-помощником" : "AI yordamchi bilan to‘ldirish"}</label>
    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{isRu ? "Опишите услугу своими словами. AI заполнит черновик; перед публикацией вы его проверите." : "Kerakli xizmatni oddiy so‘zlar bilan yozing. AI qoralamani to‘ldiradi, yuborishdan oldin o‘zingiz tekshirasiz."}</p>
    <textarea id="request-ai-text" value={text} disabled={busy || disabled} onChange={(event) => setText(event.target.value)} maxLength={2000} rows={3} placeholder={isRu ? "Например: отель в Самарканде с 12 по 15 ноября, 2 взрослых и ребёнок 7 лет, завтрак…" : "Masalan: Samarqandda 12–15 noyabr, 2 katta va 7 yoshli bolaga mehmonxona, nonushta…"} className="mt-3 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
    <button type="button" onClick={() => void fill()} disabled={busy || disabled || !text.trim()} className="mt-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? (isRu ? "Заполнение…" : "To‘ldirilmoqda…") : (isRu ? "Заполнить анкету" : "Anketani to‘ldirish")}</button>
    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{isRu ? "Текст и текущая анкета отправляются в OpenAI. Не вводите данные паспорта и карты." : "Matn va joriy anketa OpenAI’ga yuboriladi. Pasport va karta ma’lumotlarini yozmang."}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {choices.length > 0 && <div className="mt-3 space-y-2"><p className="text-sm text-blue-800 dark:text-blue-200">{isRu ? "Найдено несколько услуг. Какую перенести в эту анкету?" : "Bir nechta xizmat topildi. Qaysi birini shu anketaga joylaymiz?"}</p>{choices.map((draft, index) => <button key={index} type="button" onClick={() => { onApply(draft); setChoices([]); }} className="block w-full rounded-xl border border-blue-200 bg-white p-3 text-left text-sm text-blue-800 dark:bg-slate-900 dark:text-blue-200">{localize(serviceDefinition(draft.category)!.label, isRu)} · {requestTitle(draft)} · {draft.travel_date || "…"}</button>)}</div>}
  </section>;
}
