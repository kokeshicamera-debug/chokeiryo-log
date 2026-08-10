import fs from "node:fs";
import path from "node:path";

// 環境省「生物多様性見える化マップ」で公開されている全国自然公園区域を
// 一括して GeoJSON に保存するための取得ツールです。
// 使い方:
// node fetch-moe-natural-parks.mjs <出力.geojson> [出典情報.json]

const [outputFile, metadataFile = "data/moe-natural-parks-source.json", maxOffsetText] = process.argv.slice(2);
if (!outputFile) {
  throw new Error("使い方: node fetch-moe-natural-parks.mjs <出力.geojson> [出典情報.json] [最大簡略化量(度)]");
}
const maxAllowableOffset = maxOffsetText === undefined ? null : Number(maxOffsetText);
if (maxAllowableOffset !== null && (!Number.isFinite(maxAllowableOffset) || maxAllowableOffset <= 0)) {
  throw new Error("最大簡略化量は 0 より大きい数値で指定してください（例: 0.00003）");
}

const LAYERS = [
  { kind: "都道府県立自然公園", url: "https://biodiversitymap.env.go.jp/server/rest/services/Hosted/F_02_02_05/FeatureServer/2020500", nameFields: ["name", "orig_name"] },
  { kind: "国定公園", url: "https://biodiversitymap.env.go.jp/server/rest/services/Hosted/F_02_02_04/FeatureServer/2020400", nameFields: ["pnc", "sa10_2_018"] },
  { kind: "国立公園", url: "https://biodiversitymap.env.go.jp/server/rest/services/Hosted/F_02_02_02/FeatureServer/2020200", nameFields: ["名称", "sa10_1_018"] }
];

async function requestJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`取得失敗 (${response.status}): ${url}`);
  const value = await response.json();
  if (value.error) throw new Error(`GIS エラー: ${value.error.message || url}`);
  return value;
}

async function fetchLayer(layer) {
  const countInfo = await requestJson(`${layer.url}/query?where=1%3D1&returnCountOnly=true&f=json`);
  const count = Number(countInfo.count || 0);
  const features = [];
  const pageSize = 1000;
  for (let offset = 0; offset < count; offset += pageSize) {
    const query = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "true", resultOffset: String(offset), resultRecordCount: String(pageSize), f: "geojson" });
    if (maxAllowableOffset !== null) query.set("maxAllowableOffset", String(maxAllowableOffset));
    const result = await requestJson(`${layer.url}/query?${query}`);
    for (const feature of result.features || []) {
      if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) continue;
      const sourceName = layer.nameFields.map(key => feature.properties?.[key]).find(Boolean) || "";
      features.push({
        ...feature,
        properties: {
          ...feature.properties,
          name: sourceName,
          sourceName,
          sourceParkKind: layer.kind,
          sourceLayer: layer.url,
          sourceDataset: "環境省 生物多様性「見える化」マップ"
        }
      });
    }
    console.log(`${layer.kind}: ${Math.min(offset + pageSize, count)} / ${count}`);
  }
  return { layer, count, features };
}

const results = [];
for (const layer of LAYERS) results.push(await fetchLayer(layer));

const featureCollection = { type: "FeatureCollection", features: results.flatMap(result => result.features) };
const metadata = {
  generatedAt: new Date().toISOString(),
  source: "環境省 生物多様性「見える化」マップ",
  sourceUrl: "https://www.biodiversitymap.env.go.jp/",
  maxAllowableOffset,
  licenseNote: "原典・利用規約・各レイヤーの留意事項を確認し、加工して利用すること。区域は概要データであり、正確性は保証されない。",
  layers: results.map(result => ({ kind: result.layer.kind, url: result.layer.url, reportedCount: result.count, polygonCount: result.features.length }))
};

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(featureCollection)}\n`, "utf8");
fs.mkdirSync(path.dirname(metadataFile), { recursive: true });
fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
console.log(`完了: ${featureCollection.features.length} 件の自然公園区域を保存しました`);
