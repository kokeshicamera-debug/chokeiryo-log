import fs from "node:fs";

// 代表座標による空間照合で「一意」となった候補だけを、POTAごとの
// MultiPolygon境界データにまとめます。これは公開前検証用データです。
// 使い方:
// node build-pota-boundaries-from-point-report.mjs <自然公園.geojson> <候補対応.json> <出力.geojson>

const [areasFile, reportFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw new Error("使い方: node build-pota-boundaries-from-point-report.mjs <自然公園.geojson> <候補対応.json> <出力.geojson>");

const areas = JSON.parse(fs.readFileSync(areasFile, "utf8")).features || [];
const report = JSON.parse(fs.readFileSync(reportFile, "utf8"));
const candidates = (report.candidates || []).filter(item => item.status === "candidate" && item.gisNames?.length === 1);
const byName = new Map();
for (const area of areas) {
  const name = area.properties?.sourceName || area.properties?.name;
  if (!name || !area.geometry) continue;
  if (!byName.has(name)) byName.set(name, []);
  byName.get(name).push(area);
}

function asPolygons(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

const features = [];
for (const candidate of candidates) {
  const gisName = candidate.gisNames[0];
  const matchedAreas = byName.get(gisName) || [];
  const polygons = matchedAreas.flatMap(area => asPolygons(area.geometry));
  if (!polygons.length) continue;
  features.push({
    type: "Feature",
    properties: {
      potaRef: candidate.ref,
      nameJa: gisName,
      nameEn: candidate.potaName,
      authority: "環境省 生物多様性「見える化」マップ",
      boundaryStatus: "全国GIS候補・公開前検証待ち",
      boundarySource: "環境省 生物多様性「見える化」マップの自然公園区域を、POTA代表座標で一意に空間照合して加工",
      boundaryScaleNote: "区域は概要データであり、正確性は保証されない。POTA運用可否は公式情報で最終確認すること。",
      candidateMethod: "POTA representative point inside one public natural-park area",
      sourceParkKind: candidate.sourceParkKinds.join(" / "),
      sourceName: gisName,
      sourceFeatureCount: matchedAreas.length,
      cautionMeters: 75
    },
    geometry: { type: "MultiPolygon", coordinates: polygons }
  });
}

fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
console.log(`完了: ${features.length}件の全国POTA区域候補を作成しました`);
