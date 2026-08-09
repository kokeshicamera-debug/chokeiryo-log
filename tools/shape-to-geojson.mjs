import fs from "node:fs";
import path from "node:path";

// 緯度経度（WGS84/JGD2011経緯度）の Shape ファイルを GeoJSON に変換します。
// 使い方: node shape-to-geojson.mjs <Shapeファイルのフォルダ> <出力.geojson> [utf-8|shift_jis]

const [sourceDirectory, outputFile, encoding = "utf-8"] = process.argv.slice(2);
if (!outputFile) throw new Error("使い方: node shape-to-geojson.mjs <Shapeファイルのフォルダ> <出力.geojson> [utf-8|shift_jis]");

const files = fs.readdirSync(sourceDirectory);
const shpName = files.find(file => /\.shp$/iu.test(file));
const dbfName = files.find(file => /\.dbf$/iu.test(file));
if (!shpName || !dbfName) throw new Error("同じフォルダに .shp と .dbf が必要です");

const shp = fs.readFileSync(path.join(sourceDirectory, shpName));
const dbf = fs.readFileSync(path.join(sourceDirectory, dbfName));
const decoder = new TextDecoder(encoding);

function rowsFromDbf(buffer) {
  const count = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; buffer[offset] !== 0x0d; offset += 32) {
    const end = buffer.indexOf(0, offset);
    fields.push({ name: buffer.subarray(offset, end < 0 ? offset + 11 : end).toString("ascii"), length: buffer[offset + 16] });
  }
  return Array.from({ length: count }, (_, index) => {
    const start = headerLength + index * recordLength;
    let cursor = start + 1;
    const row = { _deleted: buffer[start] === 0x2a };
    for (const field of fields) {
      row[field.name] = decoder.decode(buffer.subarray(cursor, cursor + field.length)).trim();
      cursor += field.length;
    }
    return row;
  });
}

function coordinate(value) { return Math.round(value * 1e7) / 1e7; }

function ringArea(ring) {
  return ring.reduce((area, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [px, py] = ring[previous];
    if ((y > point[1]) !== (py > point[1]) && point[0] < (px - x) * (point[1] - y) / (py - y) + x) inside = !inside;
  }
  return inside;
}

function geometryFromRings(rings) {
  // Shape仕様では外周と穴が同一レコードに混在します。向きと包含関係を使い、
  // 複数の外周を持つレコードも正しいMultiPolygonとして保存します。
  const clockwise = rings.filter(ring => ringArea(ring) < 0);
  const counterClockwise = rings.filter(ring => ringArea(ring) >= 0);
  const outerRings = clockwise.length ? clockwise : [rings[0]];
  const holeRings = clockwise.length ? counterClockwise : rings.slice(1);
  const polygons = outerRings.map(outer => [outer]);
  for (const hole of holeRings) {
    const destination = polygons.find(polygon => pointInRing(hole[0], polygon[0]));
    if (destination) destination.push(hole);
    else polygons.push([hole]);
  }
  return polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons };
}

function recordFromShape(buffer, offset) {
  const length = buffer.readInt32BE(offset + 4) * 2;
  const body = offset + 8;
  const type = buffer.readInt32LE(body);
  if (type === 0) return { next: body + length, geometry: null };
  if (![5, 15, 25].includes(type)) throw new Error(`未対応のShape形式です: ${type}`);
  const partCount = buffer.readInt32LE(body + 36);
  const pointCount = buffer.readInt32LE(body + 40);
  const starts = Array.from({ length: partCount }, (_, index) => buffer.readInt32LE(body + 44 + index * 4));
  const pointsOffset = body + 44 + partCount * 4;
  const rings = starts.map((first, part) => {
    const last = part + 1 < partCount ? starts[part + 1] : pointCount;
    return Array.from({ length: last - first }, (_, index) => {
      const point = pointsOffset + (first + index) * 16;
      return [coordinate(buffer.readDoubleLE(point)), coordinate(buffer.readDoubleLE(point + 8))];
    });
  }).filter(ring => ring.length >= 4);
  return { next: body + length, geometry: rings.length ? geometryFromRings(rings) : null };
}

const rows = rowsFromDbf(dbf);
const features = [];
let offset = 100;
for (const row of rows) {
  const record = recordFromShape(shp, offset);
  offset = record.next;
  if (!row._deleted && record.geometry) {
    delete row._deleted;
    features.push({ type: "Feature", properties: row, geometry: record.geometry });
  }
}
fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
console.log(`変換完了: ${features.length}件 (${shpName})`);
