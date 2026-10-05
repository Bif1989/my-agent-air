"use client";

import { readRequestDraft, type AssistantDraft } from "@/lib/request-assistant";
import Link from "next/link";
import { loadStagedRequestDraft } from "@/lib/request-draft-storage";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import RequestForm from "@/app/requests/request-form";
import { createRequest } from "@/app/requests/requests-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

export default function NewRequestPage() {
  const router = useRouter();
  const { isRu } = useUiSettings();
  const [draft, setDraft] = useState<AssistantDraft | undefined>();
  const [draftMissing, setDraftMissing] = useState(false);
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      const params = new URLSearchParams(window.location.search);
      let loaded: AssistantDraft | undefined;
      try { loaded = params.has("draft_id") ? loadStagedRequestDraft(params.get("draft_id"), storedSession.user.id, window.sessionStorage) : readRequestDraft(params.get("draft")); } catch { /* Storage can be disabled. */ }
      setDraft(loaded);
      setDraftMissing((params.has("draft_id") || params.has("draft")) && !loaded);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleCreate(payload: Parameters<typeof createRequest>[0]) {
    if (!session) throw new Error(isRu ? "Сессия не найдена. Войдите снова." : "Session topilmadi. Qaytadan kiring.");
    try {
      const created = await createRequest(payload, session.user.id);
      router.push(`/requests/${created.id}`);
    } catch (error) {
      throw error instanceof Error ? error : new Error(isRu ? "Не удалось создать запрос. Попробуйте ещё раз." : "So‘rovni yaratib bo‘lmadi. Qayta urinib ko‘ring.");
    }
  }

  return (
    <AppShell session={session} activePath="/requests">
      <div className="mx-auto max-w-4xl"><Link href="/requests" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← {isRu ? "Назад к запросам" : "So‘rovlarga qaytish"}</Link><header className="mt-7"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{isRu ? "НОВАЯ ВОЗМОЖНОСТЬ" : "Yangi imkoniyat"}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{isRu ? "Создать новый запрос" : "Yangi so‘rov yaratish"}</h1><p className="mt-2 text-sm text-slate-500">{isRu ? "Укажите данные, чтобы партнёры могли отправить точное предложение." : "Hamkor agentlar sizga aniq taklif yuborishi uchun ma’lumotlarni kiriting."}</p></header><section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{draftMissing && <p role="alert" className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">{isRu ? "Черновик недоступен или срок хранения истёк. Откройте его заново из истории AI-чата." : "Qoralama topilmadi yoki saqlash muddati tugadi. Uni AI chat tarixidan qayta oching."}</p>}{ready && <RequestForm initialValues={draft} submitLabel={isRu ? "Создать запрос" : "So‘rovni yaratish"} submittingLabel={isRu ? "Создание..." : "Yaratilmoqda..."} onSubmit={handleCreate} />}</section></div>
    </AppShell>
  );
}
