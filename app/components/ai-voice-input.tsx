"use client";

import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getStoredSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

const MAX_RECORDING_MS = 90_000;
const MOBILE_BREAKPOINT = 768;

function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function fileExtension(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(value.length, value.length);
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT;
}

function findMobileNav() {
  return document.querySelector<HTMLElement>(
    'nav[aria-label="Mobil asosiy navigatsiya"], nav[aria-label="Мобильная навигация"]',
  );
}

export default function AiVoiceInput() {
  const pathname = usePathname();
  const { isRu } = useUiSettings();
  const [portalTarget, setPortalTarget] = useState<HTMLFormElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [micRight, setMicRight] = useState(82);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const supported = typeof window !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";

  useEffect(() => {
    if (pathname !== "/dashboard") {
      setPortalTarget(null);
      setTextarea(null);
      delete document.documentElement.dataset.aiKeyboardOpen;
      return;
    }

    let activeTextarea: HTMLTextAreaElement | null = null;
    let activeForm: HTMLFormElement | null = null;
    let chatFrame: HTMLElement | null = null;
    let messageScroller: HTMLElement | null = null;
    let mobileNav: HTMLElement | null = null;
    let originalPosition = "";
    let originalTextareaHeight = "";
    let originalTextareaOverflow = "";
    let originalFrameHeight = "";
    let originalFrameMinHeight = "";
    let originalFrameMaxHeight = "";
    let originalNavDisplay = "";
    let baselineViewportHeight = 0;
    let resizeRaf = 0;

    const growTextarea = () => {
      if (!activeTextarea) return;
      const limit = isMobileViewport() ? 96 : 120;
      activeTextarea.style.height = "auto";
      const nextHeight = Math.min(Math.max(activeTextarea.scrollHeight, 38), limit);
      activeTextarea.style.height = `${nextHeight}px`;
      activeTextarea.style.overflowY = activeTextarea.scrollHeight > limit ? "auto" : "hidden";
    };

    const keyboardIsOpen = () => {
      if (!activeTextarea || document.activeElement !== activeTextarea || !isMobileViewport()) return false;
      const currentHeight = window.visualViewport?.height ?? window.innerHeight;
      return baselineViewportHeight > 0 && currentHeight < baselineViewportHeight - 80;
    };

    const fitChatToViewport = () => {
      if (!chatFrame || !isMobileViewport()) return;
      const viewport = window.visualViewport;
      const visibleHeight = viewport?.height ?? window.innerHeight;
      const offsetTop = viewport?.offsetTop ?? 0;
      const rect = chatFrame.getBoundingClientRect();
      const keyboardOpen = keyboardIsOpen();
      document.documentElement.dataset.aiKeyboardOpen = keyboardOpen ? "true" : "false";

      if (mobileNav) mobileNav.style.display = keyboardOpen ? "none" : originalNavDisplay;

      const topInsideViewport = Math.max(0, rect.top - offsetTop);
      const bottomReserve = keyboardOpen ? 6 : 68;
      const available = Math.floor(visibleHeight - topInsideViewport - bottomReserve);
      const minimum = keyboardOpen ? 245 : 390;
      const targetHeight = Math.max(minimum, available);

      chatFrame.style.height = `${targetHeight}px`;
      chatFrame.style.minHeight = `${Math.min(minimum, targetHeight)}px`;
      chatFrame.style.maxHeight = "none";

      if (keyboardOpen) {
        window.requestAnimationFrame(() => {
          if (messageScroller) messageScroller.scrollTop = messageScroller.scrollHeight;
        });
      }
    };

    const scheduleFit = () => {
      window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(fitChatToViewport);
    };

    const onFocus = () => {
      baselineViewportHeight = Math.max(
        baselineViewportHeight,
        window.innerHeight,
        window.visualViewport?.height ?? 0,
      );
      growTextarea();
      scheduleFit();
      window.setTimeout(scheduleFit, 80);
      window.setTimeout(scheduleFit, 220);
      window.setTimeout(scheduleFit, 420);
    };

    const onBlur = () => {
      document.documentElement.dataset.aiKeyboardOpen = "false";
      if (mobileNav) mobileNav.style.display = originalNavDisplay;
      window.setTimeout(scheduleFit, 120);
    };

    const restore = () => {
      window.cancelAnimationFrame(resizeRaf);
      if (activeTextarea) {
        activeTextarea.removeEventListener("input", growTextarea);
        activeTextarea.removeEventListener("focus", onFocus);
        activeTextarea.removeEventListener("blur", onBlur);
        activeTextarea.style.height = originalTextareaHeight;
        activeTextarea.style.overflowY = originalTextareaOverflow;
      }
      if (activeForm) activeForm.style.position = originalPosition;
      if (chatFrame) {
        chatFrame.style.height = originalFrameHeight;
        chatFrame.style.minHeight = originalFrameMinHeight;
        chatFrame.style.maxHeight = originalFrameMaxHeight;
      }
      if (mobileNav) mobileNav.style.display = originalNavDisplay;
      delete document.documentElement.dataset.aiKeyboardOpen;
      activeTextarea = null;
      activeForm = null;
      chatFrame = null;
      messageScroller = null;
      mobileNav = null;
    };

    const attach = () => {
      const nextTextarea = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea"))
        .find((item) => /AI|ИИ/i.test(item.getAttribute("aria-label") || "")) || null;
      const nextForm = nextTextarea?.closest("form") as HTMLFormElement | null;
      if (!nextTextarea || !nextForm) return;
      if (nextTextarea === activeTextarea && nextForm === activeForm) return;

      restore();
      activeTextarea = nextTextarea;
      activeForm = nextForm;
      chatFrame = nextTextarea.closest("section")?.firstElementChild as HTMLElement | null;
      messageScroller = chatFrame?.querySelector<HTMLElement>('[aria-live="polite"]') || null;
      mobileNav = findMobileNav();

      originalPosition = nextForm.style.position;
      originalTextareaHeight = nextTextarea.style.height;
      originalTextareaOverflow = nextTextarea.style.overflowY;
      originalFrameHeight = chatFrame?.style.height || "";
      originalFrameMinHeight = chatFrame?.style.minHeight || "";
      originalFrameMaxHeight = chatFrame?.style.maxHeight || "";
      originalNavDisplay = mobileNav?.style.display || "";
      baselineViewportHeight = Math.max(window.innerHeight, window.visualViewport?.height ?? 0);

      if (getComputedStyle(nextForm).position === "static") nextForm.style.position = "relative";
      const submitButton = nextForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      setMicRight(Math.max(54, (submitButton?.offsetWidth || 68) + 14));
      nextTextarea.addEventListener("input", growTextarea);
      nextTextarea.addEventListener("focus", onFocus);
      nextTextarea.addEventListener("blur", onBlur);
      growTextarea();
      scheduleFit();
      setTextarea(nextTextarea);
      setPortalTarget(nextForm);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleFit);
    window.addEventListener("orientationchange", scheduleFit);
    window.visualViewport?.addEventListener("resize", scheduleFit);
    window.visualViewport?.addEventListener("scroll", scheduleFit);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleFit);
      window.removeEventListener("orientationchange", scheduleFit);
      window.visualViewport?.removeEventListener("resize", scheduleFit);
      window.visualViewport?.removeEventListener("scroll", scheduleFit);
      restore();
    };
  }, [pathname]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function stopRecording() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  async function transcribe(blob: Blob, mimeType: string) {
    if (!textarea || blob.size < 400) {
      setError(isRu ? "Голос не записался. Попробуйте ещё раз." : "Ovoz yozilmadi. Qayta urinib ko‘ring.");
      return;
    }

    const session = getStoredSession();
    if (!session) {
      setError(isRu ? "Сессия входа завершена. Войдите снова." : "Kirish sessiyasi tugagan. Qayta kiring.");
      return;
    }

    setTranscribing(true);
    setError("");
    try {
      const form = new FormData();
      const extension = fileExtension(mimeType || blob.type);
      form.append("audio", blob, `voice-${Date.now()}.${extension}`);
      form.append("locale", isRu ? "ru" : "uz");

      const response = await fetch("/api/ai/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as { text?: string; message?: string };
      if (!response.ok || !data.text?.trim()) {
        throw new Error(data.message || (isRu ? "Не удалось распознать голос." : "Ovozni tanib bo‘lmadi."));
      }

      const spoken = data.text.trim();
      const current = textarea.value.trim();
      const next = (current ? `${current} ${spoken}` : spoken).slice(0, textarea.maxLength > 0 ? textarea.maxLength : 1500);
      setControlledTextareaValue(textarea, next);
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : (isRu ? "Ошибка голосового ввода." : "Ovozli kiritishda xatolik."));
    } finally {
      setTranscribing(false);
    }
  }

  async function startRecording() {
    if (!supported || recording || transcribing) return;
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const mimeType = supportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const actualType = recorder.mimeType || mimeType || chunksRef.current[0]?.type || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualType });
        chunksRef.current = [];
        void transcribe(blob, actualType);
      }, { once: true });

      recorder.start(250);
      setRecording(true);
      timerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_MS);
    } catch (micError) {
      const denied = micError instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(micError.name);
      setError(denied
        ? (isRu ? "Разрешите доступ к микрофону в браузере." : "Brauzerda mikrofonga ruxsat bering.")
        : (isRu ? "Не удалось включить микрофон." : "Mikrofonni yoqib bo‘lmadi."));
    }
  }

  if (!portalTarget || !textarea) return null;

  const label = !supported
    ? (isRu ? "Голосовой ввод не поддерживается этим браузером" : "Bu brauzer ovozli kiritishni qo‘llamaydi")
    : recording
      ? (isRu ? "Остановить запись" : "Yozishni to‘xtatish")
      : transcribing
        ? (isRu ? "Распознаю голос" : "Ovoz matnga aylantirilmoqda")
        : (isRu ? "Голосовой ввод" : "Ovozli kiritish");

  return createPortal(
    <>
      <button
        type="button"
        disabled={!supported || transcribing}
        onClick={() => recording ? stopRecording() : void startRecording()}
        aria-label={label}
        title={label}
        style={{ right: micRight }}
        className={`absolute bottom-[0.55rem] z-20 flex h-8 w-8 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${recording ? "border-rose-500 bg-rose-500 text-white shadow-sm shadow-rose-300 animate-pulse" : transcribing ? "border-blue-200 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"}`}
      >
        {recording ? (
          <span className="h-2.5 w-2.5 rounded-[3px] bg-current" aria-hidden="true" />
        ) : transcribing ? (
          <span className="text-sm leading-none" aria-hidden="true">···</span>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[17px] w-[17px] fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6.5a3.5 3.5 0 1 0-7 0V11a3.5 3.5 0 0 0 3.5 3.5Z" />
            <path d="M5.75 10.75a6.25 6.25 0 0 0 12.5 0M12 17v3M9.25 20h5.5" />
          </svg>
        )}
      </button>
      {(recording || transcribing || error) && (
        <div className={`absolute bottom-12 right-2 z-20 max-w-[250px] rounded-xl px-2.5 py-1.5 text-[10px] font-semibold shadow-lg ${error ? "bg-rose-600 text-white" : "bg-[#0b1f3a] text-white"}`} role={error ? "alert" : "status"}>
          {error || (recording
            ? (isRu ? "Говорите… нажмите квадрат для остановки" : "Gapiring… to‘xtatish uchun kvadratni bosing")
            : (isRu ? "Преобразую голос в текст…" : "Ovoz matnga aylantirilmoqda…"))}
        </div>
      )}
    </>,
    portalTarget,
  );
}
