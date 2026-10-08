import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const TRANSCRIPTION_KEYWORDS = [
  "Toshkent", "Samarqand", "Buxoro", "Xiva", "Namangan", "Chust", "Zomin",
  "aviabilet", "mehmonxona", "turagent", "turoperator", "transfer", "gid",
  "Uzbekistan Airways", "Centrum Air", "Qanot Sharq", "Air Arabia",
];
class VoiceRouteError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
function reply(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function verifyUser(request: NextRequest, signal: AbortSignal) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization) || authorization.length > 4096) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization }, cache: "no-store", signal,
  });
  if ([401, 403].includes(response.status)) return null;
  if (!response.ok) throw new Error("Auth unavailable");
  const user = await response.json() as { id?: string; is_anonymous?: boolean };
  return user?.id && !user.is_anonymous ? user : null;
}

// Enforce the bound even for chunked requests with no Content-Length.
async function readAudio(request: NextRequest, signal: AbortSignal) {
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) {
    throw new VoiceRouteError("AUDIO_TOO_LARGE", 413, "Ovoz 4 MB dan oshmasligi kerak.");
  }
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data\s*;/i.test(contentType) || !request.body) {
    throw new VoiceRouteError("AUDIO_REQUIRED", 400, "Ovoz yozuvi topilmadi.");
  }
  const reader = request.body.getReader();
  const abort = () => { void reader.cancel(signal.reason).catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new VoiceRouteError("AUDIO_TOO_LARGE", 413, "Ovoz 4 MB dan oshmasligi kerak.");
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks), { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new VoiceRouteError("AUDIO_REQUIRED", 400, "Ovoz yozuvi topilmadi.");
  }
  signal.throwIfAborted();
  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size < 400) throw new VoiceRouteError("AUDIO_REQUIRED", 400, "Ovoz yozuvi topilmadi.");
  if (audio.size > MAX_AUDIO_BYTES) throw new VoiceRouteError("AUDIO_TOO_LARGE", 413, "Ovoz 4 MB dan oshmasligi kerak.");
  const mime = audio.type.toLowerCase().split(";")[0].trim();
  const extensions: Record<string, string> = {
    "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a",
    "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3",
    "audio/mp3": "mp3", "audio/flac": "flac", "audio/x-flac": "flac", "audio/mpga": "mpga",
  };
  const extension = extensions[mime];
  if (!extension) throw new VoiceRouteError("AUDIO_FORMAT", 415, "Ovoz formati qo‘llab-quvvatlanmadi.");
  return { audio, extension };
}

async function handlePost(request: NextRequest, signal: AbortSignal) {
  if (!await verifyUser(request, signal)) return reply("UNAUTHORIZED", "Kirish sessiyasi yaroqsiz.", 401);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return reply("AI_NOT_CONFIGURED", "Ovozli AI xizmati hali ulanmagan.", 503);
  const { audio, extension } = await readAudio(request, signal);

  signal.throwIfAborted();
  // Persistent, separate voice allowance; a missing migration fails closed.
  const quota = await fetch(`${SUPABASE_URL}/rest/v1/rpc/consume_ai_voice_quota`, {
    method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: request.headers.get("authorization")!, "Content-Type": "application/json" },
    body: "{}", cache: "no-store", signal,
  });
  if (!quota.ok) return reply("AI_UNAVAILABLE", "Ovozli AI vaqtincha ishlamayapti.", 503);
  const allowance = await quota.json();
  if (allowance.allowed !== true) {
    const code = ["USER_LIMIT", "GLOBAL_LIMIT", "TOO_FAST", "ACCOUNT_INACTIVE"].includes(allowance.code) ? allowance.code : "AI_UNAVAILABLE";
    const response = reply(code, "Ovozli AI cheklovi. Keyinroq urinib ko‘ring.", code === "ACCOUNT_INACTIVE" ? 403 : code === "AI_UNAVAILABLE" ? 503 : 429);
    if (code === "TOO_FAST") response.headers.set("Retry-After", "30");
    return response;
  }
  signal.throwIfAborted();
  const upstream = new FormData();
  upstream.append("file", audio, `voice.${extension}`);

  // gpt-transcribe handles Uzbek/Russian mixed speech better when expected languages
  // and a small domain vocabulary are supplied. Keep an explicit env override for
  // future model changes, but transparently upgrade the old mini default.
  const configuredModel = process.env.OPENAI_TRANSCRIBE_MODEL?.trim();
  const model = !configuredModel || configuredModel === "gpt-4o-mini-transcribe" ? "gpt-transcribe" : configuredModel;
  upstream.append("model", model);
  upstream.append("response_format", "json");
  upstream.append("temperature", "0");

  if (model === "gpt-transcribe") {
    upstream.append("languages[]", "uz");
    upstream.append("languages[]", "ru");
    upstream.append("chunking_strategy", "auto");
    TRANSCRIPTION_KEYWORDS.forEach(keyword => upstream.append("keywords[]", keyword));
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: upstream, signal,
  });
  // Do not swallow an abort while reading the upstream response body.
  const data = await response.json() as { text?: string };
  signal.throwIfAborted();
  if (!response.ok) {
    console.error("AI transcription failed", response.status);
    if ([401, 403].includes(response.status)) return reply("AI_NOT_CONFIGURED", "Ovozli AI sozlamalarini tekshirish kerak.", 503);
    return reply("TRANSCRIPTION_FAILED", "Ovozni matnga aylantirib bo‘lmadi. Qayta urinib ko‘ring.", 502);
  }
  const text = typeof data.text === "string" ? data.text.trim() : "";
  if (!text) return reply("NO_SPEECH", "Ovozdan matn aniqlanmadi. Aniqroq gapiring.", 422);
  return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timeout", "TimeoutError")), 25_000);
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
    return await Promise.race([handlePost(request, signal), aborted]);
  } catch (error) {
    if (controller.signal.aborted) return reply("TRANSCRIPTION_TIMEOUT", "Ovozni qayta ishlash vaqti tugadi. Qisqaroq yozing.", 504);
    if (request.signal.aborted) return reply("REQUEST_CANCELLED", "Ovozli so‘rov bekor qilindi.", 499);
    if (error instanceof VoiceRouteError) return reply(error.code, error.message, error.status);
    return reply("TRANSCRIPTION_FAILED", "Ovozli kiritishda vaqtinchalik xatolik.", 503);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
