import fs from "node:fs";
import zlib from "node:zlib";

// index.html に同梱している全国POTA一覧を、照合用CSVへ書き出します。
// 使い方:
// node export-embedded-pota-catalog.mjs <index.html> <出力.csv>

const [htmlFile, outputFile] = process.argv.slice(2);
if (!outputFile) throw new Error("使い方: node export-embedded-pota-catalog.mjs <index.html> <出力.csv>");

const html = fs.readFileSync(htmlFile, "utf8");
const match = html.match(/const JAPAN_PROGRAM_DATA_PARTS=\s*(\[[\s\S]*?\]);\s*\n\s*async function decodeJapanProgramData/u);
if (!match) throw new Error("index.html 内のPOTA/SOTA同梱データを見つけられません");

const parts = JSON.parse(match[1]);
const data = JSON.parse(zlib.gunzipSync(Buffer.from(parts.join(""), "base64")).toString("utf8"));
const escapeCsv = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
const rows = [["reference", "name", "entityName", "latitude", "longitude"]];
for (const park of data.pota || []) {
  const [reference, name, latitude, longitude] = park;
  if (!/^JP-\d{4}$/u.test(reference || "")) continue;
  rows.push([reference, name || "", "Japan", latitude ?? "", longitude ?? ""]);
}
fs.mkdirSync((outputFile.match(/^(.*)[\\/]/u) || ["", "."])[1] || ".", { recursive: true });
fs.writeFileSync(outputFile, `${rows.map(row => row.map(escapeCsv).join(",")).join("\n")}\n`, "utf8");
console.log(`完了: ${rows.length - 1} 件の日本POTA一覧を書き出しました`);
