import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("gps-position-controller.js", "utf8"), context);
const controller = context.window.GpsPositionController;
const now = 200000;
const precise = { latitude: 35, longitude: 138, accuracy: 12, timestamp: now - 1000 };
const approximate = { latitude: 35, longitude: 138, accuracy: 180, timestamp: now - 500 };
const old = { latitude: 35, longitude: 138, accuracy: 5, timestamp: now - 180000 };

if (!controller.assess(precise, now).notificationSafe) throw new Error("新しい高精度位置で通知できません");
if (controller.assess(approximate, now).notificationSafe) throw new Error("簡易位置で通知が抑止されません");
if (controller.assess(old, now).notificationSafe) throw new Error("古い位置で通知が抑止されません");
if (!controller.shouldReplace(approximate, precise, now)) throw new Error("高精度位置へ更新できません");
if (controller.shouldReplace(precise, approximate, now)) throw new Error("簡易位置が高精度位置を上書きします");
if (controller.shouldReplace(precise, { ...approximate, timestamp: now + 5000 }, now + 5000)) throw new Error("遅れて返った簡易位置が高精度位置を上書きします");
if (!controller.shouldReplace(old, approximate, now)) throw new Error("古い位置から新しい簡易位置へ更新できません");
if (controller.normalize({ coords: { latitude: 35, longitude: 138, accuracy: 20 }, timestamp: now }).timestamp !== now) throw new Error("ブラウザ位置情報を変換できません");

console.log("検査成功: 高精度・簡易位置・古い位置・上書き防止");
