import { NextRequest, NextResponse } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-config";

export const runtime = "nodejs";
export const maxDuration = 30;

const OPENAI_TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

async function verifyUser(request: NextRequest, signal: AbortSignal) {
  const authorization = request.headers.get("authorization") || "";
  if (!/^Bearer \S+$/.test(authorization) || authorization.length > 4096) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: authorization },
    cache: "no-store",
    signal,
  });
  if (!response.ok) return null;
  const user = (await response.json().catch(() => null)) as { id?: string; is_anonymous?: boolean } | null;
  return user?.id && !user.is_anonymous ? user : null;
}

function safeAudioType(type: string) {
  const value = type.toLowerCase();
  return value.startsWith("audio/") || value === "video/webm" || value === "application/octet-stream";
}

export async function POST(request: NextRequest) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
  try {
    const user = await verifyUser(request, signal);
    if (!user) {
      return NextResponse.json({ code: "UNAUTHORIZED", message: "Kirish sessiyasi yaroqsiz." }, { status: 401 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ code: "AI_NOT_CONFIGURED", message: "Ovozli AI xizmati hali ulanmagan." }, { status: 503 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_AUDIO_BYTES + 256_000) {
      return NextResponse.json({ code: "AUDIO_TOO_LARGE", message: "Ovozli xabar juda katta." }, { status: 413 });
    }

    const body = await request.formData();
    const audio = body.get("audio");
    if (!(audio instanceof File) || audio.size < 400) {
      return NextResponse.json({ code: "AUDIO_REQUIRED", message: "Ovoz yozuvi topilmadi." }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ code: "AUDIO_TOO_LARGE", message: "Ovozli xabar juda katta." }, { status: 413 });
    }
    if (audio.type && !safeAudioType(audio.type)) {
      return NextResponse.json({ code: "AUDIO_FORMAT", message: "Ovoz formati qo‘llab-quvvatlanmadi." }, { status: 415 });
    }

    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "voice.webm");
    upstream.append("model", process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
    upstream.append("response_format", "json");

    const response = await fetch(OPENAI_TRANSCRIPTIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstream,
      signal,
    });
    const data = (await response.json().catch(() => ({}))) as { text?: string; error?: { message?: string } };
    if (!response.ok) {
      console.error("AI transcription failed", response.status, data.error?.message || "unknown_error");
      return NextResponse.json({ code: "TRANSCRIPTION_FAILED", message: "Ovozni matnga aylantirib bo‘lmadi. Qayta urinib ko‘ring." }, { status: 502 });
    }

    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (!text) {
      return NextResponse.json({ code: "NO_SPEECH", message: "Ovozdan matn aniqlanmadi. Aniqroq gapirib qayta urinib ko‘ring." }, { status: 422 });
    }

    return NextResponse.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return NextResponse.json({ code: "TRANSCRIPTION_TIMEOUT", message: "Ovozni qayta ishlash vaqti tugadi. Qisqaroq yozuv bilan qayta urinib ko‘ring." }, { status: 504 });
    }
    return NextResponse.json({ code: "TRANSCRIPTION_FAILED", message: "Ovozli kiritishda vaqtinchalik xatolik." }, { status: 503 });
  }
}
