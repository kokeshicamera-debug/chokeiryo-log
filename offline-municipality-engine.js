/* 全国市区町村・区のオフライン判定。国土数値情報（行政区域）を加工したデータを使用。 */
(function () {
  "use strict";
  function pointInRing(latitude, longitude, ring) {
    let inside = false;
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const first = ring[index];
      const last = ring[previous];
      const crosses = ((first[1] > latitude) !== (last[1] > latitude))
        && (longitude < (last[0] - first[0]) * (latitude - first[1]) / (last[1] - first[1]) + first[0]);
      if (crosses) inside = !inside;
    }
    return inside;
  }
  function pointInPolygon(latitude, longitude, polygon) {
    return polygon.length > 0 && pointInRing(latitude, longitude, polygon[0])
      && !polygon.slice(1).some(ring => pointInRing(latitude, longitude, ring));
  }
  function isInsideBounds(latitude, longitude, bounds) {
    return longitude >= bounds[0] && longitude <= bounds[2] && latitude >= bounds[1] && latitude <= bounds[3];
  }
  function locate(latitude, longitude, data) {
    if (!data || !Array.isArray(data.municipalities)) return null;
    for (const item of data.municipalities) {
      const [code, prefecture, county, municipality, ward, bounds, polygons] = item;
      if (!isInsideBounds(latitude, longitude, bounds)) continue;
      if (polygons.some(polygon => pointInPolygon(latitude, longitude, polygon))) {
        return { code, prefecture, county, municipality, ward, address: [prefecture, county, municipality, ward].filter(Boolean).join("") };
      }
    }
    return null;
  }
  async function load(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error("全国行政区域データを読み込めませんでした: " + response.status);
    return response.json();
  }
  window.OfflineMunicipalityEngine = { load, locate };
}());
