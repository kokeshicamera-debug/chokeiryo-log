import fs from "node:fs";
import path from "node:path";

const [sourceDirectory, outputFile] = process.argv.slice(2);
if (!sourceDirectory || !outputFile) {
  throw new Error("使い方: node import-national-park-shape.mjs <Shapeフォルダ> <出力GeoJSON>");
}

const parkName = "富士箱根伊豆";
const displayParkName = "富士箱根伊豆国立公園";
const dbf = fs.readFileSync(path.join(sourceDirectory, "nps.dbf"));
const shp = fs.readFileSync(path.join(sourceDirectory, "nps.shp"));
const decoder = new TextDecoder("utf-8");

function readDbfRows(buffer) {
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; buffer[offset] !== 0x0d; offset += 32) {
    const nameEnd = buffer.indexOf(0, offset, "utf8");
    const name = buffer.subarray(offset, nameEnd < 0 ? offset + 11 : nameEnd).toString("ascii");
    fields.push({ name, length: buffer[offset + 16] });
  }
  const rows = [];
  for (let index = 0; index < recordCount; index += 1) {
    const start = headerLength + index * recordLength;
    const row = {};
    let cursor = start + 1;
    for (const field of fields) {
      row[field.name] = decoder.decode(buffer.subarray(cursor, cursor + field.length)).trim();
      cursor += field.length;
    }
    rows.push(row);
  }
  return rows;
}

function roundCoordinate(value) {
  return Math.round(value * 1e6) / 1e6;
}

function polygonFromRecord(buffer, recordOffset) {
  const contentBytes = buffer.readInt32BE(recordOffset + 4) * 2;
  const body = recordOffset + 8;
  const type = buffer.readInt32LE(body);
  if (type === 0) return { next: body + contentBytes, coordinates: null };
  if (type !== 5 && type !== 15 && type !== 25) {
    throw new Error(`未対応のShape形式: ${type}`);
  }
  const partCount = buffer.readInt32LE(body + 36);
  const pointCount = buffer.readInt32LE(body + 40);
  const parts = [];
  for (let part = 0; part < partCount; part += 1) parts.push(buffer.readInt32LE(body + 44 + part * 4));
  const pointsOffset = body + 44 + partCount * 4;
  const rings = [];
  for (let part = 0; part < partCount; part += 1) {
    const first = parts[part];
    const last = part + 1 < partCount ? parts[part + 1] : pointCount;
    const ring = [];
    for (let point = first; point < last; point += 1) {
      const coordinate = pointsOffset + point * 16;
      ring.push([roundCoordinate(buffer.readDoubleLE(coordinate)), roundCoordinate(buffer.readDoubleLE(coordinate + 8))]);
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return { next: body + contentBytes, coordinates: rings };
}

const rows = readDbfRows(dbf);
let recordOffset = 100;
const polygons = [];
for (let index = 0; index < rows.length; index += 1) {
  const polygon = polygonFromRecord(shp, recordOffset);
  recordOffset = polygon.next;
  if (rows[index].NAME === parkName && polygon.coordinates) polygons.push(polygon.coordinates);
}
if (!polygons.length) throw new Error(`${displayParkName} の区域を見つけられませんでした。`);

const collection = JSON.parse(fs.readFileSync(outputFile, "utf8"));
const feature = collection.features.find((item) => item.properties?.potaRef === "JP-0016");
if (!feature) throw new Error("JP-0016 の登録行を見つけられませんでした。");
feature.geometry = { type: "MultiPolygon", coordinates: polygons };
Object.assign(feature.properties, {
  boundaryStatus: "環境省の全国国立公園区域Shapeから取込済み",
  boundarySource: "環境省 生物多様性センター「国立公園区域等」Shape（2025-04-28）",
  boundaryScaleNote: "公式データの表示精度を踏まえ、境界付近は注意表示します",
  cautionMeters: 75,
  importedPolygonCount: polygons.length
});
fs.writeFileSync(outputFile, `${JSON.stringify(collection)}\n`, "utf8");
console.log(`JP-0016: ${polygons.length} 区域を取り込みました。`);
