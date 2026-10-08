"use client";

import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AUTH_SESSION_CHANGED_EVENT, getStoredSession } from "@/lib/supabase-auth";
import { VoiceCapture, VoiceError, transcribeVoice, VOICE_REQUEST_TIMEOUT_MS } from "@/lib/ai-voice";
import { useUiSettings } from "@/lib/ui-settings";

const MOBILE_BREAKPOINT = 768;

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
  const [starting, setStarting] = useState(false);
  const captureRef = useRef<VoiceCapture | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  function cancelVoice() {
    generationRef.current++;
    captureRef.current?.cancel();
    captureRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
  }

  function voiceMessage(error: unknown) {
    const code = error instanceof VoiceError ? error.code
      : error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name) ? "MIC_DENIED"
      : error instanceof DOMException && error.name === "TimeoutError" ? "TRANSCRIPTION_TIMEOUT" : "TRANSCRIPTION_FAILED";
    const messages: Record<string, [string, string]> = {
      MIC_DENIED: ["Brauzerda mikrofonga ruxsat bering.", "Разрешите доступ к микрофону в браузере."],
      AUDIO_REQUIRED: ["Ovoz yozilmadi. Qayta urinib ko‘ring.", "Голос не записался. Попробуйте ещё раз."],
      AUDIO_TOO_LARGE: ["Ovoz 4 MB dan oshdi. Qisqaroq yozing.", "Запись превышает 4 МБ. Запишите короче."],
      UNAUTHORIZED: ["Kirish sessiyasi tugagan. Qayta kiring.", "Сессия завершена. Войдите снова."],
      AI_NOT_CONFIGURED: ["Ovozli AI xizmati hali ulanmagan.", "Сервис голосового AI ещё не подключён."],
      TRANSCRIPTION_TIMEOUT: ["Vaqt tugadi. Internetni tekshirib, qisqaroq yozing.", "Время ожидания истекло. Проверьте интернет и запишите короче."],
      NO_SPEECH: ["Nutq aniqlanmadi. Aniqroq gapiring.", "Речь не распознана. Говорите чётче."],
      AUDIO_FORMAT: ["Ovoz formati qo‘llanmaydi.", "Формат аудио не поддерживается."],
      TOO_FAST: ["Keyingi ovozli so‘rov uchun 30 soniya kuting.", "Подождите 30 секунд перед следующим голосовым запросом."],
      USER_LIMIT: ["Bugungi ovozli so‘rov limitingiz tugadi.", "Ваш дневной лимит голосовых запросов исчерпан."],
      GLOBAL_LIMIT: ["Bugungi ovozli AI limiti tugadi.", "Дневной лимит голосового AI исчерпан."],
      ACCOUNT_INACTIVE: ["Hisob faol emas. Administrator bilan bog‘laning.", "Аккаунт неактивен. Свяжитесь с администратором."],
    };
    return messages[code]?.[isRu ? 1 : 0] || (isRu ? "Ошибка голосового ввода. Попробуйте ещё раз." : "Ovozli kiritishda xatolik. Qayta urinib ko‘ring.");
  }

  const supported = typeof window !== "undefined"
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && typeof MediaRecorder !== "undefined";

  useEffect(() => {
    if (pathname !== "/dashboard") {
      const resetTimer = window.setTimeout(() => {
        setPortalTarget(null);
        setTextarea(null);
        setStarting(false);
        setRecording(false);
        setTranscribing(false);
        setError("");
      }, 0);
      delete document.documentElement.dataset.aiKeyboardOpen;
      return () => window.clearTimeout(resetTimer);
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
    const fitTimers = new Set<number>();
    const fitLater = (delay: number) => {
      const timer = window.setTimeout(() => { fitTimers.delete(timer); scheduleFit(); }, delay);
      fitTimers.add(timer);
    };

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
      fitLater(80);
      fitLater(220);
      fitLater(420);
    };

    const onBlur = () => {
      document.documentElement.dataset.aiKeyboardOpen = "false";
      if (mobileNav) mobileNav.style.display = originalNavDisplay;
      fitLater(120);
    };

    const restore = () => {
      window.cancelAnimationFrame(resizeRaf);
      fitTimers.forEach(timer => window.clearTimeout(timer));
      fitTimers.clear();
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
      if (!nextTextarea || !nextForm) {
        if (activeTextarea) {
          cancelVoice();
          restore();
          setTextarea(null);
          setPortalTarget(null);
          setRecording(false);
          setStarting(false);
          setTranscribing(false);
        }
        return;
      }
      if (nextTextarea === activeTextarea && nextForm === activeForm) return;

      if (activeTextarea) cancelVoice();
      setStarting(false);
      setRecording(false);
      setTranscribing(false);
      setError("");
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

  useEffect(() => {
    let actor = getStoredSession()?.user.id;
    const reset = () => {
      cancelVoice();
      setRecording(false);
      setStarting(false);
      setTranscribing(false);
      setError("");
    };
    const onVisibility = () => { if (document.hidden) reset(); };
    const onSession = () => {
      const nextActor = getStoredSession()?.user.id;
      if (nextActor !== actor) reset();
      actor = nextActor;
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", reset);
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
    window.addEventListener("storage", onSession);
    return () => {
      cancelVoice();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", reset);
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onSession);
      window.removeEventListener("storage", onSession);
    };
  }, [pathname, textarea]);

  async function transcribe(blob: Blob, generation: number, target: HTMLTextAreaElement) {
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), VOICE_REQUEST_TIMEOUT_MS);
    setTranscribing(true);
    setError("");
    try {
      // Race also bounds a pending token refresh or a stalled response body.
      const aborted = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
      });
      const spoken = await Promise.race([transcribeVoice(blob, controller.signal), aborted]);
      if (generation !== generationRef.current || !target.isConnected) return;
      const current = target.value.trim();
      const next = (current ? `${current} ${spoken}` : spoken).slice(0, target.maxLength > 0 ? target.maxLength : 1500);
      setControlledTextareaValue(target, next);
    } catch (error) {
      if (generation === generationRef.current) setError(voiceMessage(error));
    } finally {
      window.clearTimeout(timeout);
      if (generation === generationRef.current) {
        requestRef.current = null;
        setTranscribing(false);
      }
    }
  }

  function startRecording() {
    if (!supported || recording || transcribing || !textarea || requestRef.current) return;
    const generation = generationRef.current;
    const target = textarea;
    setError("");
    if (!captureRef.current) captureRef.current = new VoiceCapture({
      state: state => {
        if (generation !== generationRef.current) return;
        setStarting(state === "starting");
        setRecording(state === "recording");
      },
      audio: blob => {
        if (generation === generationRef.current && target.isConnected) void transcribe(blob, generation, target);
      },
      error: error => { if (generation === generationRef.current) setError(voiceMessage(error)); },
    });
    void captureRef.current.start();
  }

  if (pathname !== "/dashboard" || !portalTarget || !textarea) return null;

  const label = !supported
    ? (isRu ? "Голосовой ввод не поддерживается этим браузером" : "Bu brauzer ovozli kiritishni qo‘llamaydi")
    : starting
      ? (isRu ? "Ожидаю разрешение микрофона" : "Mikrofon ruxsati kutilmoqda")
      : recording
      ? (isRu ? "Остановить запись" : "Yozishni to‘xtatish")
      : transcribing
        ? (isRu ? "Распознаю голос" : "Ovoz matnga aylantirilmoqda")
        : (isRu ? "Голосовой ввод" : "Ovozli kiritish");

  return createPortal(
    <>
      <button
        type="button"
        disabled={!supported || transcribing || starting}
        onClick={() => recording ? captureRef.current?.stop() : startRecording()}
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
      {(starting || recording || transcribing || error) && (
        <div className={`absolute bottom-12 right-2 z-20 max-w-[250px] rounded-xl px-2.5 py-1.5 text-[10px] font-semibold shadow-lg ${error ? "bg-rose-600 text-white" : "bg-[#0b1f3a] text-white"}`} role={error ? "alert" : "status"}>
          {error || (starting
            ? (isRu ? "Разрешите доступ к микрофону…" : "Mikrofonga ruxsat bering…")
            : recording
            ? (isRu ? "Говорите… нажмите квадрат для остановки" : "Gapiring… to‘xtatish uchun kvadratni bosing")
            : (isRu ? "Преобразую голос в текст…" : "Ovoz matnga aylantirilmoqda…"))}
        </div>
      )}
    </>,
    portalTarget,
  );
}
