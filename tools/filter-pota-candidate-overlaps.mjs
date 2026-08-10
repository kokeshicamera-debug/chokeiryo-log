import fs from "node:fs";

// 複数の公的GIS由来候補を併用する際に、既存候補・正確判定と同じPOTA番号を除く。
// 使い方:
// node filter-pota-candidate-overlaps.mjs <入力.geojson> <出力.geojson> <既存候補索引.json> <正確区域.geojson>

const [inputFile, outputFile, candidateIndexFile, verifiedFile] = process.argv.slice(2);
if (!verifiedFile) throw new Error("使い方: node filter-pota-candidate-overlaps.mjs <入力.geojson> <出力.geojson> <既存候補索引.json> <正確区域.geojson>");

const input = JSON.parse(fs.readFileSync(inputFile, "utf8"));
const candidateIndex = JSON.parse(fs.readFileSync(candidateIndexFile, "utf8"));
const verified = JSON.parse(fs.readFileSync(verifiedFile, "utf8"));
const knownRefs = new Set([
  ...(candidateIndex.parks || []).map(item => item.ref),
  ...(verified.features || []).map(item => item.properties?.potaRef)
].filter(Boolean));

const features = (input.features || []).filter(feature => !knownRefs.has(feature.properties?.potaRef));
fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
console.log(`重複除外: ${input.features?.length || 0}件 → ${features.length}件（除外 ${input.features?.length - features.length || 0}件）`);
