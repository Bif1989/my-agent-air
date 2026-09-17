"use client";

import Image from "next/image";
import Link from "next/link";
import type { FeedPost, ReactionType } from "@/app/feed/feed-api";
import { POST_CATEGORY_LABELS, POST_TYPE_LABELS } from "@/app/feed/feed-api";

export const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
  { type: "like", emoji: "👍", label: "Yoqdi" },
  { type: "fire", emoji: "🔥", label: "Zo‘r" },
  { type: "deal", emoji: "🤝", label: "Qiziq" },
];

export function formatDate(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) return "Sana ko‘rsatilmagan";
  return new Intl.DateTimeFormat("uz-UZ", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatPrice(price: number | null, currency: string) {
  if (price == null) return null;
  return `${price.toLocaleString("uz-UZ")} ${currency}`;
}

function initials(name: string | null) {
  return (name || "Agent").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export function AuthorLink({ post }: { post: FeedPost }) {
  return (
    <Link href={`/agents/${post.author_id}`} className="flex min-w-0 items-center gap-3 focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={(event) => event.stopPropagation()}>
      {post.author_avatar_url ? (
        <Image src={post.author_avatar_url} alt={post.author_full_name || "Agent"} width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">{initials(post.author_full_name)}</span>
      )}
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-[#0b1f3a]">{post.author_full_name || "Ism ko‘rsatilmagan"}</span>
          {post.author_is_verified && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Tasdiqlangan</span>}
        </span>
        <span className="block truncate text-xs text-slate-500">{post.author_company_name || "Kompaniya ko‘rsatilmagan"}{post.author_city ? ` · ${post.author_city}` : ""}</span>
      </span>
    </Link>
  );
}

export function ReactionBar({ post, isBusy, onReact }: { post: FeedPost; isBusy: boolean; onReact: (reaction: ReactionType) => void }) {
  const counts: Record<ReactionType, number> = { like: post.like_count, fire: post.fire_count, deal: post.deal_count };
  return (
    <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
      {REACTIONS.map(({ type, emoji, label }) => {
        const active = post.my_reaction === type;
        return (
          <button
            key={type}
            type="button"
            disabled={isBusy}
            onClick={() => onReact(type)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50/60"}`}
          >
            <span aria-hidden="true">{emoji}</span>
            <span>{label}</span>
            <span className="text-slate-400">{counts[type]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PostBadges({ post }: { post: FeedPost }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${post.post_type === "announcement" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{POST_TYPE_LABELS[post.post_type]}</span>
      <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">{POST_CATEGORY_LABELS[post.category]}</span>
      {post.status === "closed" && <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">Yopilgan</span>}
    </div>
  );
}

export function PostCard({ post, isReacting, onReact }: { post: FeedPost; isReacting: boolean; onReact: (postId: string, reaction: ReactionType) => void }) {
  const price = formatPrice(post.price, post.currency);
  const hasRoute = post.origin || post.destination;
  const isAnnouncement = post.post_type === "announcement";
  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6 ${isAnnouncement ? "border-amber-200" : "border-slate-200"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AuthorLink post={post} />
        <PostBadges post={post} />
      </div>
      <Link href={`/feed/${post.id}`} className="mt-4 block focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
        {post.title && <h2 className="break-words text-lg font-semibold text-[#0b1f3a]">{post.title}</h2>}
        <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{post.body}</p>
      </Link>
      {(hasRoute || price || post.contact_phone) && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {hasRoute && <span className="font-medium text-[#0b1f3a]">{post.origin || "—"} <span className="px-1 text-blue-500">→</span> {post.destination || "—"}</span>}
          {price && <span className="font-semibold text-[#0b1f3a]">{price}</span>}
          {post.contact_phone && <span>{post.contact_phone}</span>}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-xs text-slate-400">{formatDate(post.created_at)}{post.edited_at && " · Tahrirlangan"}</span>
        <Link href={`/feed/${post.id}`} className="text-xs font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500" onClick={(event) => event.stopPropagation()}>{post.comment_count} ta izoh</Link>
      </div>
      <div className="mt-4">
        <ReactionBar post={post} isBusy={isReacting} onReact={(reaction) => onReact(post.id, reaction)} />
      </div>
    </article>
  );
}
