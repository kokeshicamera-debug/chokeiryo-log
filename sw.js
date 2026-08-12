importScripts("./data/pota-boundaries-national-files.js");
importScripts("./data/pota-boundaries-urban-files.js");
importScripts("./data/pota-boundaries-osm-files.js");

/*
 * 超軽量ログ Ver.1.10 開発版
 * 一度オンラインで開いたアプリ本体を端末に保管し、圏外でも起動できるようにする。
 * POTA/SOTAの判定データは、次の段階で地域別にここへ追加する。
 */
const CACHE_NAME = "cho-keiryo-log-v1-10-shell-33";
const APP_SHELL = [
  "./",
  "./index.html",
  "./guide.html",
  "./about.html",
  "./public-notes.html",
  "./manifest.webmanifest",
  "./pota-boundary-engine.js",
  "./sota-activation-engine.js",
  "./gsi-elevation-provider.js",
  "./sota-terrain-connectivity.js",
  "./sota-runtime-controller.js",
  "./gps-position-controller.js",
  "./offline-municipality-engine.js",
  "./offline-jcc-engine.js",
  "./offline-town-engine.js",
  "./data/japan-municipalities-offline.json",
  "./data/jarl-jcc-jcg-index.json",
  "./data/japan-town-points.json",
  "./data/pota-boundaries-manifest.json",
  "./data/sota-japan-official-summits.json",
  "./data/pota-boundaries-national-index.json",
  "./data/pota-boundaries-national-files.js",
  "./data/pota-boundaries-urban-index.json",
  "./data/pota-boundaries-urban-files.js",
  "./data/pota-boundaries-osm-index.json",
  "./data/pota-boundaries-osm-files.js",
  "./data/pota-boundaries-kanagawa-shizuoka.geojson",
  "./data/pota-boundaries-ibaraki.geojson",
  "./data/pota-boundaries-aomori.geojson",
  "./data/pota-boundaries-iwate.geojson",
  "./data/pota-boundaries-fukui.geojson",
  "./data/pota-boundaries-shimane.geojson",
  "./data/pota-boundaries-okayama.geojson",
  "./data/pota-boundaries-niigata.geojson",
  "./data/pota-boundaries-mie.geojson",
  "./data/pota-boundaries-wakayama.geojson",
  "./data/pota-boundaries-miyazaki.geojson",
  "./data/pota-boundaries-yamaguchi.geojson",
  "./data/pota-boundaries-tokushima.geojson",
  "./data/pota-boundaries-okinawa.geojson",
  "./data/pota-boundaries-aichi.geojson",
  "./data/pota-boundaries-kyoto.geojson",
  "./data/pota-boundaries-yamagata.geojson",
  "./data/pota-boundaries-yamanashi.geojson",
  "./data/pota-boundaries-nagano.geojson",
  "./data/pota-boundaries-chiba.geojson",
  "./data/pota-boundaries-osaka.geojson",
  "./data/pota-boundaries-hyogo.geojson",
  "./data/pota-boundaries-ishikawa.geojson",
  "./data/pota-boundaries-saitama.geojson",
  "./data/pota-boundaries-tochigi.geojson",
  "./data/pota-boundaries-gifu.geojson",
  "./data/pota-boundaries-nara.geojson",
  "./data/pota-boundaries-hiroshima.geojson",
  "./data/pota-boundaries-kagawa.geojson",
  "./data/pota-boundaries-kagoshima.geojson",
  "./data/pota-boundaries-kanagawa.geojson",
  "./data/pota-boundaries-fukushima.geojson",
  "./data/pota-boundaries-tokyo.geojson",
  "./data/pota-boundaries-hokkaido.geojson",
  "./data/pota-boundaries-toyama.geojson",
  "./data/pota-boundaries-gunma.geojson",
  "./data/pota-boundaries-shiga.geojson",
  "./data/pota-boundaries-akita.geojson",
  "./data/pota-boundaries-saitama-additional.geojson",
  "./data/pota-boundaries-niigata-additional.geojson",
  "./data/pota-boundaries-kumamoto.geojson",
  "./data/pota-boundaries-miyagi-additional.geojson",
  "./data/pota-boundaries-fukuoka.geojson",
  "./data/pota-boundaries-kochi.geojson",
  "./data/pota-boundaries-hyogo-additional.geojson",
  "./data/pota-boundaries-oita.geojson",
  "./data/pota-boundaries-ibaraki-additional.geojson",
  "./data/pota-boundaries-tochigi-additional.geojson",
  "./data/pota-boundaries-ishikawa-additional.geojson",
  "./data/pota-boundaries-national-parks-additional.geojson"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    await cache.addAll(APP_SHELL);
    for (const file of self.NATIONAL_POTA_CANDIDATE_FILES || []) {
      try { await cache.add(file); } catch (error) { console.warn("全国POTA候補の保存に失敗", file, error); }
    }
    for (const file of self.NATIONAL_POTA_URBAN_CANDIDATE_FILES || []) {
      try { await cache.add(file); } catch (error) { console.warn("都市公園POTA候補の保存に失敗", file, error); }
    }
    for (const file of self.NATIONAL_POTA_OSM_CANDIDATE_FILES || []) {
      try { await cache.add(file); } catch (error) { console.warn("OpenStreetMap由来POTA候補の保存に失敗", file, error); }
    }
  }));
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
