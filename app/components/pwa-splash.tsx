"use client";

import { useEffect, useState } from "react";

function detectStandalone() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || Boolean(navigatorWithStandalone.standalone);
}

export default function PwaSplash() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const standalone = detectStandalone();
    document.documentElement.dataset.pwaStandalone = standalone ? "true" : "false";
    if (!standalone) return;

    const showTimer = window.setTimeout(() => setVisible(true), 0);
    const hideTimer = window.setTimeout(() => setVisible(false), 850);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="pwa-launch-screen fixed inset-0 z-[200] flex items-center justify-center bg-[#0b1f3a]" aria-hidden="true">
      <div className="flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-white/10 shadow-2xl ring-1 ring-white/15">
          <img src="/my-agent-air-icon.svg" alt="" className="h-20 w-20" />
        </div>
        <p className="mt-5 text-lg font-bold tracking-[0.18em] text-white">AGENT BIFAVIA</p>
        <p className="mt-1 text-[11px] font-medium tracking-[0.16em] text-cyan-200">MY AGENT AIR</p>
        <div className="mt-7 h-1 w-24 overflow-hidden rounded-full bg-white/10">
          <div className="pwa-splash-progress h-full w-1/2 rounded-full bg-cyan-300" />
        </div>
      </div>
    </div>
  );
}
