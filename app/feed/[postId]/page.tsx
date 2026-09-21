"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/app/dashboard/components/app-shell";
import AviaSmartAssist from "@/app/components/avia-smart-assist";
import { getStoredSession, type AuthSession } from "@/lib/supabase-auth";
import { getOrCreateDirectChat } from "@/app/messenger/messenger-api";
import {
  getFeedPost,
  listComments,
  createComment,
  updateComment,
  deleteCommentSoft,
  closePost,
  deletePostSoft,
  setPostReaction,
  type FeedPost,
  type FeedComment,
  type ReactionType,
} from "@/app/feed/feed-api";
import { AuthorLink, PostBadges, ReactionBar, formatDateTime, formatPrice } from "@/app/feed/post-card";

function initials(name: string | null) {
  return (name || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function CommentItem({ comment, currentUserId, onUpdate, onDelete }: { comment: FeedComment; currentUserId: string; onUpdate: (id: string, body: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [isEditing, setIsEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const isOwner = comment.author_id === currentUserId;

  async function handleSave() {
    if (isSaving) return;
    const trimmed = body.trim();
    if (!trimmed) { setError("Izoh bo‘sh bo‘lishi mumkin emas."); return; }
    setIsSaving(true); setError("");
    try {
      await onUpdate(comment.id, trimmed);
      setIsEditing(false);
    } catch {
      setError("Izohni yangilab bo‘lmadi.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting || !window.confirm("Izohni o‘chirishga ishonchingiz komilmi?")) return;
    setIsDeleting(true);
    try {
      await onDelete(comment.id);
    } catch {
      setError("Izohni o‘chirib bo‘lmadi.");
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex gap-3 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0">
      <Link href={`/agents/${comment.author_id}`} className="shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {comment.author?.avatar_url ? (
          <Image src={comment.author.avatar_url} alt={comment.author.full_name || "Agent"} width={36} height={36} unoptimized className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{initials(comment.author?.full_name || null)}</span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/agents/${comment.author_id}`} className="text-sm font-semibold text-[#0b1f3a] hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">{comment.author?.full_name || "Ism ko‘rsatilmagan"}</Link>
          {comment.author?.is_verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Tasdiqlangan</span>}
          <span className="text-xs text-slate-400">{comment.author?.company_name}</span>
        </div>
        {isEditing ? (
          <div className="mt-2">
            <textarea maxLength={2000} rows={3} value={body} onChange={(event) => setBody(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={handleSave} disabled={isSaving} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{isSaving ? "Saqlanmoqda..." : "Saqlash"}</button>
              <button type="button" onClick={() => { setIsEditing(false); setBody(comment.body); setError(""); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Bekor qilish</button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{comment.body}</p>
        )}
        {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>{formatDateTime(comment.created_at)}{comment.edited_at && " · Tahrirlangan"}</span>
          {isOwner && !isEditing && (
            <>
              <button type="button" onClick={() => setIsEditing(true)} className="font-semibold text-blue-600 hover:text-blue-700">Tahrirlash</button>
              <button type="button" onClick={() => handleDelete().catch(() => undefined)} disabled={isDeleting} className="font-semibold text-red-600 hover:text-red-700 disabled:opacity-60">{isDeleting ? "O‘chirilmoqda..." : "O‘chirish"}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FeedPostDetailPage() {
  const params = useParams<{ postId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReacting, setIsReacting] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const storedSession = getStoredSession();
    if (!storedSession) { window.location.replace("/login"); return; }
    const timeoutId = window.setTimeout(() => {
      setSession(storedSession);
      Promise.all([getFeedPost(params.postId), listComments(params.postId)])
        .then(([loadedPost, loadedComments]) => {
          if (!loadedPost || loadedPost.status === "deleted") { setNotFound(true); return; }
          setPost(loadedPost);
          setComments(loadedComments);
        })
        .catch((loadError: unknown) => {
          if (loadError instanceof Error && (loadError.message === "AUTH_SESSION_EXPIRED" || loadError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
          setError("Postni yuklashda xatolik yuz berdi.");
        })
        .finally(() => setIsLoading(false));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [params.postId]);

  async function handleReact(reaction: ReactionType) {
    if (isReacting || !post) return;
    setIsReacting(true);
    try {
      await setPostReaction(post.id, reaction);
      const updated = await getFeedPost(post.id);
      if (updated) setPost(updated);
    } catch (reactError: unknown) {
      if (reactError instanceof Error && (reactError.message === "AUTH_SESSION_EXPIRED" || reactError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setError("Reaksiyani saqlab bo‘lmadi.");
    } finally {
      setIsReacting(false);
    }
  }

  async function handleClose() {
    if (!post || post.status !== "active" || isWorking || !window.confirm("Postni yopishga ishonchingiz komilmi?")) return;
    setIsWorking(true); setError(""); setMessage("");
    try {
      await closePost(post.id);
      setPost({ ...post, status: "closed" });
      setMessage("Post yopildi.");
    } catch {
      setError("Postni yopib bo‘lmadi.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDelete() {
    if (!post || isWorking || !window.confirm("Postni o‘chirishga ishonchingiz komilmi?")) return;
    setIsWorking(true); setError("");
    try {
      await deletePostSoft(post.id);
      router.push("/feed");
    } catch {
      setError("Postni o‘chirib bo‘lmadi.");
      setIsWorking(false);
    }
  }

  async function handleOpenChat() {
    if (!post || isOpeningChat) return;
    setIsOpeningChat(true); setError("");
    try {
      const roomId = await getOrCreateDirectChat(post.author_id);
      if (!roomId) throw new Error("CHAT_ROOM_MISSING");
      router.push(`/messenger/${roomId}`);
    } catch (chatError: unknown) {
      if (chatError instanceof Error && (chatError.message === "AUTH_SESSION_EXPIRED" || chatError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setError("Agent bilan chat ochilmadi.");
    } finally {
      setIsOpeningChat(false);
    }
  }

  async function handleCommentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingComment || !post) return;
    const trimmed = commentBody.trim();
    if (!trimmed) { setError("Izoh bo‘sh bo‘lishi mumkin emas."); return; }
    if (trimmed.length > 2000) { setError("Izoh 2000 belgidan oshmasligi kerak."); return; }
    setIsSubmittingComment(true); setError("");
    try {
      const created = await createComment(post.id, trimmed);
      setComments((current) => [...current, created]);
      setCommentBody("");
      setPost({ ...post, comment_count: post.comment_count + 1 });
    } catch (commentError: unknown) {
      if (commentError instanceof Error && (commentError.message === "AUTH_SESSION_EXPIRED" || commentError.message === "AUTH_SESSION_MISSING")) { window.location.replace("/login"); return; }
      setError("Izohni yuborib bo‘lmadi.");
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleCommentUpdate(commentId: string, body: string) {
    const updated = await updateComment(commentId, body);
    if (updated) setComments((current) => current.map((comment) => (comment.id === commentId ? updated : comment)));
  }

  async function handleCommentDelete(commentId: string) {
    await deleteCommentSoft(commentId);
    setComments((current) => current.filter((comment) => comment.id !== commentId));
    if (post) setPost({ ...post, comment_count: Math.max(0, post.comment_count - 1) });
  }

  const isOwner = Boolean(session && post && session.user.id === post.author_id);
  const price = post ? formatPrice(post.price, post.currency) : null;
  const hasRoute = Boolean(post?.origin || post?.destination);

  return (
    <AppShell session={session} activePath="/feed">
      {isLoading && <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-500">Post yuklanmoqda...</div>}
      {notFound && <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">Bu post topilmadi yoki o‘chirilgan.<Link href="/feed" className="ml-2 font-semibold underline">Lentaga qaytish</Link></div>}
      {!isLoading && error && !post && <div role="alert" className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}<Link href="/feed" className="ml-2 font-semibold underline">Lentaga qaytish</Link></div>}
      {post && (
        <div className="mx-auto max-w-4xl">
          <Link href="/feed" className="text-sm font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">← Lentaga qaytish</Link>
          {message && <p role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
          {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

          <article className={`mt-7 rounded-3xl border bg-white p-6 shadow-sm sm:p-8 ${post.post_type === "announcement" ? "border-amber-200" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <AuthorLink post={post} />
              <PostBadges post={post} />
            </div>

            {post.title && <h1 className="mt-6 break-words text-2xl font-semibold tracking-tight text-[#0b1f3a] sm:text-3xl">{post.title}</h1>}
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{post.body}</p>

            {(hasRoute || price || post.contact_phone) && (
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 rounded-xl bg-slate-50 px-5 py-4 text-sm text-slate-600">
                {hasRoute && <span className="font-medium text-[#0b1f3a]">{post.origin || "—"} <span className="px-1 text-blue-500">→</span> {post.destination || "—"}</span>}
                {price && <span className="font-semibold text-[#0b1f3a]">{price}</span>}
                {post.contact_phone && <span>{post.contact_phone}</span>}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>Yaratilgan: {formatDateTime(post.created_at)}</span>
              {post.edited_at && <span>· Tahrirlangan: {formatDateTime(post.edited_at)}</span>}
              {post.expires_at && <span>· Amal qilish muddati: {formatDateTime(post.expires_at)}</span>}
            </div>

            <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-6">
              {!isOwner && post.contact_phone && <a href={`tel:${post.contact_phone}`} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Qo‘ng‘iroq qilish</a>}
              {!isOwner && <button type="button" onClick={() => handleOpenChat().catch(() => undefined)} disabled={isOpeningChat} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isOpeningChat ? "Chat ochilmoqda..." : "Xabar yozish"}</button>}
              {isOwner && (
                <>
                  <Link href={`/feed/${post.id}/edit`} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a] hover:border-blue-300 hover:text-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100">Tahrirlash</Link>
                  {post.status === "active" && <button type="button" onClick={() => handleClose().catch(() => undefined)} disabled={isWorking} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-[#0b1f3a] hover:border-amber-300 hover:text-amber-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-60">Yopish</button>}
                  <button type="button" onClick={() => handleDelete().catch(() => undefined)} disabled={isWorking} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:opacity-60">O‘chirish</button>
                </>
              )}
            </div>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <ReactionBar post={post} isBusy={isReacting} onReact={handleReact} />
            </div>
          </article>

          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-[#0b1f3a]">Izohlar ({comments.length})</h2>
            <form onSubmit={handleCommentSubmit} className="mt-5">
              <label className="sr-only" htmlFor="comment-body">Izoh yozish</label>
              <AviaSmartAssist id="comment-body" value={commentBody} onChange={setCommentBody} maxLength={2000} rows={3} placeholder="Izoh yozing..." className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" containerClassName="relative" />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-slate-400">{commentBody.length}/2000</span>
                <button type="submit" disabled={isSubmittingComment || !commentBody.trim()} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">{isSubmittingComment ? "Yuborilmoqda..." : "Yuborish"}</button>
              </div>
            </form>

            <div className="mt-6 space-y-4">
              {comments.length ? comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} currentUserId={session?.user.id || ""} onUpdate={handleCommentUpdate} onDelete={handleCommentDelete} />
              )) : <p className="text-sm text-slate-500">Hozircha izohlar yo‘q. Birinchi bo‘lib izoh qoldiring.</p>}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
