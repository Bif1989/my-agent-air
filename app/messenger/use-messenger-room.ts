"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredSession } from "@/lib/supabase-auth";
import { mergeMessages } from "@/lib/chat-state";
import { subscribeToMessengerRoom, subscribeToDealMessages } from "@/lib/supabase-realtime";
import { MESSAGE_PAGE_SIZE, listMessengerMessages, markMessengerRoomRead, sendMessengerMessage, type MessengerMessage } from "./messenger-api";

type ChatMessage = { id: string; created_at: string };
type ChatApi<M extends ChatMessage> = { list: (id: string, options?: { before?: ChatMessage }) => Promise<M[]>; send: (id: string, text: string, messageId: string) => Promise<M>; read: (id: string) => Promise<void>; subscribe: (id: string, reload: () => void) => ReturnType<typeof subscribeToMessengerRoom>; pageSize: number };
type RoomState<M extends ChatMessage> = { messages: M[]; loaded: boolean; error: string; hasOlder: boolean; loadingOlder: boolean };
const emptyRoom: RoomState<never> = { messages: [], loaded: false, error: "", hasOlder: false, loadingOlder: false };

function useChatRoom<M extends ChatMessage>(api: ChatApi<M>, roomId: string | null, visible = true) {
  const [rooms, setRooms] = useState<Record<string, RoomState<M>>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendingRoom, setSendingRoom] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const pending = useRef(new Map<string, { text: string; id: string }>());
  const busy = useRef(false);
  const activeRoom = useRef<string | null>(null);
  const userId = getStoredSession()?.user.id || "";
  const room = (roomId && rooms[roomId]) || emptyRoom;
  const draft = (roomId && drafts[roomId]) || "";

  useEffect(() => {
    activeRoom.current = visible ? roomId : null;
    if (!roomId || !visible || !userId) return;
    let active = true;
    let request = 0;
    const reload = () => {
      if (document.visibilityState !== "visible") return;
      const sequence = ++request;
      void api.list(roomId).then((messages) => {
        if (!active || sequence !== request) return;
        setRooms((current) => {
          const previous = current[roomId] || emptyRoom;
          return { ...current, [roomId]: { ...previous, messages: mergeMessages(previous.messages, messages), loaded: true, error: "", hasOlder: previous.loaded ? previous.hasOlder : messages.length === api.pageSize } };
        });
        if (document.visibilityState === "visible" && activeRoom.current === roomId) void api.read(roomId).catch(() => undefined);
      }).catch((error: unknown) => {
        if (!active || sequence !== request) return;
        setRooms((current) => ({ ...current, [roomId]: { ...(current[roomId] || emptyRoom), loaded: true, error: error instanceof Error ? error.message : "Xabarlar yuklanmadi. Qayta urinib ko‘ring." } }));
      });
    };
    const onVisibility = () => { if (document.visibilityState === "visible") reload(); };
    const subscription = api.subscribe(roomId, reload);
    reload();
    window.addEventListener("online", reload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      activeRoom.current = null;
      window.removeEventListener("online", reload);
      document.removeEventListener("visibilitychange", onVisibility);
      if (subscription) void subscription.client.removeChannel(subscription.channel);
    };
  }, [api, roomId, visible, userId, version]);

  const setDraft = (text: string) => { if (roomId) setDrafts((current) => ({ ...current, [roomId]: text })); };
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  async function loadOlder() {
    if (!roomId || !room.messages[0] || room.loadingOlder || !room.hasOlder) return;
    const target = roomId;
    setRooms((current) => ({ ...current, [target]: { ...(current[target] || emptyRoom), loadingOlder: true, error: "" } }));
    try {
      const messages = await api.list(target, { before: room.messages[0] });
      setRooms((current) => ({ ...current, [target]: { ...(current[target] || emptyRoom), messages: mergeMessages(current[target]?.messages || [], messages), hasOlder: messages.length === api.pageSize, loadingOlder: false } }));
    } catch (error) {
      setRooms((current) => ({ ...current, [target]: { ...(current[target] || emptyRoom), loadingOlder: false, error: error instanceof Error ? error.message : "Oldingi xabarlar yuklanmadi." } }));
    }
  }

  async function send() {
    if (!roomId || !draft.trim() || busy.current) return;
    const target = roomId;
    const text = draft;
    if (text.trim().length > 4000) {
      setSendErrors((current) => ({ ...current, [target]: "Xabar 4000 belgidan oshmasin." }));
      return;
    }
    const previous = pending.current.get(target);
    const message = previous?.text === text ? previous : { text, id: crypto.randomUUID() };
    pending.current.set(target, message);
    busy.current = true;
    setSendingRoom(target);
    setSendErrors((current) => ({ ...current, [target]: "" }));
    try {
      const created = await api.send(target, text, message.id);
      // The response is stored under the room it was sent to, even after switching chats.
      setRooms((current) => ({ ...current, [target]: { ...(current[target] || emptyRoom), messages: mergeMessages(current[target]?.messages || [], [created]) } }));
      setDrafts((current) => current[target] === text ? { ...current, [target]: "" } : current);
      pending.current.delete(target);
    } catch (error) {
      setSendErrors((current) => ({ ...current, [target]: error instanceof Error ? error.message : "Xabar yuborilmadi. Qayta urinib ko‘ring." }));
    } finally {
      busy.current = false;
      setSendingRoom(null);
    }
  }

  return { messages: room.messages, isLoading: !room.loaded, error: room.error, sendError: (roomId && sendErrors[roomId]) || "", draft, setDraft, isSending: sendingRoom !== null, hasOlder: room.hasOlder, loadingOlder: room.loadingOlder, loadOlder, reload, send };
}

const messengerApi: ChatApi<MessengerMessage> = { list: listMessengerMessages, send: sendMessengerMessage, read: markMessengerRoomRead, subscribe: subscribeToMessengerRoom, pageSize: MESSAGE_PAGE_SIZE };
export function useMessengerRoom(roomId: string | null, visible = true) { return useChatRoom(messengerApi, roomId, visible); }

import { listMessages, sendMessage, markDealMessagesRead, type MessageRecord } from "@/app/messages/messages-api";
const dealApi: ChatApi<MessageRecord> = { list: listMessages, send: sendMessage, read: markDealMessagesRead, subscribe: subscribeToDealMessages, pageSize: 50 };
export function useDealChat(dealId: string | null) { return useChatRoom(dealApi, dealId); }
