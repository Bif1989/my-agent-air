import { readRequestDraft, type AssistantDraft } from "@/lib/request-assistant";

const PREFIX = "my-agent-air:request-draft:";
const MAX_AGE = 24 * 60 * 60 * 1000;
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

// Keep complete drafts in chat history, but never send their potentially large,
// private contents through page URLs, access logs, referrers or Next prefetches.
export function stageRequestDraft(draft: AssistantDraft, owner: string, storage: DraftStorage, now = Date.now()): string {
  if (!owner) throw new Error("AUTH_REQUIRED");
  const clean = readRequestDraft(JSON.stringify(draft));
  if (!clean) throw new Error("INVALID_DRAFT");
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const item = JSON.parse(storage.getItem(key) || "null");
      if (!item || item.owner !== owner || !Number.isFinite(item.createdAt) || now - item.createdAt > MAX_AGE) storage.removeItem(key);
    } catch { storage.removeItem(key); }
  }
  const id = crypto.randomUUID();
  storage.setItem(PREFIX + id, JSON.stringify({ owner, createdAt: now, draft: clean }));
  return `/requests/new?draft_id=${id}`;
}

export function loadStagedRequestDraft(id: string | null, owner: string, storage: DraftStorage, now = Date.now()): AssistantDraft | undefined {
  if (!id || !/^[a-f\d-]{36}$/i.test(id)) return;
  try {
    const value = JSON.parse(storage.getItem(PREFIX + id) || "null");
    if (!value || value.owner !== owner || !Number.isFinite(value.createdAt) || value.createdAt > now || now - value.createdAt > MAX_AGE) return;
    return readRequestDraft(JSON.stringify(value.draft));
  } catch { return; }
}
