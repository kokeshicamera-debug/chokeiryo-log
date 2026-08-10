import fs from "node:fs";

// POTA一覧の代表座標を、環境省の自然公園区域に重ねて候補を作ります。
// 日本語名・英語名が異なる公園にも対応するための「自動候補作成」工具です。
// 使い方:
// node match-pota-by-point.mjs <自然公園.geojson> <POTA一覧.csv> <候補対応.json>

const [areasFile, parksFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw new Error("使い方: node match-pota-by-point.mjs <自然公園.geojson> <POTA一覧.csv> <候補対応.json>");

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[index + 1] === "\n") index += 1; row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...body] = rows;
  return body.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] || ""])));
}

function ringContains(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[index]; const [x2, y2] = ring[previous];
    if ((y1 > point[1]) !== (y2 > point[1]) && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

function polygonContains(point, rings) {
  return ringContains(point, rings[0]) && !rings.slice(1).some(ring => ringContains(point, ring));
}

function geometryContains(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === "Polygon") return polygonContains(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygon => polygonContains(point, polygon));
  return false;
}

function bounds(geometry) {
  const coordinates = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of coordinates) for (const ring of polygon) for (const [x, y] of ring) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

const areas = JSON.parse(fs.readFileSync(areasFile, "utf8")).features
  .filter(feature => feature.geometry && ["Polygon", "MultiPolygon"].includes(feature.geometry.type))
  .map(feature => ({ ...feature, bounds: bounds(feature.geometry) }));
const parks = parseCsv(fs.readFileSync(parksFile, "utf8"))
  .filter(park => /^JP-\d{4}$/u.test(park.reference || "") && Number.isFinite(Number(park.latitude)) && Number.isFinite(Number(park.longitude)));

const candidates = [];
for (const park of parks) {
  const point = [Number(park.longitude), Number(park.latitude)];
  const hits = areas.filter(area => point[0] >= area.bounds.minX && point[0] <= area.bounds.maxX && point[1] >= area.bounds.minY && point[1] <= area.bounds.maxY && geometryContains(point, area.geometry));
  const names = [...new Set(hits.map(hit => hit.properties.sourceName || hit.properties.name).filter(Boolean))];
  candidates.push({
    ref: park.reference,
    potaName: park.name,
    latitude: Number(park.latitude),
    longitude: Number(park.longitude),
    status: names.length === 1 ? "candidate" : names.length ? "ambiguous" : "outside",
    gisNames: names,
    sourceParkKinds: [...new Set(hits.map(hit => hit.properties.sourceParkKind).filter(Boolean))]
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  source: "POTA同梱一覧の代表座標と環境省 生物多様性見える化マップ自然公園区域の空間照合",
  summary: {
    candidate: candidates.filter(item => item.status === "candidate").length,
    ambiguous: candidates.filter(item => item.status === "ambiguous").length,
    outside: candidates.filter(item => item.status === "outside").length
  },
  candidates
};
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`候補 ${report.summary.candidate}件 / 要確認 ${report.summary.ambiguous}件 / 公的自然公園区域外 ${report.summary.outside}件`);
