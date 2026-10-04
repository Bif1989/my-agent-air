"use client";

import { useEffect } from "react";

// Supabase can fall back to its configured Site URL if an email redirect is not allowlisted.
export default function RecoveryRedirect() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.slice(1));
    const isRecovery = hash.get("type") === "recovery" || (url.searchParams.get("type") === "recovery" && url.searchParams.has("token_hash"));
    if (isRecovery && url.pathname !== "/reset-password") window.location.replace(`/reset-password${url.search}${url.hash}`);
  }, []);
  return null;
}
