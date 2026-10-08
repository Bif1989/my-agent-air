"use client";

import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getStoredSession } from "@/lib/supabase-auth";
import { useUiSettings } from "@/lib/ui-settings";

const MAX_RECORDING_MS = 90_000;

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

export default function AiVoiceInput() {
  const pathname = usePathname();
  const { isRu } = useUiSettings();
  const [portalTarget, setPortalTarget] = useState<HTMLFormElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
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
      return;
    }

    let activeTextarea: HTMLTextAreaElement | null = null;
    let activeForm: HTMLFormElement | null = null;
    let originalPaddingRight = "";
    let originalPosition = "";

    const restore = () => {
      if (activeTextarea) activeTextarea.style.paddingRight = originalPaddingRight;
      if (activeForm) activeForm.style.position = originalPosition;
      activeTextarea = null;
      activeForm = null;
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
      originalPaddingRight = nextTextarea.style.paddingRight;
      originalPosition = nextForm.style.position;
      nextTextarea.style.paddingRight = "3.6rem";
      if (getComputedStyle(nextForm).position === "static") nextForm.style.position = "relative";
      setTextarea(nextTextarea);
      setPortalTarget(nextForm);
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
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
        className={`absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-xl border text-base shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${recording ? "border-rose-300 bg-rose-500 text-white animate-pulse" : transcribing ? "border-blue-200 bg-blue-50 text-blue-600" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
      >
        {recording ? "■" : transcribing ? "…" : "🎤"}
      </button>
      {(recording || transcribing || error) && (
        <div className={`absolute right-2 top-12 z-20 max-w-[260px] rounded-lg px-2.5 py-1.5 text-[10px] font-semibold shadow-lg ${error ? "bg-rose-600 text-white" : "bg-[#0b1f3a] text-white"}`} role={error ? "alert" : "status"}>
          {error || (recording
            ? (isRu ? "Говорите… Нажмите ■ для остановки" : "Gapiring… To‘xtatish uchun ■ ni bosing")
            : (isRu ? "Преобразую голос в текст…" : "Ovoz matnga aylantirilmoqda…"))}
        </div>
      )}
    </>,
    portalTarget,
  );
}
