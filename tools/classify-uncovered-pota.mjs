import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

// 同梱POTA一覧から、現在どの区域候補にも含まれないPOTAを分類します。
// 使い方: node tools/classify-uncovered-pota.mjs [出力.json] [--check-current]

const args = process.argv.slice(2);
const checkCurrent = args.includes("--check-current");
const outputArg = args.find(arg => !arg.startsWith("--")) || "data/pota-uncovered-classification.json";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resolveRoot = file => path.resolve(root, file);
const readJson = file => JSON.parse(fs.readFileSync(resolveRoot(file), "utf8"));

const sourceIndexes = [
  "data/pota-boundaries-national-index.json",
  "data/pota-boundaries-osm-index.json",
  "data/pota-boundaries-urban-index.json",
];
const officialFiles = (readJson("data/pota-boundaries-manifest.json").regions || [])
  .map(region => String(region.file || "").replace(/^\.\//u, ""));

function readEmbeddedCatalog() {
  const html = fs.readFileSync(resolveRoot("index.html"), "utf8");
  const match = html.match(/const JAPAN_PROGRAM_DATA_PARTS=\s*(\[[\s\S]*?\]);\s*\n\s*async function decodeJapanProgramData/u);
  if (!match) throw new Error("index.html 内のPOTA/SOTA同梱データを見つけられません");
  const parts = JSON.parse(match[1]);
  const data = JSON.parse(zlib.gunzipSync(Buffer.from(parts.join(""), "base64")).toString("utf8"));
  return (data.pota || [])
    .filter(park => /^JP-\d{4}$/u.test(park?.[0] || ""))
    .map(([reference, name, latitude, longitude]) => ({ reference, name: name || "", latitude, longitude }));
}

const categoryLabels = {
  urbanPark: "都市・広域公園",
  naturePark: "自然公園",
  forest: "森林",
  historicCulture: "史跡・文化施設",
  greenway: "緑道",
  other: "その他",
};

// 名称だけでは区別しにくいものを、確認しやすいようPOTA番号で明示します。
const urbanOverrides = new Set(["JP-1629"]); // Toyota Prefectural Nature Park
const cultureRefs = new Set([
  "JP-1212", "JP-1213", "JP-1215", "JP-1218", "JP-1417", "JP-1883", "JP-1984",
  "JP-2004", "JP-2061", "JP-2108", "JP-2109", "JP-2110", "JP-2112", "JP-2134",
]);
const otherRefs = new Set(["JP-1101", "JP-1503", "JP-1548", "JP-1686", "JP-1816", "JP-1926"]);

function classify(park) {
  const { reference, name } = park;
  if (otherRefs.has(reference)) return ["other", "個別確認: 公園・自然・森林・史跡・緑道のどれにも直接当てはまらない施設"];
  if (cultureRefs.has(reference)) return ["historicCulture", "個別確認: 庭園、史跡、博物館、美術、植物園など"];
  if (/\bGreenway\b/iu.test(name)) return ["greenway", "名称に Greenway（緑道）を含む"];
  if (/\bForest\b/iu.test(name)) return ["forest", "名称に Forest（森林）を含む"];
  if (!urbanOverrides.has(reference) && /(?:\bNational Park\b|\bQuasi-National Park\b|\bPrefectural Nature Park\b)/iu.test(name)) {
    return ["naturePark", "名称が国立・国定・都道府県立自然公園を示す"];
  }
  return ["urbanPark", urbanOverrides.has(reference) ? "個別確認: 都市・広域公園として整理" : "上記以外の都道府県立公園等"];
}

const catalog = readEmbeddedCatalog();
const covered = new Set();
for (const file of sourceIndexes) {
  for (const park of readJson(file).parks || []) if (park.ref) covered.add(park.ref);
}
for (const file of officialFiles) {
  for (const feature of readJson(file).features || []) if (feature.properties?.potaRef) covered.add(feature.properties.potaRef);
}

const parks = catalog
  .filter(park => !covered.has(park.reference))
  .map(park => {
    const [category, reason] = classify(park);
    return { ...park, category, categoryLabel: categoryLabels[category], reason };
  })
  .sort((a, b) => a.reference.localeCompare(b.reference));

const summary = Object.fromEntries(Object.keys(categoryLabels).map(key => [key, parks.filter(park => park.category === key).length]));
const report = {
  version: 1,
  purpose: "区域候補が未取得の全国POTAを、次の調査先ごとに整理する",
  sources: { catalog: "index.html の同梱POTA一覧", coveredIndexes: sourceIndexes, officialBoundaries: officialFiles },
  totals: { japanPota: catalog.length, boundaryAvailable: catalog.length - parks.length, uncovered: parks.length },
  categories: Object.fromEntries(Object.entries(categoryLabels).map(([key, label]) => [key, { label, count: summary[key] }])),
  parks,
};

if (checkCurrent) {
  const expected = { japanPota: 1217, boundaryAvailable: 1021, uncovered: 196 };
  const expectedCategories = { urbanPark: 112, naturePark: 36, forest: 21, historicCulture: 14, greenway: 7, other: 6 };
  for (const [key, value] of Object.entries(expected)) if (report.totals[key] !== value) throw new Error(`${key}: 期待 ${value} 件、実際 ${report.totals[key]} 件`);
  for (const [key, value] of Object.entries(expectedCategories)) if (summary[key] !== value) throw new Error(`${categoryLabels[key]}: 期待 ${value} 件、実際 ${summary[key]} 件`);
}

const outputFile = path.isAbsolute(outputArg) ? outputArg : resolveRoot(outputArg);
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`完了: 未取得 ${parks.length} 件を ${Object.keys(categoryLabels).length} 分類で ${outputArg} に保存しました`);
console.log(Object.entries(categoryLabels).map(([key, label]) => `${label} ${summary[key]}件`).join("、"));
