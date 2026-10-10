"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

const AiVoiceInput = dynamic(() => import("@/app/components/ai-voice-input"), {
  ssr: false,
  loading: () => null,
});

export default function AiVoiceLoader() {
  const pathname = usePathname();
  if (pathname !== "/dashboard") return null;
  return <AiVoiceInput />;
}
