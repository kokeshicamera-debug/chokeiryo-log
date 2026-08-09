import fs from "node:fs";

// 全国版の自然公園区域 GeoJSON と POTA の一覧 CSV を照合して、
// アプリがそのまま読める区域データと、確認が必要な一覧を出力します。
// 使い方:
// node build-national-pota-boundaries.mjs <自然公園.geojson> <all_parks_ext.csv> <出力.geojson> <照合報告.json> [別名対応.json]

const [sourceFile, potaCsvFile, outputFile, reportFile, aliasesFile] = process.argv.slice(2);
if (!reportFile) {
  throw new Error("使い方: node build-national-pota-boundaries.mjs <自然公園.geojson> <all_parks_ext.csv> <出力.geojson> <照合報告.json> [別名対応.json]");
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s　・･,，、（）()\[\]【】「」『』]/g, "")
    .replace(/(国立|国定|都道府県立|県立|府立|市立|町立|村立)?(自然)?公園(区域|地区)?$/u, "")
    .replace(/自然保全地域$/u, "")
    .replace(/[ヶケ]/g, "ケ")
    .toLowerCase();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some(value => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header = [], ...body] = rows;
  return body.map(values => Object.fromEntries(header.map((key, index) => [key.trim(), (values[index] || "").trim()])));
}

function propertyValue(properties) {
  const keys = ["name", "NAME", "Name", "park_name", "PARK_NAME", "公園名", "自然公園名称", "自然公園名"];
  for (const key of keys) if (properties?.[key]) return properties[key];
  return "";
}

function readAliases(file) {
  if (!file || !fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeName(key), String(value)]));
}

const source = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
const aliases = readAliases(aliasesFile);
const parks = parseCsv(fs.readFileSync(potaCsvFile, "utf8"))
  .filter(row => /^JP-\d{4}$/u.test(row.reference || row.Reference || row.REFERENCE || ""))
  .map(row => ({
    ref: row.reference || row.Reference || row.REFERENCE,
    name: row.name || row.Name || row.NAME || "",
    entity: row.entityName || row.entity_name || row.EntityName || ""
  }));

const parksByName = new Map();
for (const park of parks) {
  const key = normalizeName(park.name);
  if (!key) continue;
  if (!parksByName.has(key)) parksByName.set(key, []);
  parksByName.get(key).push(park);
}

const features = [];
const report = { generatedAt: new Date().toISOString(), matched: [], ambiguous: [], unmatchedAreas: [], unmatchedPota: [] };
const matchedRefs = new Set();

for (const feature of source.features || []) {
  if (!feature.geometry || !["Polygon", "MultiPolygon"].includes(feature.geometry.type)) continue;
  const sourceName = propertyValue(feature.properties);
  const normalized = normalizeName(sourceName);
  const aliasRef = aliases[normalized];
  const candidates = aliasRef ? parks.filter(park => park.ref === aliasRef) : (parksByName.get(normalized) || []);
  if (candidates.length === 1) {
    const park = candidates[0];
    matchedRefs.add(park.ref);
    features.push({
      type: "Feature",
      properties: {
        potaRef: park.ref,
        nameJa: sourceName || park.name,
        nameEn: park.name,
        authority: "環境省・都道府県等の公的GIS",
        boundaryStatus: "全国公的GISとの自動照合",
        boundarySource: "環境省 EADAS 自然公園区域等（取込元の属性を照合報告に保存）",
        boundaryScaleNote: "公的GISの公開精度を踏まえ、境界付近は注意表示します",
        cautionMeters: 75,
        sourceProperties: feature.properties || {}
      },
      geometry: feature.geometry
    });
    report.matched.push({ ref: park.ref, potaName: park.name, gisName: sourceName });
  } else if (candidates.length > 1) {
    report.ambiguous.push({ gisName: sourceName, candidates: candidates.map(park => ({ ref: park.ref, name: park.name })) });
  } else {
    report.unmatchedAreas.push({ gisName: sourceName, properties: feature.properties || {} });
  }
}

for (const park of parks) if (!matchedRefs.has(park.ref)) report.unmatchedPota.push({ ref: park.ref, name: park.name });

fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", features })}\n`, "utf8");
fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`照合完了: 一致 ${report.matched.length}件 / 要確認 ${report.ambiguous.length}件 / 未一致POTA ${report.unmatchedPota.length}件`);
