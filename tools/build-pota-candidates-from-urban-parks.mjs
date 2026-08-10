import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

// 国土交通省「都市計画決定GISデータ」から *_kouen.geojson だけを読み、
// POTA同梱一覧の代表地点が一意に入る公園区域を「候補」として作成する。
// 都市計画データは近似・未収録の可能性があるため、出力は公式判定には使わない。
// 使い方:
// node build-pota-candidates-from-urban-parks.mjs <POTA一覧.csv> <配布先一覧.json> <出力.geojson> <報告.json> [都道府県名]

const [catalogFile, sourceFile, outputFile, reportFile, prefectureOnly] = process.argv.slice(2);
if (!reportFile) throw new Error("使い方: node build-pota-candidates-from-urban-parks.mjs <POTA一覧.csv> <配布先一覧.json> <出力.geojson> <報告.json> [都道府県名]");

function parseCsvLine(line) {
  const values = [];
  let value = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const crosses = ((yi > point[1]) !== (yj > point[1])) &&
      (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  return pointInRing(point, polygon[0]) && !polygon.slice(1).some(ring => pointInRing(point, ring));
}

function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygon => pointInPolygon(point, polygon));
  return false;
}

function geometryBounds(geometry) {
  const coordinates = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minLongitude = Infinity, minLatitude = Infinity, maxLongitude = -Infinity, maxLatitude = -Infinity;
  for (const polygon of coordinates) for (const ring of polygon) for (const [longitude, latitude] of ring) {
    minLongitude = Math.min(minLongitude, longitude); minLatitude = Math.min(minLatitude, latitude);
    maxLongitude = Math.max(maxLongitude, longitude); maxLatitude = Math.max(maxLatitude, latitude);
  }
  return { minLongitude, minLatitude, maxLongitude, maxLatitude };
}

function pointInBounds(point, bounds) {
  return point[0] >= bounds.minLongitude && point[0] <= bounds.maxLongitude && point[1] >= bounds.minLatitude && point[1] <= bounds.maxLatitude;
}

// ZIPの中央ディレクトリから、必要なGeoJSONだけをメモリ上へ展開する。
function zipEntries(buffer) {
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("ZIPの終端情報を見つけられません");
  const count = buffer.readUInt16LE(eocd + 10);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIPの中央ディレクトリが不正です");
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function extractZipEntry(buffer, entry) {
  const offset = entry.localOffset;
  if (buffer.readUInt32LE(offset) !== 0x04034b50) throw new Error(`ZIP内ファイルの位置が不正です: ${entry.name}`);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const compressed = buffer.subarray(offset + 30 + nameLength + extraLength, offset + 30 + nameLength + extraLength + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`未対応の圧縮方式です: ${entry.method} (${entry.name})`);
}

const rows = fs.readFileSync(catalogFile, "utf8").trim().split(/\r?\n/u);
const header = parseCsvLine(rows.shift());
const column = Object.fromEntries(header.map((name, index) => [name, index]));
const pota = rows.map(parseCsvLine).map(row => ({
  ref: row[column.reference], name: row[column.name],
  longitude: Number(row[column.longitude]), latitude: Number(row[column.latitude])
})).filter(item => /^JP-\d{4}$/u.test(item.ref) && Number.isFinite(item.longitude) && Number.isFinite(item.latitude));

const sourceConfig = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
const sources = (sourceConfig.sources || []).map(([prefecture, url]) => ({ prefecture, url }))
  .filter(item => !prefectureOnly || item.prefecture === prefectureOnly);
if (!sources.length) throw new Error("対象となる都道府県がありません");

const matches = new Map();
const errors = [];
let scannedFiles = 0, scannedFeatures = 0;
for (const source of sources) {
  process.stdout.write(`取得中: ${source.prefecture}\n`);
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    const parkEntries = zipEntries(archive).filter(entry => /_kouen\.geojson$/iu.test(entry.name));
    for (const entry of parkEntries) {
      scannedFiles += 1;
      const collection = JSON.parse(extractZipEntry(archive, entry).toString("utf8"));
      for (const feature of collection.features || []) {
        if (!feature.geometry || !/^(Polygon|MultiPolygon)$/u.test(feature.geometry.type)) continue;
        scannedFeatures += 1;
        const bounds = geometryBounds(feature.geometry);
        for (const park of pota) {
          const point = [park.longitude, park.latitude];
          if (!pointInBounds(point, bounds) || !pointInGeometry(point, feature.geometry)) continue;
          const list = matches.get(park.ref) || [];
          list.push({
            ...feature,
            properties: {
              potaRef: park.ref,
              nameEn: park.name,
              nameJa: "",
              boundaryStatus: "全国都市公園GIS候補・公開前検証待ち",
              boundarySource: "国土交通省「都市計画決定GISデータ」都市公園・緑地を、POTA代表地点で空間照合して加工",
              boundaryScaleNote: "都市計画データは近似・未収録の可能性がある。POTA運用可否は公式情報で最終確認すること。",
              candidateMethod: "POTA representative point inside one MLIT urban-park polygon",
              sourceParkName: feature.properties?.ParkName || "",
              sourceParkType: feature.properties?.ParkType || "",
              sourcePrefecture: source.prefecture,
              sourceCity: feature.properties?.Cityname || ""
            }
          });
          matches.set(park.ref, list);
        }
      }
    }
  } catch (error) {
    errors.push({ prefecture: source.prefecture, message: error.message });
  }
}

const features = [];
const ambiguous = [];
for (const [ref, list] of matches) {
  if (list.length === 1) features.push(list[0]);
  else ambiguous.push({ ref, count: list.length, parks: list.map(item => item.properties.sourceParkName) });
}
features.sort((a, b) => a.properties.potaRef.localeCompare(b.properties.potaRef));
const report = {
  generatedAt: new Date().toISOString(),
  source: sourceConfig.sourcePage,
  prefectures: sources.map(item => item.prefecture),
  summary: { sourceFiles: scannedFiles, sourceFeatures: scannedFeatures, candidates: features.length, ambiguous: ambiguous.length, errors: errors.length },
  ambiguous, errors
};
fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`完了: 都市公園候補 ${features.length}件 / 重複候補 ${ambiguous.length}件 / 読込失敗 ${errors.length}件`);
