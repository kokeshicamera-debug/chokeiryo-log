/*
 * 超軽量ログ Ver.1.10 開発版
 * 一度オンラインで開いたアプリ本体を端末に保管し、圏外でも起動できるようにする。
 * POTA/SOTAの判定データは、次の段階で地域別にここへ追加する。
 */
const CACHE_NAME = "cho-keiryo-log-v1-10-shell-7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./pota-boundary-engine.js",
  "./offline-municipality-engine.js",
  "./offline-jcc-engine.js",
  "./offline-town-engine.js",
  "./data/japan-municipalities-offline.json",
  "./data/jarl-jcc-jcg-index.json",
  "./data/japan-town-points.json",
  "./data/pota-boundaries-manifest.json",
  "./data/pota-boundaries-kanagawa-shizuoka.geojson"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("cho-keiryo-log-") && key !== CACHE_NAME)
          .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match("./index.html")))
  );
});
