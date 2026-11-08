"use client";

import { useEffect } from "react";

/** Registers /sw.js (production only), which shows the light offline page when there's no connection. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("[sw] registration failed", err));
  }, []);
  return null;
}
