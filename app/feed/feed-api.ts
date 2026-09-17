import { authenticatedSupabaseFetch, getStoredSession } from "@/lib/supabase-auth";

export type PostType = "post" | "announcement";
export type PostCategory = "aviachipta" | "tur_paket" | "mehmonxona" | "transfer" | "viza" | "umra" | "hamkorlik" | "boshqa";
export type PostStatus = "active" | "closed" | "deleted";
export type PostCurrency = "USD" | "UZS" | "EUR" | "RUB";
export type ReactionType = "like" | "fire" | "deal";

export const POST_CATEGORIES: PostCategory[] = ["aviachipta", "tur_paket", "mehmonxona", "transfer", "viza", "umra", "hamkorlik", "boshqa"];
export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  aviachipta: "Aviachipta",
  tur_paket: "Tur paket",
  mehmonxona: "Mehmonxona",
  transfer: "Transfer",
  viza: "Viza",
  umra: "Umra",
  hamkorlik: "Hamkorlik",
  boshqa: "Boshqa",
};
export const POST_TYPE_LABELS: Record<PostType, string> = { post: "Post", announcement: "E’lon" };
export const POST_CURRENCIES: PostCurrency[] = ["USD", "UZS", "EUR", "RUB"];

export type FeedPost = {
  id: string;
  author_id: string;
  post_type: PostType;
  category: PostCategory;
  title: string | null;
  body: string;
  origin: string | null;
  destination: string | null;
  price: number | null;
  currency: PostCurrency;
  contact_phone: string | null;
  status: PostStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  author_full_name: string | null;
  author_company_name: string | null;
  author_city: string | null;
  author_avatar_url: string | null;
  author_is_verified: boolean | null;
  comment_count: number;
  like_count: number;
  fire_count: number;
  deal_count: number;
  my_reaction: ReactionType | null;
};

export type FeedCommentAuthor = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
};

export type FeedComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author: FeedCommentAuthor | null;
};

export type PostPayload = {
  post_type: PostType;
  category: PostCategory;
  title: string | null;
  body: string;
  origin: string | null;
  destination: string | null;
  price: number | null;
  currency: PostCurrency;
  contact_phone: string | null;
  expires_at: string | null;
};

export type ListFeedOptions = {
  category?: PostCategory | "";
  postType?: PostType | "";
  search?: string;
  limit?: number;
  offset?: number;
};

const COMMENT_SELECT = "id,post_id,author_id,body,created_at,edited_at,author:profiles!post_comments_author_id_fkey(id,full_name,company_name,avatar_url,is_verified)";

async function readJson<T>(response: Response) {
  return response.json() as Promise<T>;
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function currentUserId() {
  const session = getStoredSession();
  if (!session) throw new Error("AUTH_SESSION_MISSING");
  return session.user.id;
}

export async function listFeedPosts(options: ListFeedOptions = {}) {
  const response = await authenticatedSupabaseFetch("rpc/list_feed_posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      p_category: options.category || null,
      p_post_type: options.postType || null,
      p_search: options.search?.trim() || null,
      p_limit: options.limit ?? 20,
      p_offset: options.offset ?? 0,
    }),
  });
  return readJson<FeedPost[]>(response);
}

export async function getFeedPost(postId: string) {
  const response = await authenticatedSupabaseFetch("rpc/get_feed_post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_post_id: postId }),
  });
  const data = await readJson<FeedPost[] | FeedPost | null>(response);
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

export async function createPost(payload: PostPayload) {
  const response = await authenticatedSupabaseFetch("posts", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ ...payload, author_id: currentUserId(), status: "active" }),
  });
  const rows = await readJson<{ id: string }[]>(response);
  return rows[0];
}

export async function updatePost(postId: string, payload: PostPayload) {
  const response = await authenticatedSupabaseFetch(`posts?id=eq.${encode(postId)}&author_id=eq.${encode(currentUserId())}&status=neq.deleted`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });
  const rows = await readJson<{ id: string }[]>(response);
  return rows[0] || null;
}

export async function closePost(postId: string) {
  const response = await authenticatedSupabaseFetch(`posts?id=eq.${encode(postId)}&author_id=eq.${encode(currentUserId())}&status=eq.active`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "closed" }),
  });
  const rows = await readJson<{ id: string }[]>(response);
  return rows[0] || null;
}

export async function deletePostSoft(postId: string) {
  const response = await authenticatedSupabaseFetch(`posts?id=eq.${encode(postId)}&author_id=eq.${encode(currentUserId())}&status=neq.deleted`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "deleted" }),
  });
  const rows = await readJson<{ id: string }[]>(response);
  return rows[0] || null;
}

export async function listComments(postId: string) {
  const response = await authenticatedSupabaseFetch(`post_comments?select=${encode(COMMENT_SELECT)}&post_id=eq.${encode(postId)}&deleted_at=is.null&order=created_at.asc`);
  return readJson<FeedComment[]>(response);
}

export async function createComment(postId: string, body: string) {
  const response = await authenticatedSupabaseFetch(`post_comments?select=${encode(COMMENT_SELECT)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ post_id: postId, author_id: currentUserId(), body }),
  });
  const rows = await readJson<FeedComment[]>(response);
  return rows[0];
}

export async function updateComment(commentId: string, body: string) {
  const response = await authenticatedSupabaseFetch(`post_comments?select=${encode(COMMENT_SELECT)}&id=eq.${encode(commentId)}&author_id=eq.${encode(currentUserId())}&deleted_at=is.null`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ body }),
  });
  const rows = await readJson<FeedComment[]>(response);
  return rows[0] || null;
}

export async function deleteCommentSoft(commentId: string) {
  await authenticatedSupabaseFetch(`post_comments?id=eq.${encode(commentId)}&author_id=eq.${encode(currentUserId())}&deleted_at=is.null`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  });
}

export async function setPostReaction(postId: string, reaction: ReactionType) {
  const response = await authenticatedSupabaseFetch("rpc/set_post_reaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_post_id: postId, p_reaction: reaction }),
  });
  return response.json().catch(() => null);
}
