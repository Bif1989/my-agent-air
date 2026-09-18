"use client";

import { useEffect } from "react";

// Legacy route: /offers now lives inside the unified /requests workspace.
export default function OffersRedirectPage() {
  useEffect(() => {
    const requestId = new URLSearchParams(window.location.search).get("request_id");
    window.location.replace(requestId ? `/requests?tab=market&request_id=${encodeURIComponent(requestId)}` : "/requests?tab=my-offers");
  }, []);
  return null;
}
