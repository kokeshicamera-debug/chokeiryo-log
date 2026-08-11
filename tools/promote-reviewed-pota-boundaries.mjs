import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 人が公的GIS・公式ページと照合した候補だけを、実判定用の地域ファイルへ昇格します。
// 使い方: node tools/promote-reviewed-pota-boundaries.mjs [設定.json] [--check]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const configFile = args.find(arg => !arg.startsWith("--")) || "data/pota-boundary-official-promotions.json";
const resolveRoot = file => path.resolve(root, file);
const readJson = file => JSON.parse(fs.readFileSync(resolveRoot(file), "utf8"));
const config = readJson(configFile);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countPolygons(geometry) {
  if (geometry?.type === "Polygon") return 1;
  if (geometry?.type === "MultiPolygon") return geometry.coordinates.length;
  return 0;
}

for (const region of config.regions || []) {
  const refs = new Set();
  const features = [];
  for (const reviewed of region.parks || []) {
    const officialParkUrl = reviewed.officialParkUrl || region.officialParkUrl;
    const officialGisUrl = reviewed.officialGisUrl || region.officialGisUrl || "https://www.mlit.go.jp/toshi/tosiko/toshi_tosiko_tk_000087.html";
    const reviewNote = reviewed.reviewNote || region.reviewNote;
    const authority = reviewed.authority || region.authority;
    assert(/^JP-\d{4}$/u.test(reviewed.ref || ""), `${region.id}: POTA番号が不正です`);
    assert(!refs.has(reviewed.ref), `${region.id}: ${reviewed.ref} が重複しています`);
    refs.add(reviewed.ref);
    const candidate = readJson(reviewed.candidate);
    assert(candidate.type === "FeatureCollection" && candidate.features?.length === 1, `${reviewed.ref}: 候補区域が一意ではありません`);
    const source = candidate.features[0];
    const properties = source.properties || {};
    assert(properties.potaRef === reviewed.ref, `${reviewed.ref}: 候補のPOTA番号が一致しません`);
    assert(properties.sourcePrefecture === reviewed.expectedSourcePrefecture, `${reviewed.ref}: 都道府県が一致しません`);
    assert(properties.sourceCity === reviewed.expectedSourceCity, `${reviewed.ref}: 市区町村が一致しません`);
    assert(String(properties.sourceParkName || "").includes(reviewed.expectedSourceName), `${reviewed.ref}: 公園名が一致しません`);
    assert(["Polygon", "MultiPolygon"].includes(source.geometry?.type), `${reviewed.ref}: 区域形状がありません`);
    features.push({
      type: "Feature",
      properties: {
        potaRef: reviewed.ref,
        nameJa: reviewed.nameJa,
        nameEn: reviewed.nameEn || properties.nameEn,
        authority,
        boundaryStatus: "公的GIS・公式公園情報との照合済み（公式区域判定対象）",
        boundarySource: "国土交通省「都市計画決定GISデータ（令和7年度）」都市公園・緑地",
        boundaryScaleNote: "都市計画決定区域を使用。現地の供用区域やPOTA規則上の有効区域と差がある可能性があるため、境界付近は注意表示します。",
        cautionMeters: 75,
        sourceParkName: properties.sourceParkName,
        sourcePrefecture: properties.sourcePrefecture,
        sourceCity: properties.sourceCity,
        officialParkUrl,
        officialGisUrl,
        reviewNote,
        importedPolygonCount: countPolygons(source.geometry),
      },
      geometry: source.geometry,
    });
  }
  assert(features.every(feature => feature.properties.authority && feature.properties.officialParkUrl && feature.properties.reviewNote), `${region.id}: 公式照合情報が不足しています`);
  const collection = {
    type: "FeatureCollection",
    metadata: {
      title: `超軽量ログ Ver.1.10 POTA公式区域・${region.label}`,
      status: "公的GISと公式公園情報を照合した区域だけを実判定に使用",
      source: "国土交通省 都市計画決定GISデータ（令和7年度）",
      promotionConfig: configFile,
    },
    features,
  };
  const serialized = `${JSON.stringify(collection)}\n`;
  const output = resolveRoot(region.output);
  if (checkOnly) {
    assert(fs.existsSync(output), `${region.output}: 出力ファイルがありません`);
    assert(fs.readFileSync(output, "utf8") === serialized, `${region.output}: 設定から作り直した内容と一致しません`);
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized, "utf8");
  }
  console.log(`${checkOnly ? "検査成功" : "作成完了"}: ${region.label} ${features.length}件`);
}
