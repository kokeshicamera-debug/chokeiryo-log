import fs from "node:fs";

// POTA境界GeoJSONを公開前に検査します。
// 使い方: node validate-pota-boundaries.mjs <境界.geojson>

const [file] = process.argv.slice(2);
if (!file) throw new Error("使い方: node validate-pota-boundaries.mjs <境界.geojson>");

const collection = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];
const refs = new Set();
let skipped = 0;

function checkRing(ring, label) {
  if (!Array.isArray(ring) || ring.length < 4) return errors.push(`${label}: 点が不足しています`);
  const first = ring[0], last = ring[ring.length - 1];
  if (!Array.isArray(first) || !Array.isArray(last) || first[0] !== last[0] || first[1] !== last[1]) errors.push(`${label}: 閉じた境界線ではありません`);
  for (const [longitude, latitude] of ring) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < 122 || longitude > 154 || latitude < 20 || latitude > 46) {
      errors.push(`${label}: 日本周辺として不正な座標です`);
      break;
    }
  }
}

if (collection.type !== "FeatureCollection" || !Array.isArray(collection.features)) errors.push("FeatureCollection形式ではありません");
for (const [index, feature] of (collection.features || []).entries()) {
  const label = `feature ${index + 1}`;
  const ref = feature.properties?.potaRef;
  if (!/^JP-\d{4}$/u.test(ref || "")) errors.push(`${label}: POTA番号が不正です`);
  else if (refs.has(ref)) errors.push(`${label}: ${ref} が重複しています`);
  else refs.add(ref);
  const geometry = feature.geometry;
  if (!geometry && /作成待ち|未取込/u.test(feature.properties?.boundaryStatus || "")) {
    skipped += 1;
    continue;
  }
  if (!feature.properties?.boundarySource) errors.push(`${label}: 出典がありません`);
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    errors.push(`${label}: Polygon または MultiPolygon ではありません`);
    continue;
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  polygons.forEach((polygon, polygonIndex) => polygon.forEach((ring, ringIndex) => checkRing(ring, `${label} polygon ${polygonIndex + 1} ring ${ringIndex + 1}`)));
}

if (errors.length) {
  console.error(`検査失敗: ${errors.length}件`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`検査成功: ${collection.features.length}件（区域未取込 ${skipped}件を除く）のPOTA境界データ`);
