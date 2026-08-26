// Offline shell only.
//
// This caches the page itself so opening Adelaide without a signal shows the
// app rather than a browser error. It does not cache anything from Supabase
// and it does not sync in the background — the promise that nothing runs when
// nobody is looking holds here too.
//
// Bump CACHE when any file in SHELL changes, or browsers will keep the old one.

const CACHE = "adelaide-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./app.webmanifest",
  "./web/app.css",
  "./web/app.js",
  "./extension/icon.svg",
  "./extension/config.js",
  "./extension/lib/auth.js",
  "./extension/lib/db.js",
  "./extension/lib/format.js",
  "./extension/lib/platform.js",
];

self.addEventListener("install", (e) => {
  // A single missing file must not fail the whole install.
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Anything that isn't this site's own shell — Supabase, auction photos,
  // Google — goes straight to the network, uncached.
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Fresh when there is a network, cached when there isn't. The other way
  // round would mean editing a file and not seeing the change.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("./index.html")))
  );
});
