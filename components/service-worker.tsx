"use client";

import { useEffect } from "react";

/**
 * components/service-worker.tsx · Registers the service worker (public/sw.js)
 *
 * public/sw.js shows the light offline page when there's no connection.
 * Production only: in development a service worker would get in the way of
 * hot reload. Renders nothing.
 *
 *   app/layout.tsx → <ServiceWorker> → navigator.serviceWorker.register("/sw.js")
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => console.error("[sw] registration failed", err));
  }, []);
  return null;
}
