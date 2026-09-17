"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import PostForm from "@/app/feed/post-form";
import { createPost } from "@/app/feed/feed-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

export default function NewFeedPostPage() {
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => setSession(storedSession), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleCreate(payload: Parameters<typeof createPost>[0]) {
    try {
      const created = await createPost(payload);
      router.push(`/feed/${created.id}`);
    } catch {
      throw new Error("Postni yaratib bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.");
    }
  }

  return (
    <AppShell session={session} activePath="/feed">
      <div className="mx-auto max-w-4xl">
        <Link href="/feed" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Lentaga qaytish</Link>
        <header className="mt-7">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Yangi post</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Post yaratish</h1>
          <p className="mt-2 text-sm text-slate-500">Hamkorlar tarmog‘i uchun post yoki e’lon joylashtiring.</p>
        </header>
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          <PostForm submitLabel="Post yaratish" submittingLabel="Yaratilmoqda..." onSubmit={handleCreate} />
        </section>
      </div>
    </AppShell>
  );
}
