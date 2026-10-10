"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import PostForm from "@/app/feed/post-form";
import { getFeedPost, updatePost, type FeedPost } from "@/app/feed/feed-api";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";

function feedPostIdFromLocation() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] !== "feed" || !parts[1] || parts[2] !== "edit") return "";
  try { return decodeURIComponent(parts[1]); } catch { return parts[1]; }
}

export default function EditFeedPostPage() {
  const router = useRouter();
  const [postId, setPostId] = useState("");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [post, setPost] = useState<FeedPost | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      const id = feedPostIdFromLocation();
      if (!id) {
        setError("Post identifikatori topilmadi.");
        setIsLoading(false);
        return;
      }
      setPostId(id);
      setSession(storedSession);
      getFeedPost(id)
        .then((loadedPost) => {
          if (!loadedPost || loadedPost.status === "deleted" || loadedPost.author_id !== storedSession.user.id) { router.replace(loadedPost ? `/feed/${id}` : "/feed"); return; }
          setPost(loadedPost);
        })
        .catch((loadError: unknown) => {
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("Postni yuklashda xatolik yuz berdi.");
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [router]);

  async function handleUpdate(payload: Parameters<typeof updatePost>[1]) {
    if (!postId) throw new Error("Post identifikatori topilmadi.");
    try {
      const updated = await updatePost(postId, payload);
      if (!updated) throw new Error("Post yangilanmadi.");
      router.push(`/feed/${postId}`);
    } catch {
      throw new Error("Postni yangilab bo‘lmadi. Ma’lumotlarni tekshirib, qayta urinib ko‘ring.");
    }
  }

  return (
    <AppShell session={session} activePath="/feed">
      {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Post yuklanmoqda...</div>}
      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}
      {post && (
        <div className="mx-auto max-w-4xl">
          <Link href={`/feed/${post.id}`} className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Post tafsilotlariga qaytish</Link>
          <header className="mt-7">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Postni boshqarish</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Postni tahrirlash</h1>
          </header>
          <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
            <PostForm key={post.id} initialValues={post} submitLabel="O‘zgarishlarni saqlash" submittingLabel="Saqlanmoqda..." onSubmit={handleUpdate} />
          </section>
        </div>
      )}
    </AppShell>
  );
}
