/*
 * 超軽量ログ Ver.1.10
 * 公園の代表点との距離ではなく、GPS位置が公園境界ポリゴンの内側かを調べる部品。
 */
(function () {
  "use strict";
  function pointInRing(latitude, longitude, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const crosses = ((yi > latitude) !== (yj > latitude)) &&
        (longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi);
      if (crosses) inside = !inside;
    }
    return inside;
  }
  function pointInPolygon(latitude, longitude, rings) {
    if (!rings || !rings.length || !pointInRing(latitude, longitude, rings[0])) return false;
    return !rings.slice(1).some(hole => pointInRing(latitude, longitude, hole));
  }
  function pointInGeometry(latitude, longitude, geometry) {
    if (!geometry) return false;
    if (geometry.type === "Polygon") return pointInPolygon(latitude, longitude, geometry.coordinates);
    if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygon => pointInPolygon(latitude, longitude, polygon));
    return false;
  }
  function metersFromPointToSegment(latitude, longitude, start, end) {
    const longitudeScale = 111320 * Math.cos(latitude * Math.PI / 180);
    const pointX = longitude * longitudeScale, pointY = latitude * 110540;
    const startX = start[0] * longitudeScale, startY = start[1] * 110540;
    const endX = end[0] * longitudeScale, endY = end[1] * 110540;
    const dx = endX - startX, dy = endY - startY;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared)) : 0;
    return Math.hypot(pointX - (startX + ratio * dx), pointY - (startY + ratio * dy));
  }
  function distanceToRing(latitude, longitude, ring) {
    let minimum = Infinity;
    for (let i = 0; i < ring.length - 1; i++) minimum = Math.min(minimum, metersFromPointToSegment(latitude, longitude, ring[i], ring[i + 1]));
    return minimum;
  }
  function distanceToGeometryBoundary(latitude, longitude, geometry) {
    if (!geometry) return Infinity;
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    return polygons.reduce((minimum, polygon) => Math.min(minimum, ...polygon.map(ring => distanceToRing(latitude, longitude, ring))), Infinity);
  }
  async function load(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error("境界データを読み込めませんでした: " + response.status);
    const data = await response.json();
    if (!data || data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("境界データの形式が正しくありません。");
    return data;
  }
  function findParks(latitude, longitude, featureCollection) {
    if (!featureCollection || !Array.isArray(featureCollection.features)) return [];
    return featureCollection.features.filter(feature => pointInGeometry(latitude, longitude, feature.geometry));
  }
  function classifyParks(latitude, longitude, featureCollection, gpsAccuracy) {
    return findParks(latitude, longitude, featureCollection).map(feature => {
      const boundaryMeters = distanceToGeometryBoundary(latitude, longitude, feature.geometry);
      const configuredCaution = Number(feature.properties && feature.properties.cautionMeters) || 50;
      const cautionMeters = Math.max(configuredCaution, Number(gpsAccuracy) || 0);
      return { feature, boundaryMeters, state: boundaryMeters <= cautionMeters ? "boundary" : "inside" };
    });
  }
  window.PotaBoundaryEngine = { load, findParks, classifyParks, pointInGeometry };
}());
