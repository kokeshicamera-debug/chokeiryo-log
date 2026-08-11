import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const worker = fs.readFileSync("sw.js", "utf8");
const required = [
  [html.includes('src="gps-position-controller.js"'), "GPS品質判定が画面へ読み込まれていません"],
  [html.includes("enableHighAccuracy:false,timeout:4000,maximumAge:300000"), "高速な簡易位置取得がありません"],
  [html.includes("enableHighAccuracy:true,timeout:15000,maximumAge:30000"), "高精度位置取得がありません"],
  [html.includes("pendingLocationRequests>0"), "二段階取得の片方を待つ処理がありません"],
  [html.includes("notificationSafe&&hasPotaNotificationBaseline"), "POTA通知抑止が接続されていません"],
  [html.includes("notificationSafe&&evaluation.notificationSafe&&hasSotaNotificationBaseline"), "SOTA通知抑止が接続されていません"],
  [worker.includes('"./gps-position-controller.js"'), "GPS品質判定が圏外保存に含まれていません"],
];
for (const [valid, message] of required) if (!valid) throw new Error(message);

console.log("検査成功: 二段階GPS・POTA/SOTA通知抑止・圏外保存");
