import { getStoredSession, refreshSession, sessionNeedsRefresh } from "@/lib/supabase-auth";

export const MAX_VOICE_BYTES = 4 * 1024 * 1024;
export const MAX_RECORDING_MS = 90_000;
export const VOICE_REQUEST_TIMEOUT_MS = 40_000;

export class VoiceError extends Error {
  constructor(public code: string, message = code) { super(message); }
}

export function voiceExtension(type: string) {
  if (type.includes("mp4")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  return "webm";
}

function supportedMimeType() {
  return ["audio/webm;codecs=opus", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"]
    .find(type => MediaRecorder.isTypeSupported(type)) || "";
}

// Permission requests cannot be aborted; a cancelled generation closes a late stream.
export class VoiceCapture {
  private generation = 0;
  private busy = false;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private callbacks: {
    state: (state: "starting" | "recording" | "idle") => void;
    audio: (blob: Blob) => void;
    error: (error: unknown) => void;
  }) {}

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  cancel() {
    this.generation++;
    this.clearTimer();
    const recorder = this.recorder;
    this.recorder = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    this.busy = false;
    // A browser may already have stopped the recorder after a device error.
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* Tracks are already closed. */ }
    }
  }

  stop() {
    this.clearTimer();
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
  }

  async start() {
    if (this.busy) return;
    this.busy = true;
    const generation = ++this.generation;
    this.callbacks.state("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      this.stream = stream;
      const type = supportedMimeType();
      const recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      this.recorder = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      const startedAt = Date.now();
      const fail = (error: unknown) => {
        if (generation !== this.generation) return;
        this.cancel();
        this.callbacks.state("idle");
        this.callbacks.error(error);
      };
      recorder.addEventListener("error", () => fail(new VoiceError("RECORDING_FAILED")), { once: true });
      stream.getTracks().forEach(track => track.addEventListener("ended", () => fail(new VoiceError("RECORDING_FAILED")), { once: true }));
      recorder.addEventListener("dataavailable", event => {
        if (generation !== this.generation) return;
        bytes += event.data.size;
        if (bytes > MAX_VOICE_BYTES) { fail(new VoiceError("AUDIO_TOO_LARGE")); return; }
        if (event.data.size) chunks.push(event.data);
        if (Date.now() - startedAt >= MAX_RECORDING_MS) this.stop();
      });
      recorder.addEventListener("stop", () => {
        if (generation !== this.generation) return;
        this.clearTimer();
        stream.getTracks().forEach(track => track.stop());
        this.stream = null;
        this.recorder = null;
        this.busy = false;
        this.callbacks.state("idle");
        const blob = new Blob(chunks, { type: recorder.mimeType || type || chunks[0]?.type || "audio/webm" });
        if (blob.size < 400) this.callbacks.error(new VoiceError("AUDIO_REQUIRED"));
        else this.callbacks.audio(blob);
      }, { once: true });
      recorder.start(250);
      this.callbacks.state("recording");
      this.timer = setTimeout(() => this.stop(), MAX_RECORDING_MS);
    } catch (error) {
      if (generation !== this.generation) return;
      this.cancel();
      this.callbacks.state("idle");
      this.callbacks.error(error);
    }
  }
}

export async function transcribeVoice(blob: Blob, signal: AbortSignal): Promise<string> {
  if (blob.size > MAX_VOICE_BYTES) throw new VoiceError("AUDIO_TOO_LARGE");
  if (blob.size < 400) throw new VoiceError("AUDIO_REQUIRED");
  let session = getStoredSession();
  if (!session) throw new VoiceError("UNAUTHORIZED");
  const actor = session.user.id;
  const ensureActor = () => {
    signal.throwIfAborted();
    if (getStoredSession()?.user.id !== actor) throw new VoiceError("UNAUTHORIZED");
  };
  if (sessionNeedsRefresh(session)) session = await refreshSession();
  ensureActor();
  if (!session) throw new VoiceError("UNAUTHORIZED");
  const form = new FormData();
  form.append("audio", blob, `voice-${Date.now()}.${voiceExtension(blob.type)}`);
  const send = (token: string) => fetch("/api/ai/transcribe", {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal,
  });
  let response = await send(session.access_token);
  if (response.status === 401) {
    session = await refreshSession();
    ensureActor();
    if (!session) throw new VoiceError("UNAUTHORIZED");
    response = await send(session.access_token);
  }
  const data = await response.json().catch(error => {
    signal.throwIfAborted();
    if (response.status === 413) throw new VoiceError("AUDIO_TOO_LARGE");
    throw error;
  }) as { text?: string; code?: string };
  ensureActor();
  if (!response.ok) throw new VoiceError(data.code || "TRANSCRIPTION_FAILED");
  if (!data.text?.trim()) throw new VoiceError("NO_SPEECH");
  return data.text.trim();
}
