import fs from "node:fs";
import vm from "node:vm";

const catalog = JSON.parse(fs.readFileSync("data/sota-japan-official-summits.json", "utf8"));
const references = new Set();
for (const summit of catalog.summits || []) {
  if (!/^JA\/[A-Z0-9]+-\d{3}$/u.test(summit.reference || "")) throw new Error(`SOTA番号が不正です: ${summit.reference}`);
  if (references.has(summit.reference)) throw new Error(`SOTA番号が重複しています: ${summit.reference}`);
  references.add(summit.reference);
  if (!(summit.longitude >= 122 && summit.longitude <= 154 && summit.latitude >= 20 && summit.latitude <= 46)) throw new Error(`日本周辺として座標が不正です: ${summit.reference}`);
  if (!(summit.altitudeMeters > 0 && summit.altitudeMeters < 4000)) throw new Error(`標高が不正です: ${summit.reference}`);
}
const context = { window: {} };
vm.runInNewContext(fs.readFileSync("sota-activation-engine.js", "utf8"), context);
const engine = context.window.SotaActivationEngine;
const summit = catalog.summits[0];
const match = { summit, horizontalMeters: 0 };
if (engine.classify(match, {}).state !== "needs-terrain") throw new Error("地形未取得判定が不正です");
if (engine.classify(match, { elevationMeters: summit.altitudeMeters - 30 }).state !== "outside-elevation") throw new Error("25m区域外判定が不正です");
if (engine.classify(match, { elevationMeters: summit.altitudeMeters - 20 }).state !== "needs-connectivity") throw new Error("地形連続性待ち判定が不正です");
if (engine.classify(match, { elevationMeters: summit.altitudeMeters - 20, connectedToSummit: true }).state !== "confirmed") throw new Error("25m区域内判定が不正です");
if (engine.classify(match, { elevationMeters: summit.altitudeMeters - 20, connectedToSummit: false }).state !== "outside-disconnected") throw new Error("分断区域判定が不正です");
console.log(`検査成功: 日本SOTA公式サミット ${references.size}件、25m判定5状態`);
