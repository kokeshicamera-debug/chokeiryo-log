import fs from "node:fs";

const outputFile = process.argv[2];
if (!outputFile) throw new Error("使い方: node build-jcc-index.mjs <出力JSON>");

const prefectures = [
  "北海道","青森県","岩手県","秋田県","山形県","宮城県","福島県","新潟県","長野県","東京都","神奈川県","千葉県","埼玉県","茨城県","栃木県","群馬県","山梨県","静岡県","岐阜県","愛知県","三重県","京都府","滋賀県","奈良県","大阪府","和歌山県","兵庫県","富山県","福井県","石川県","岡山県","島根県","山口県","鳥取県","広島県","香川県","徳島県","愛媛県","高知県","福岡県","佐賀県","長崎県","熊本県","大分県","宮崎県","鹿児島県","沖縄県"
];

function decode(buffer) { return new TextDecoder("shift_jis").decode(buffer); }
function text(value) {
  return value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
}
function key(value) {
  return String(value || "").replace(/[市区郡町村]$/u, "").replace(/[ヶケ]/g, "ケ").replace(/[（(].*?[）)]/g, "").replace(/\s/g, "");
}

const cities = {};
const counties = {};
for (let index = 1; index <= 47; index += 1) {
  const number = String(index).padStart(2, "0");
  const response = await fetch(`https://www.jarl.org/Japanese/A_Shiryo/A-2_jcc-jcg/${number}.htm`);
  if (!response.ok) throw new Error(`JARL番号表を取得できません: ${number}`);
  const html = decode(await response.arrayBuffer());
  const prefecture = prefectures[index - 1];
  cities[prefecture] = {};
  counties[prefecture] = {};
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => text(match[1]));
    if (cells.length < 3) continue;
    const id = cells[0].replace(/[^0-9]/g, "");
    const name = cells[2].replace(/^※/, "").trim();
    if (!name || !/^[0-9]+$/.test(id)) continue;
    if (id.length === 4) cities[prefecture][key(name)] = id;
    if (id.length === 5) counties[prefecture][key(name)] = id;
  }
}

fs.writeFileSync(outputFile, `${JSON.stringify({
  version: "JARL-current",
  source: "JARL 市郡区番号リストを参照して作成",
  cities,
  counties
})}\n`, "utf8");
console.log(`JCC: ${Object.values(cities).reduce((total, item) => total + Object.keys(item).length, 0)} 件`);
console.log(`JCG: ${Object.values(counties).reduce((total, item) => total + Object.keys(item).length, 0)} 件`);
