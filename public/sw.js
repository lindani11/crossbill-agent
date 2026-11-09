// public/sw.js · Crossbill's service worker
//
// Shows a light offline page when a page can't load. It caches nothing else:
// every request still goes to the network first, so invoices, payments and
// rates are always live.
//
//   install  → cache /offline.html
//   activate → delete older caches, take control of open tabs
//   fetch    → page loads: network first, the offline page if that fails

// Change the version to replace the cached offline page on the next visit.
const CACHE = "crossbill-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  // { cache: "reload" } skips the HTTP cache, so the newest offline page is stored.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  // Take over without waiting for tabs on the old version to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    // Remove other versions' caches, then control the pages that are already open.
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  // API calls, scripts and images go to the network as usual, untouched.
  if (event.request.mode !== "navigate") return; // only full page loads
  event.respondWith(
    fetch(event.request).catch(() => caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL))),
  );
});
