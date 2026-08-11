import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 都市公園GIS候補のうち、公式区域へ未昇格のものを保留理由ごとに整理します。
// 使い方: node tools/audit-unpromoted-urban-pota.mjs [--check]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const readJson = file => JSON.parse(fs.readFileSync(path.resolve(root, file), "utf8"));
const promotions = readJson("data/pota-boundary-official-promotions.json");
const index = readJson("data/pota-boundaries-urban-index.json");
const promoted = new Set((promotions.regions || []).flatMap(region => region.parks || []).map(park => park.ref));
const genericName = /^(?:|公園|広域公園|総合公園|運動公園|大規模公園|特殊公園|都市計画公園(?:・緑地)?|緑地|その他緑地|T-緑地|-)$/u;

const items = [];
for (const park of index.parks || []) {
  if (promoted.has(park.ref)) continue;
  const candidate = readJson(`data/pota-boundaries-urban-candidates/${park.ref}.geojson`);
  const properties = candidate.features?.[0]?.properties || {};
  const sourceName = String(properties.sourceParkName || "").trim();
  let reviewClass = "specific-name-review";
  let reason = "GISに固有名があります。公式ページで現在名・所在地・区域の対応確認が必要です。";
  if (!sourceName) {
    reviewClass = "missing-source-name";
    reason = "GIS側に公園名がなく、所在地と形だけでは同一公園と断定できません。";
  } else if (genericName.test(sourceName)) {
    reviewClass = "generic-source-name";
    reason = "GIS側の名称が公園種別だけなので、隣接公園との取り違え防止が必要です。";
  } else if (/^\d+[・･]\d+[・･]/u.test(sourceName)) {
    reviewClass = "planning-number-review";
    reason = "都市計画番号を含むため、公式資料で現在の公園名との対応確認が必要です。";
  }
  items.push({
    ref: park.ref,
    nameEn: park.nameEn || "",
    sourcePrefecture: properties.sourcePrefecture || "",
    sourceCity: properties.sourceCity || "",
    sourceParkName: sourceName,
    reviewClass,
    reason,
    candidateFile: park.file,
  });
}

items.sort((a, b) => a.reviewClass.localeCompare(b.reviewClass) || a.sourcePrefecture.localeCompare(b.sourcePrefecture, "ja") || a.ref.localeCompare(b.ref));
const counts = Object.fromEntries([...new Set(items.map(item => item.reviewClass))].sort().map(reviewClass => [reviewClass, items.filter(item => item.reviewClass === reviewClass).length]));
const result = { version: 1, total: items.length, counts, items };
const output = path.resolve(root, "data/pota-urban-promotion-backlog.json");
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (checkOnly) {
  if (!fs.existsSync(output) || fs.readFileSync(output, "utf8") !== serialized) throw new Error("保留一覧が現在の候補・昇格設定と一致しません。先にオプションなしで更新してください。");
} else {
  fs.writeFileSync(output, serialized, "utf8");
}
console.log(`${checkOnly ? "検査成功" : "保存完了"}: 公式区域へ未昇格 ${items.length}件`);
console.log(Object.entries(counts).map(([key, count]) => `${key} ${count}件`).join("、"));
