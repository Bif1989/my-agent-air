"use client";

import { useEffect, useState } from "react";
import { listOwnRequestTargets, type RequestTargetRecord } from "@/app/requests/request-targeting-api";
import { getStoredSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

type Listener = (target: RequestTargetRecord | null) => void;
const cache = new Map<string, RequestTargetRecord | null>();
const listeners = new Map<string, Set<Listener>>();
const pendingByUser = new Map<string, Set<string>>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function cacheKey(userId: string, requestId: string) {
  return `${userId}:${requestId}`;
}

function publish(userId: string, requestId: string, target: RequestTargetRecord | null) {
  const key = cacheKey(userId, requestId);
  cache.set(key, target);
  listeners.get(key)?.forEach((listener) => listener(target));
}

function queueLookup(userId: string, requestId: string) {
  const key = cacheKey(userId, requestId);
  if (cache.has(key)) return;
  const pending = pendingByUser.get(userId) || new Set<string>();
  pending.add(requestId);
  pendingByUser.set(userId, pending);
  if (timers.has(userId)) return;

  timers.set(userId, setTimeout(() => {
    timers.delete(userId);
    const ids = [...(pendingByUser.get(userId) || [])];
    pendingByUser.delete(userId);
    if (!ids.length) return;
    void listOwnRequestTargets(ids)
      .then((rows) => {
        const byRequest = new Map(rows.map((row) => [row.request_id, row]));
        ids.forEach((id) => publish(userId, id, byRequest.get(id) || null));
      })
      .catch(() => ids.forEach((id) => publish(userId, id, null)));
  }, 0));
}

export default function RequestTargetListBadge({ requestId, createdBy, distributionMode }: { requestId: string; createdBy?: string | null; distributionMode?: "targeted" | "broadcast" }) {
  const { isRu } = useUiSettings();
  const [target, setTarget] = useState<RequestTargetRecord | null>(null);

  useEffect(() => {
    if (distributionMode !== "targeted") return;
    const session = getStoredSession();
    if (!session || createdBy === session.user.id) return;
    const key = cacheKey(session.user.id, requestId);
    let active = true;
    if (cache.has(key)) {
      queueMicrotask(() => { if (active) setTarget(cache.get(key) || null); });
      return () => { active = false; };
    }
    const bucket = listeners.get(key) || new Set<Listener>();
    const listener: Listener = (next) => { if (active) setTarget(next); };
    bucket.add(listener);
    listeners.set(key, bucket);
    queueLookup(session.user.id, requestId);
    return () => {
      active = false;
      const current = listeners.get(key);
      current?.delete(listener);
      if (current && current.size === 0) listeners.delete(key);
    };
  }, [createdBy, distributionMode, requestId]);

  if (!target || target.status === "declined") return null;
  return <span title={isRu ? "Geo Tender подобрал этот запрос под ваш профиль услуг" : "Geo Tender bu so‘rovni xizmat profilingizga mos deb topdi"} className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-800">
    Geo Tender · {isRu ? "Подходит вам" : "Sizga mos"} · {target.match_score}
  </span>;
}
