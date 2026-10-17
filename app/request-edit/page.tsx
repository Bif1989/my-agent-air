"use client";

import Link from "next/link";
import { useUiSettings } from "@/lib/ui-settings";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import RequestForm from "@/app/requests/request-form";
import ActingRoleSelector from "@/app/requests/acting-role-selector";
import { getRequest, updateRequest, type RequestRecord } from "@/app/requests/requests-api";
import { getMyBillingRoles } from "@/app/billing/billing-api";
import type { BillingRoleOption } from "@/lib/billing-roles";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

function requestIdFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "requests" || !parts[1] || parts[2] !== "edit") return "";
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

export default function EditRequestPage() {
  const { isRu } = useUiSettings();
  const router = useRouter();
  const [id, setId] = useState("");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [request, setRequest] = useState<RequestRecord | null>(null);
  const [roles, setRoles] = useState<BillingRoleOption[]>([]);
  const [actingRole, setActingRole] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      const requestId = requestIdFromLocation();
      if (!requestId) { setError("So‘rov identifikatori topilmadi."); setIsLoading(false); return; }
      setId(requestId);
      setSession(storedSession);
      Promise.all([getRequest(requestId), getMyBillingRoles().catch(() => [])])
        .then(([loadedRequest, loadedRoles]) => {
          if (!loadedRequest || loadedRequest.created_by !== storedSession.user.id || loadedRequest.status !== "open") { router.replace(loadedRequest ? `/requests/${requestId}` : "/requests"); return; }
          setRequest(loadedRequest);
          setRoles(loadedRoles);
          const preferred = loadedRequest.acting_role || loadedRoles.find((item) => item.isPrimary)?.role || loadedRoles[0]?.role || "";
          setActingRole(preferred);
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof Error && (requestError.message === "AUTH_SESSION_EXPIRED" || requestError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("So‘rovni yuklashda xatolik yuz berdi.");
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  async function handleUpdate(payload: Parameters<typeof updateRequest>[1]) {
    if (!id) throw new Error(isRu ? "Не найден идентификатор запроса." : "So‘rov identifikatori topilmadi.");
    if (roles.length > 1 && !actingRole) throw new Error(isRu ? "Выберите направление." : "Yo‘nalishni tanlang.");
    try {
      const updated = await updateRequest(id, { ...payload, acting_role: actingRole || roles[0]?.role || request?.acting_role || null });
      if (!updated) throw new Error("So‘rov yangilanmadi.");
      router.push(`/requests/${id}`);
    } catch (error) {
      throw error instanceof Error ? error : new Error(isRu ? "Не удалось обновить запрос. Проверьте данные." : "So‘rovni yangilab bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.");
    }
  }

  return (
    <AppShell session={session} activePath="/requests">
      {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">So‘rov yuklanmoqda...</div>}
      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
      {request && <div className="mx-auto max-w-4xl">
        <Link href={`/requests/${request.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← So‘rov tafsilotlariga qaytish</Link>
        <header className="mt-7"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">So‘rovni boshqarish</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{isRu ? "Редактировать запрос" : "So‘rovni tahrirlash"}</h1><p className="mt-2 text-sm text-slate-500">So‘rov identifikatori va yaratuvchi ma’lumotlari o‘zgarmaydi.</p></header>
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <ActingRoleSelector roles={roles} value={actingRole} onChange={setActingRole} isRu={isRu} />
          <RequestForm key={request.id} initialValues={request} submitLabel={isRu ? "Сохранить изменения" : "O‘zgarishlarni saqlash"} submittingLabel={isRu ? "Сохранение..." : "Saqlanmoqda..."} onSubmit={handleUpdate} />
        </section>
      </div>}
    </AppShell>
  );
}
