import fs from "node:fs";
import path from "node:path";

const [sourceDirectory, outputFile] = process.argv.slice(2);
if (!sourceDirectory || !outputFile) throw new Error("使い方: node import-kanagawa-natural-parks.mjs <Shapeフォルダ> <出力GeoJSON>");

const files = fs.readdirSync(sourceDirectory);
const dbf = fs.readFileSync(path.join(sourceDirectory, files.find(file => file.endsWith(".dbf"))));
const shp = fs.readFileSync(path.join(sourceDirectory, files.find(file => file.endsWith(".shp"))));
const decoder = new TextDecoder("shift_jis");

function readRows(buffer) {
  const count = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  const fields = [];
  for (let offset = 32; buffer[offset] !== 0x0d; offset += 32) {
    const end = buffer.indexOf(0, offset);
    fields.push({ name: buffer.subarray(offset, end < 0 ? offset + 11 : end).toString("ascii"), length: buffer[offset + 16] });
  }
  return Array.from({ length: count }, (_, index) => {
    let cursor = headerLength + index * recordLength + 1;
    return Object.fromEntries(fields.map(field => {
      const value = decoder.decode(buffer.subarray(cursor, cursor + field.length)).trim();
      cursor += field.length;
      return [field.name, value];
    }));
  });
}

function toWgs84(easting, northing) {
  const semiMajor = 6378137;
  const flattening = 1 / 298.257222101;
  const eccentricitySquared = flattening * (2 - flattening);
  const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
  const scale = 0.9999;
  const originLatitude = 36 * Math.PI / 180;
  const originLongitude = 139.833333333333 * Math.PI / 180;
  const meridianArc = latitude => semiMajor * (
    (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * latitude
    - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * latitude)
    - 35 * eccentricitySquared ** 3 / 3072 * Math.sin(6 * latitude)
  );
  const mu = (meridianArc(originLatitude) + northing / scale) / (semiMajor * (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - eccentricitySquared)) / (1 + Math.sqrt(1 - eccentricitySquared));
  const latitude1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + 151 * e1 ** 3 / 96 * Math.sin(6 * mu)
    + 1097 * e1 ** 4 / 512 * Math.sin(8 * mu);
  const radius = semiMajor / Math.sqrt(1 - eccentricitySquared * Math.sin(latitude1) ** 2);
  const tangentSquared = Math.tan(latitude1) ** 2;
  const correction = secondEccentricitySquared * Math.cos(latitude1) ** 2;
  const meridianRadius = semiMajor * (1 - eccentricitySquared) / (1 - eccentricitySquared * Math.sin(latitude1) ** 2) ** 1.5;
  const distance = easting / (radius * scale);
  const latitude = latitude1 - (radius * Math.tan(latitude1) / meridianRadius) * (
    distance ** 2 / 2
    - (5 + 3 * tangentSquared + 10 * correction - 4 * correction ** 2 - 9 * secondEccentricitySquared) * distance ** 4 / 24
    + (61 + 90 * tangentSquared + 298 * correction + 45 * tangentSquared ** 2 - 252 * secondEccentricitySquared - 3 * correction ** 2) * distance ** 6 / 720
  );
  const longitude = originLongitude + (
    distance - (1 + 2 * tangentSquared + correction) * distance ** 3 / 6
    + (5 - 2 * correction + 28 * tangentSquared - 3 * correction ** 2 + 8 * secondEccentricitySquared + 24 * tangentSquared ** 2) * distance ** 5 / 120
  ) / Math.cos(latitude1);
  return [Math.round(longitude * 180 / Math.PI * 1e6) / 1e6, Math.round(latitude * 180 / Math.PI * 1e6) / 1e6];
}

function polygonAt(buffer, offset) {
  const length = buffer.readInt32BE(offset + 4) * 2;
  const body = offset + 8;
  if (buffer.readInt32LE(body) === 0) return { next: body + length, rings: null };
  const parts = buffer.readInt32LE(body + 36);
  const points = buffer.readInt32LE(body + 40);
  const starts = Array.from({ length: parts }, (_, index) => buffer.readInt32LE(body + 44 + index * 4));
  const pointOffset = body + 44 + parts * 4;
  const rings = starts.map((first, part) => {
    const last = part + 1 < parts ? starts[part + 1] : points;
    return Array.from({ length: last - first }, (_, index) => {
      const point = pointOffset + (first + index) * 16;
      return toWgs84(buffer.readDoubleLE(point), buffer.readDoubleLE(point + 8));
    });
  }).filter(ring => ring.length >= 4);
  return { next: body + length, rings };
}

const rows = readRows(dbf);
let offset = 100;
const polygons = [];
for (let index = 0; index < rows.length; index += 1) {
  const polygon = polygonAt(shp, offset);
  offset = polygon.next;
  if (rows[index].city_CD === "383" && rows[index].ITEM001 === "3" && polygon.rings?.length) polygons.push(polygon.rings);
}
if (!polygons.length) throw new Error("真鶴半島自然公園の区域を見つけられませんでした。");

const collection = JSON.parse(fs.readFileSync(outputFile, "utf8"));
const feature = collection.features.find(item => item.properties?.potaRef === "JP-1292");
if (!feature) throw new Error("JP-1292 の登録行を見つけられませんでした。");
feature.geometry = { type: "MultiPolygon", coordinates: polygons };
Object.assign(feature.properties, {
  boundaryStatus: "神奈川県オープンデータShapeから取込済み",
  boundarySource: "神奈川県「第11回（令和2年度）都市計画基礎調査・図47自然公園・自然保全地域図」",
  boundaryScaleNote: "県の公開GISを基にした参考判定。境界付近は注意表示します",
  cautionMeters: 100,
  importedPolygonCount: polygons.length
});
fs.writeFileSync(outputFile, `${JSON.stringify(collection)}\n`, "utf8");
console.log(`JP-1292: ${polygons.length} 区域を取り込みました。`);
