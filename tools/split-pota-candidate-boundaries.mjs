import fs from "node:fs";
import path from "node:path";

// 全国候補GeoJSONをPOTA番号ごとの小さなファイルへ分割します。
// index JSONは現在地に近い候補だけを選ぶために使用します。
// 使い方:
// node split-pota-candidate-boundaries.mjs <候補.geojson> <出力フォルダ> <索引.json> <Service Worker用一覧.js> [Service Workerの変数名]

const [inputFile, outputDirectory, indexFile, workerListFile, workerVariable = "NATIONAL_POTA_CANDIDATE_FILES"] = process.argv.slice(2);
if (!workerListFile) throw new Error("使い方: node split-pota-candidate-boundaries.mjs <候補.geojson> <出力フォルダ> <索引.json> <Service Worker用一覧.js>");
if (!/^[A-Z][A-Z0-9_]*$/u.test(workerVariable)) throw new Error("Service Workerの変数名が不正です");

function bounds(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minLongitude = Infinity, minLatitude = Infinity, maxLongitude = -Infinity, maxLatitude = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const [longitude, latitude] of ring) {
    minLongitude = Math.min(minLongitude, longitude); minLatitude = Math.min(minLatitude, latitude);
    maxLongitude = Math.max(maxLongitude, longitude); maxLatitude = Math.max(maxLatitude, latitude);
  }
  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
}

const collection = JSON.parse(fs.readFileSync(inputFile, "utf8"));
fs.mkdirSync(outputDirectory, { recursive: true });
const index = [];
const files = [];
for (const feature of collection.features || []) {
  const ref = feature.properties?.potaRef;
  if (!/^JP-\d{4}$/u.test(ref || "") || !feature.geometry) continue;
  const filename = `${ref}.geojson`;
  const relativeFile = `./${path.relative(path.dirname(indexFile), path.join(outputDirectory, filename)).replaceAll("\\", "/")}`;
  const outputFile = path.join(outputDirectory, filename);
  fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", features: [feature] })}\n`, "utf8");
  const box = bounds(feature.geometry);
  index.push({
    ref,
    nameJa: feature.properties.nameJa || "",
    nameEn: feature.properties.nameEn || "",
    file: relativeFile,
    ...box,
    boundaryStatus: feature.properties.boundaryStatus || "全国GIS候補・公開前検証待ち"
  });
  files.push(relativeFile.replace(/^\.\//u, "./data/"));
}
index.sort((a, b) => a.ref.localeCompare(b.ref));
fs.writeFileSync(indexFile, `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), source: "全国POTA区域候補", parks: index }, null, 2)}\n`, "utf8");
fs.writeFileSync(workerListFile, `self.${workerVariable}=${JSON.stringify(files)};\n`, "utf8");
console.log(`完了: ${index.length}件を ${outputDirectory} へ分割しました`);
