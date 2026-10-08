"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export default function TurnstileChallenge({
  action,
  onToken,
  resetNonce = 0,
}: {
  action: string;
  onToken: (token: string) => void;
  resetNonce?: number;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !scriptReady || !host.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(host.current, {
      sitekey: TURNSTILE_SITE_KEY,
      action,
      theme: "auto",
      callback: (token: unknown) => onToken(typeof token === "string" ? token : ""),
      "expired-callback": () => onToken(""),
      "timeout-callback": () => onToken(""),
      "error-callback": () => { onToken(""); return true; },
    });
    return () => {
      if (widgetId.current && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* widget already removed */ }
      }
      widgetId.current = null;
      onToken("");
    };
  }, [action, onToken, scriptReady]);

  useEffect(() => {
    if (!resetNonce || !widgetId.current || !window.turnstile) return;
    try { window.turnstile.reset(widgetId.current); } catch { /* challenge will be recreated on navigation */ }
    onToken("");
  }, [onToken, resetNonce]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
    <div className="min-h-[65px]" ref={host} aria-label="Xavfsizlik tekshiruvi" />
  </>;
}
