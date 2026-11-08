// Crossbill service worker: shows a light offline page when a page can't load.
// It caches nothing else. Every request still goes to the network first, so
// invoices, payments and rates are always live.
const CACHE = "crossbill-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // only full page loads
  event.respondWith(
    fetch(event.request).catch(() => caches.open(CACHE).then((cache) => cache.match(OFFLINE_URL))),
  );
});
