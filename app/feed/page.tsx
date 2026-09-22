"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AppShell from "@/app/dashboard/components/app-shell";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { listFeedPosts, setPostReaction, getFeedPost, POST_CATEGORIES, POST_CATEGORY_LABELS, type FeedPost, type PostCategory, type ReactionType } from "@/app/feed/feed-api";
import { PostCard } from "@/app/feed/post-card";

const PAGE_SIZE = 20;
export default function FeedPage() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [category, setCategory] = useState<PostCategory | "">("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [reactingId, setReactingId] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => setSession(storedSession), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput), 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const loadPosts = useCallback(() => {
    const storedSession = getStoredSession();
    if (!storedSession) return;
    const currentRequest = ++requestId.current;
    window.setTimeout(() => {
      setIsLoading(true);
      setError("");
      listFeedPosts({ category, postType: "", search, limit: PAGE_SIZE, offset: 0 })
        .then((rows) => {
          if (currentRequest !== requestId.current) return;
          setPosts(rows);
          setHasMore(rows.length === PAGE_SIZE);
        })
        .catch((loadError: unknown) => {
          if (currentRequest !== requestId.current) return;
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("Postlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => { if (currentRequest === requestId.current) setIsLoading(false); });
    }, 0);
  }, [category, search]);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) return;
    const currentRequest = ++requestId.current;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      setError("");
      listFeedPosts({ category, postType: "", search, limit: PAGE_SIZE, offset: 0 })
        .then((rows) => {
          if (currentRequest !== requestId.current) return;
          setPosts(rows);
          setHasMore(rows.length === PAGE_SIZE);
        })
        .catch((loadError: unknown) => {
          if (currentRequest !== requestId.current) return;
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("Postlarni yuklashda xatolik yuz berdi. Qayta urinib ko‘ring.");
        })
        .finally(() => { if (currentRequest === requestId.current) setIsLoading(false); });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [category, search]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") loadPosts();
    }
    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadPosts]);



  async function loadMore() {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const rows = await listFeedPosts({ category, postType: "", search, limit: PAGE_SIZE, offset: posts.length });
      setPosts((current) => [...current, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      setError("Qo‘shimcha postlarni yuklab bo‘lmadi.");
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function handleReact(postId: string, reaction: ReactionType) {
    if (reactingId) return;
    setReactingId(postId);
    try {
      await setPostReaction(postId, reaction);
      const updated = await getFeedPost(postId);
      if (updated) setPosts((current) => current.map((post) => (post.id === postId ? updated : post)));
    } catch (reactError: unknown) {
      if (reactError instanceof Error && (reactError.message === "AUTH_SESSION_EXPIRED" || reactError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setError("Reaksiyani saqlab bo‘lmadi. Qayta urinib ko‘ring.");
    } finally {
      setReactingId(null);
    }
  }

  function clearFilters() { setCategory(""); setSearchInput(""); }
  const inputClass = "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
  const hasFilters = Boolean(category || search);

  return (
    <AppShell session={session} activePath="/feed">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Agentlar lentasi</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1f3a]">Agentlar lentasi</h1>
          <p className="mt-2 text-sm text-slate-500">B2B e’lonlar va yangiliklar</p>
        </div>
        <Link href="/feed/new" className="w-fit rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Post yaratish</Link>
      </header>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
          <label className="sr-only" htmlFor="feed-category">Kategoriya</label>
          <select id="feed-category" value={category} onChange={(event) => setCategory(event.target.value as PostCategory | "")} className={inputClass}>
            <option value="">Barcha kategoriyalar</option>
            {POST_CATEGORIES.map((item) => <option key={item} value={item}>{POST_CATEGORY_LABELS[item]}</option>)}
          </select>
          <label className="sr-only" htmlFor="feed-search">Qidiruv</label>
          <input id="feed-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Sarlavha, matn, yo‘nalish bo‘yicha qidirish" className={inputClass} />
          {hasFilters && <button type="button" onClick={clearFilters} className="rounded-xl px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">Filtrni tozalash</button>}
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</p>}

      {isLoading ? (
        <div className="mt-6 space-y-4" aria-label="Postlar yuklanmoqda">
          <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-48 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      ) : posts.length ? (
        <>
          <div className="mt-6 space-y-4">
            {posts.map((post) => <PostCard key={post.id} post={post} isReacting={reactingId === post.id} onReact={handleReact} />)}
          </div>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={loadMore} disabled={isLoadingMore} className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isLoadingMore ? "Yuklanmoqda..." : "Yana yuklash"}</button>
            </div>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-lg font-semibold text-[#0b1f3a]">{hasFilters ? "Mos e’lon topilmadi" : "Hozircha postlar yo‘q"}</p>
          <p className="mt-2 text-sm text-slate-500">{hasFilters ? "Filtrlarni o‘zgartirib qayta urinib ko‘ring." : "Birinchi bo‘lib post yoki e’lon joylang."}</p>
          <Link href="/feed/new" className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-100">Post yaratish</Link>
        </div>
      )}
    </AppShell>
  );
}
