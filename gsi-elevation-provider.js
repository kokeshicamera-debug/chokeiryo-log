(function () {
  "use strict";

  const CACHE_NAME = "chokeiryo-sota-gsi-dem-v1";
  const CACHE_LIMIT = 128;
  const MEMORY_TILE_LIMIT = 24;
  const TILE_SIZE = 256;
  const memoryTiles = new Map();
  const SOURCES = [
    { id: "DEM1A", template: "https://cyberjapandata.gsi.go.jp/xyz/dem1a_png/{z}/{x}/{y}.png", zoom: 17, uncertaintyMeters: 1 },
    { id: "DEM5A", template: "https://cyberjapandata.gsi.go.jp/xyz/dem5a_png/{z}/{x}/{y}.png", zoom: 15, uncertaintyMeters: 1 },
    { id: "DEM5B", template: "https://cyberjapandata.gsi.go.jp/xyz/dem5b_png/{z}/{x}/{y}.png", zoom: 15, uncertaintyMeters: 2 },
    { id: "DEM5C", template: "https://cyberjapandata.gsi.go.jp/xyz/dem5c_png/{z}/{x}/{y}.png", zoom: 15, uncertaintyMeters: 2 },
    { id: "DEM10B", template: "https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png", zoom: 14, uncertaintyMeters: 5 },
  ];

  function tilePosition(latitude, longitude, zoom) {
    const scale = 2 ** zoom;
    const latitudeRadians = Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 180;
    const worldX = (longitude + 180) / 360 * scale;
    const worldY = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale;
    const tileX = Math.floor(worldX);
    const tileY = Math.floor(worldY);
    return {
      zoom,
      tileX,
      tileY,
      pixelX: Math.max(0, Math.min(255, Math.floor((worldX - tileX) * TILE_SIZE))),
      pixelY: Math.max(0, Math.min(255, Math.floor((worldY - tileY) * TILE_SIZE))),
    };
  }

  function decodeElevationRgb(red, green, blue) {
    const value = 65536 * red + 256 * green + blue;
    if (value === 8388608) return null;
    return (value < 8388608 ? value : value - 16777216) * 0.01;
  }

  function tileUrl(source, position) {
    return source.template.replace("{z}", position.zoom).replace("{x}", position.tileX).replace("{y}", position.tileY);
  }

  async function trimCache(cache) {
    const keys = await cache.keys();
    const excess = keys.length - CACHE_LIMIT;
    for (let index = 0; index < excess; index += 1) await cache.delete(keys[index]);
  }

  async function fetchTile(url) {
    const cache = "caches" in window ? await caches.open(CACHE_NAME) : null;
    const cached = cache && await cache.match(url);
    if (cached) return { response: cached, cached: true };
    const response = await fetch(url, { mode: "cors", cache: "no-cache" });
    if (!response.ok) throw new Error(`標高タイルを取得できませんでした: ${response.status}`);
    if (cache) {
      await cache.put(url, response.clone());
      await trimCache(cache);
    }
    return { response, cached: false };
  }

  async function pixelFromResponse(response, pixelX, pixelY) {
    const bitmap = await createImageBitmap(await response.blob());
    const canvas = "OffscreenCanvas" in window ? new OffscreenCanvas(TILE_SIZE, TILE_SIZE) : document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    if (typeof bitmap.close === "function") bitmap.close();
    return context.getImageData(pixelX, pixelY, 1, 1).data;
  }

  async function loadTilePixels(url) {
    if (memoryTiles.has(url)) return memoryTiles.get(url);
    const promise = (async () => {
      const tile = await fetchTile(url);
      const bitmap = await createImageBitmap(await tile.response.blob());
      const canvas = "OffscreenCanvas" in window ? new OffscreenCanvas(TILE_SIZE, TILE_SIZE) : document.createElement("canvas");
      canvas.width = TILE_SIZE;
      canvas.height = TILE_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(bitmap, 0, 0);
      if (typeof bitmap.close === "function") bitmap.close();
      return { pixels: context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data, cached: tile.cached };
    })();
    memoryTiles.set(url, promise);
    while (memoryTiles.size > MEMORY_TILE_LIMIT) memoryTiles.delete(memoryTiles.keys().next().value);
    return promise;
  }

  function elevationFromPixels(pixels, pixelX, pixelY) {
    const offset = (pixelY * TILE_SIZE + pixelX) * 4;
    return decodeElevationRgb(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
  }

  async function getElevation(latitude, longitude) {
    const attempts = [];
    for (const source of SOURCES) {
      const position = tilePosition(latitude, longitude, source.zoom);
      const url = tileUrl(source, position);
      try {
        const tile = await loadTilePixels(url);
        const elevationMeters = elevationFromPixels(tile.pixels, position.pixelX, position.pixelY);
        attempts.push({ source: source.id, cached: tile.cached, available: elevationMeters !== null });
        if (elevationMeters !== null) return { latitude, longitude, elevationMeters, elevationUncertaintyMeters: source.uncertaintyMeters, source: source.id, zoom: source.zoom, cached: tile.cached, tile: position, url, attempts };
      } catch (error) {
        attempts.push({ source: source.id, available: false, error: String(error?.message || error) });
      }
    }
    const error = new Error("この場所の地形標高を取得できませんでした");
    error.attempts = attempts;
    throw error;
  }

  async function getElevations(points, options = {}) {
    const results = new Array(points.length);
    const concurrency = Math.max(1, Math.min(16, Number(options.concurrency) || 8));
    let cursor = 0;
    async function worker() {
      while (cursor < points.length) {
        const index = cursor++;
        const point = points[index];
        try {
          results[index] = await getElevation(point.latitude, point.longitude);
        } catch (error) {
          results[index] = { latitude: point.latitude, longitude: point.longitude, elevationMeters: null, error: String(error?.message || error) };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, points.length) }, worker));
    return results;
  }

  window.GsiElevationProvider = { getElevation, getElevations, tilePosition, decodeElevationRgb, tileUrl, SOURCES, CACHE_NAME, CACHE_LIMIT, MEMORY_TILE_LIMIT };
}());
