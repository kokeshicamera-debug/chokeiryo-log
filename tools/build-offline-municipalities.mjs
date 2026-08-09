import fs from "node:fs";
import path from "node:path";

const [sourceDirectory, outputFile] = process.argv.slice(2);
if (!sourceDirectory || !outputFile) {
  throw new Error("使い方: node build-offline-municipalities.mjs <展開済みN03フォルダ> <出力JSON>");
}

const tolerance = 0.00005; // およそ5m。市区町村判定用として海岸線の細部だけを減らす。

function squaredDistanceToSegment(point, first, last) {
  let x = first[0];
  let y = first[1];
  let dx = last[0] - x;
  let dy = last[1] - y;
  if (dx || dy) {
    const ratio = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) { x = last[0]; y = last[1]; }
    else if (ratio > 0) { x += dx * ratio; y += dy * ratio; }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyRing(ring) {
  if (!Array.isArray(ring) || ring.length < 5) return ring;
  const open = ring.slice(0, -1);
  const keep = new Uint8Array(open.length);
  keep[0] = 1;
  keep[open.length - 1] = 1;
  const stack = [[0, open.length - 1]];
  const threshold = tolerance * tolerance;
  while (stack.length) {
    const [first, last] = stack.pop();
    let largest = threshold;
    let index = -1;
    for (let point = first + 1; point < last; point += 1) {
      const distance = squaredDistanceToSegment(open[point], open[first], open[last]);
      if (distance > largest) { largest = distance; index = point; }
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  const simplified = open.filter((_, index) => keep[index]);
  if (simplified.length < 3) return ring;
  simplified.push(simplified[0]);
  return simplified;
}

function polygonsFromGeometry(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

const files = [];
for (const child of fs.readdirSync(sourceDirectory, { withFileTypes: true })) {
  if (!child.isDirectory()) continue;
  const folder = path.join(sourceDirectory, child.name);
  const file = fs.readdirSync(folder).find(name => /^N03-20250101_\d{2}\.geojson$/.test(name));
  if (file) files.push(path.join(folder, file));
}
if (files.length !== 47) throw new Error(`都道府県データが不足しています（${files.length}/47）。`);

const municipalities = new Map();
for (const file of files.sort()) {
  const source = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const feature of source.features) {
    const properties = feature.properties || {};
    const code = properties.N03_007;
    if (!code) continue;
    const entry = municipalities.get(code) || {
      code,
      prefecture: properties.N03_001 || "",
      county: properties.N03_003 || "",
      municipality: properties.N03_004 || properties.N03_003 || "",
      ward: properties.N03_005 || "",
      polygons: []
    };
    for (const polygon of polygonsFromGeometry(feature.geometry)) {
      entry.polygons.push(polygon.map(simplifyRing));
    }
    municipalities.set(code, entry);
  }
}

const data = {
  version: "2025-01-01",
  source: "国土交通省 国土数値情報（行政区域）2025年版を加工",
  attribution: "国土交通省「国土数値情報（行政区域）」を加工して作成",
  toleranceMeters: 5,
  municipalities: [...municipalities.values()]
    .sort((first, second) => first.code.localeCompare(second.code))
    .map(item => {
      const bounds = [Infinity, Infinity, -Infinity, -Infinity];
      item.polygons.forEach(polygon => polygon.forEach(ring => ring.forEach(point => {
        bounds[0] = Math.min(bounds[0], point[0]);
        bounds[1] = Math.min(bounds[1], point[1]);
        bounds[2] = Math.max(bounds[2], point[0]);
        bounds[3] = Math.max(bounds[3], point[1]);
      })));
      return [item.code, item.prefecture, item.county, item.municipality, item.ward, bounds, item.polygons];
    })
};
fs.writeFileSync(outputFile, `${JSON.stringify(data)}\n`, "utf8");
console.log(`市区町村・区: ${data.municipalities.length} 件`);
