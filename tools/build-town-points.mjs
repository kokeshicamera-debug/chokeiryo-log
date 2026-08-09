import fs from "node:fs";

const outputFile = process.argv[2];
if (!outputFile) throw new Error("使い方: node build-town-points.mjs <出力JSON>");

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === ',' && !quoted) { row.push(cell); cell = ""; }
    else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); if (row.length > 1) rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const response = await fetch("https://geolonia.github.io/japanese-addresses/latest.csv");
if (!response.ok) throw new Error(`住所データを取得できません: ${response.status}`);
const rows = parseCsv(await response.text());
const towns = {};
for (const row of rows.slice(1)) {
  const code = row[4];
  const town = row[8];
  const koaza = row[11];
  const latitude = Number(row[12]);
  const longitude = Number(row[13]);
  if (!code || !town || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  (towns[code] ||= []).push([latitude, longitude, town, koaza || ""]);
}
const data = {
  version: "Geolonia-latest",
  source: "Geolonia 住所データ（CC BY 4.0）を加工",
  attribution: "Geolonia 住所データ（CC BY 4.0）を加工",
  towns
};
fs.writeFileSync(outputFile, `${JSON.stringify(data)}\n`, "utf8");
console.log(`町字代表点: ${Object.values(towns).reduce((total, points) => total + points.length, 0)} 件`);
