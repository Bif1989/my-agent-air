"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { closeGroupChat, getAccessibleMessengerRoom, leaveGroupChat, listGroupMembers, transferGroupOwnership, updateGroupChat, type GroupMember, type MessengerRoom } from "@/app/messenger/messenger-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

const roleLabels: Record<string, string> = { owner: "Guruh egasi", admin: "Administrator", member: "A’zo" };

function initials(name: string | null, company: string | null) {
  return (name || company || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function GroupSettingsPage() {
  const params = useParams<{ roomId: string }>();
  const router = useRouter();
  const [session] = useState<AuthSession | null>(() => getStoredSession());
  const [room, setRoom] = useState<MessengerRoom | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) {
      router.replace("/login");
      return;
    }

    Promise.all([listGroupMembers(params.roomId), getAccessibleMessengerRoom(params.roomId)])
      .then(([loadedMembers, accessibleRoom]) => {
        if (!accessibleRoom || accessibleRoom.room_type !== "group") {
          setError("Bu sahifa faqat guruhlar uchun mo‘ljallangan.");
          return;
        }
        setRoom(accessibleRoom);
        setMembers(loadedMembers);
        setTitle(accessibleRoom.title || "");
        setDescription(accessibleRoom.description || "");
      })
      .catch(() => setError("Guruh ma’lumotlari yuklanmadi."));
  }, [params.roomId, router]);

  const currentUserId = session?.user.id;
  const currentMember = useMemo(() => members.find((member) => member.user_id === currentUserId) || null, [currentUserId, members]);
  const currentRole = currentMember?.member_role || "member";
  const canEdit = currentRole === "owner" || currentRole === "admin";

  async function handleSave() {
    if (!room || !canEdit) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) { setError("Guruh nomi shart."); return; }
    if (trimmedTitle.length < 3 || trimmedTitle.length > 100) { setError("Nomi 3-100 belgi bo‘lishi kerak."); return; }
    if (trimmedDescription.length > 500) { setError("Tavsif 500 belgidan oshmasligi kerak."); return; }
    setIsSaving(true);
    setError("");
    try {
      await updateGroupChat(room.id, trimmedTitle, trimmedDescription);
      setIsEditing(false);
      const refreshed = await listGroupMembers(room.id);
      setMembers(refreshed);
      setRoom((current) => current ? { ...current, title: trimmedTitle, description: trimmedDescription } : current);
    } catch (saveError: unknown) {
      if (saveError instanceof Error && (saveError.message === "AUTH_SESSION_EXPIRED" || saveError.message === "AUTH_SESSION_MISSING")) {
        router.replace("/login");
        return;
      }
      setError("Guruh ma’lumotlari saqlanmadi.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleTransferOwnership() {
    if (!room || currentRole !== "owner") return;
    const nextOwner = members.find((member) => member.user_id !== currentUserId && member.member_role !== "owner");
    if (!nextOwner) {
      setError("Transfer uchun boshqa a’zo mavjud emas.");
      return;
    }
    if (!window.confirm("Guruh egaligini ushbu agentga o‘tkazasizmi? Siz administrator bo‘lib qolasiz.")) return;
    try {
      await transferGroupOwnership(room.id, nextOwner.user_id);
      router.push("/messenger");
    } catch (transferError: unknown) {
      setError(transferError instanceof Error ? transferError.message : "Ownership o‘tkazilmadi.");
    }
  }

  async function handleCloseGroup() {
    if (!room || currentRole !== "owner") return;
    if (!window.confirm("Guruh barcha a’zolar uchun yopiladi. Davom etasizmi?")) return;
    try {
      await closeGroupChat(room.id);
      router.push("/messenger");
    } catch (closeError: unknown) {
      setError(closeError instanceof Error ? closeError.message : "Guruh yopilmadi.");
    }
  }

  async function handleLeave() {
    if (!room || currentRole === "owner") return;
    if (!window.confirm("Ushbu guruhdan chiqmoqchimisiz?")) return;
    try {
      await leaveGroupChat(room.id);
      router.push("/messenger");
    } catch (leaveError: unknown) {
      setError(leaveError instanceof Error ? leaveError.message : "Guruhdan chiqish amalga oshmadi.");
    }
  }

  if (!room) {
    return (
      <AppShell session={session} activePath="/messenger">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">{error || "Yuklanmoqda..."}</div>
      </AppShell>
    );
  }

  const canManageMembers = currentRole === "owner" || currentRole === "admin";

  return (
    <AppShell session={session} activePath="/messenger">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">Guruh sozlamalari</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#0b1f3a]">{room.title || "Guruh"}</h1>
          </div>
          <Link href={`/messenger/${room.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700">← Chatga qaytish</Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-[#0b1f3a]">Guruh haqida</h2>
                <p className="mt-1 text-sm text-slate-500">{members.length} a’zo · {roleLabels[currentRole] || "A’zo"}</p>
              </div>
              {canEdit && !isEditing && <button type="button" onClick={() => setIsEditing(true)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-[#0b1f3a]">Tahrirlash</button>}
            </div>

            {isEditing ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Nomi</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-slate-700">Tavsif</span>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={handleSave} disabled={isSaving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{isSaving ? "Saqlanmoqda..." : "Saqlash"}</button>
                  <button type="button" onClick={() => { setIsEditing(false); setTitle(room.title || ""); setDescription(room.description || ""); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">Bekor qilish</button>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tavsif</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{room.description || "Tavsif kiritilmagan."}</p>
                </div>
              </div>
            )}

            {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          </section>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-[#0b1f3a]">Boshqaruv</h2>
            <div className="mt-4 space-y-3">
              {currentRole === "owner" && (
                <>
                  <button type="button" onClick={handleTransferOwnership} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-[#0b1f3a]">Ownershipni o‘tkazish</button>
                  <button type="button" onClick={handleCloseGroup} className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">Guruhni yopish</button>
                </>
              )}
              {currentRole !== "owner" && (
                <button type="button" onClick={handleLeave} className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-sm font-semibold text-red-700">Guruhni tark etish</button>
              )}
              {currentRole === "owner" && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">Avval guruh egaligini boshqa a’zoga o‘tkazing.</div>}
            </div>
          </aside>
        </div>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-[#0b1f3a]">A’zolar</h2>
            {canManageMembers && <button type="button" className="rounded-xl bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700">A’zo qo‘shish</button>}
          </div>

          <div className="mt-5 space-y-3">
            {members.length ? members.map((member) => (
              <div key={member.user_id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  {member.avatar_url ? <Image src={member.avatar_url} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-full object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">{initials(member.full_name, member.company_name)}</span>}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold text-[#0b1f3a]">{member.full_name || "Agent"}</span>
                      {member.is_verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Tasdiqlangan</span>}
                    </div>
                    <p className="truncate text-xs text-slate-500">{member.company_name || "Kompaniya ko‘rsatilmagan"}{member.city ? ` · ${member.city}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-semibold text-cyan-700">{roleLabels[member.member_role] || "A’zo"}</span>
                </div>
              </div>
            )) : <p className="text-sm text-slate-500">A’zo yo‘q.</p>}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
