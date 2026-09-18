"use client";

import { useEffect } from "react";

export type ChatToastData = {
  id: string;
  sender: string;
  title: string;
  preview: string;
  href: string;
};

const AUTO_DISMISS_MS = 5500;

function ToastItem({ toast, onClose, onOpen }: { toast: ChatToastData; onClose: (id: string) => void; onOpen: (toast: ChatToastData) => void }) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => onClose(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timeoutId);
  }, [toast.id, onClose]);

  return (
    <div role="status" className="pointer-events-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/10">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
          {toast.sender.slice(0, 1).toUpperCase() || "A"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#0b1f3a]">{toast.sender}</p>
          <p className="truncate text-xs text-slate-500">{toast.title}</p>
          <p className="mt-1 line-clamp-2 break-words text-sm text-slate-700">{toast.preview}</p>
          <button type="button" onClick={() => onOpen(toast)} className="mt-2 inline-flex text-xs font-semibold text-blue-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            Ochish
          </button>
        </div>
        <button type="button" onClick={() => onClose(toast.id)} aria-label="Yopish" className="shrink-0 rounded-full p-1 text-lg leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
          ×
        </button>
      </div>
    </div>
  );
}

export default function ChatToastStack({ toasts, onClose, onOpen }: { toasts: ChatToastData[]; onClose: (id: string) => void; onOpen: (toast: ChatToastData) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col items-stretch gap-3 sm:inset-x-auto sm:right-4 sm:items-end">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={onClose} onOpen={onOpen} />
      ))}
    </div>
  );
}
