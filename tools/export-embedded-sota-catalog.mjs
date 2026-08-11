import fs from "node:fs";
import zlib from "node:zlib";

// index.html に同梱中のSOTA公式サミット情報を、地形判定用JSONへ書き出します。
// 使い方: node tools/export-embedded-sota-catalog.mjs [index.html] [出力.json] [--check]

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const files = args.filter(arg => !arg.startsWith("--"));
const htmlFile = files[0] || "index.html";
const outputFile = files[1] || "data/sota-japan-official-summits.json";
const html = fs.readFileSync(htmlFile, "utf8");
const match = html.match(/const JAPAN_PROGRAM_DATA_PARTS=\s*(\[[\s\S]*?\]);\s*\n\s*async function decodeJapanProgramData/u);
if (!match) throw new Error("index.html 内のPOTA/SOTA同梱データを見つけられません");
const embedded = JSON.parse(zlib.gunzipSync(Buffer.from(JSON.parse(match[1]).join(""), "base64")).toString("utf8"));
const summits = (embedded.sota || [])
  .filter(row => /^JA\//u.test(row[0] || ""))
  .map(row => ({ reference: row[0], name: row[1] || "", latitude: row[2], longitude: row[3], altitudeMeters: row[4] }))
  .sort((a, b) => a.reference.localeCompare(b.reference));
const invalid = summits.filter(summit => !Number.isFinite(summit.latitude) || !Number.isFinite(summit.longitude) || !Number.isFinite(summit.altitudeMeters));
if (invalid.length) throw new Error(`座標または標高が不正なサミットがあります: ${invalid[0].reference}`);
const result = {
  version: 1,
  association: "Japan (JA)",
  source: "SOTA Summits List",
  sourceUrl: "https://storage.sota.org.uk/summitslist.csv",
  activationZoneVerticalMeters: 25,
  note: "index.htmlに同梱したSOTA公式一覧から再生成。25m判定には別途、連続した地形標高データが必要です。",
  summits,
};
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (checkOnly) {
  if (!fs.existsSync(outputFile) || fs.readFileSync(outputFile, "utf8") !== serialized) throw new Error("SOTA公式一覧JSONが同梱データと一致しません");
} else {
  fs.writeFileSync(outputFile, serialized, "utf8");
}
console.log(`${checkOnly ? "検査成功" : "保存完了"}: 日本SOTA公式サミット ${summits.length}件`);
