import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("sota-runtime-controller.js", "utf8"), context);
const controller = context.window.SotaRuntimeController;
const summitItem = { id: "JA/KN-001", name: "検査山", latitude: 35, longitude: 138, altitude: 1000 };
const position = { latitude: 35.001, longitude: 138, accuracy: 10 };
const match = { summit: controller.toCatalog([summitItem]).summits[0], horizontalMeters: 111 };
const engine = {
  nearbySummits: () => [match],
  classify: (candidate, terrain) => {
    if (terrain.elevationMeters < 975) return { ...candidate, thresholdMeters: 975, state: "outside-elevation" };
    if (terrain.connectedToSummit === true) return { ...candidate, thresholdMeters: 975, state: "confirmed" };
    if (terrain.connectedToSummit === false) return { ...candidate, thresholdMeters: 975, state: "outside-disconnected" };
    return { ...candidate, thresholdMeters: 975, state: "needs-connectivity" };
  },
};
const elevations = { getElevation: async () => ({ elevationMeters: 980, elevationUncertaintyMeters: 1 }) };
const connectivity = {
  sample: async () => ({ grid: {}, samples: [] }),
  analyze: () => ({ connectedToSummit: true }),
};

const inaccurate = await controller.evaluate({ ...position, accuracy: 120 }, [summitItem], { engine, elevations, connectivity });
if (inaccurate.state !== "needs-accuracy" || inaccurate.notificationSafe) throw new Error("簡易位置で通知が抑止されません");
if (!controller.format(inaccurate).includes(summitItem.id) || !controller.format(inaccurate).includes(summitItem.name)) throw new Error("簡易位置でも公式サミットを案内できません");

const confirmed = await controller.evaluate(position, [summitItem], { engine, elevations, connectivity });
if (confirmed.state !== "confirmed" || confirmed.confirmed[0].id !== summitItem.id || !confirmed.notificationSafe) throw new Error("25m区域内を確定できません");

const disconnected = await controller.evaluate(position, [summitItem], { engine, elevations, connectivity: { ...connectivity, analyze: () => ({ connectedToSummit: false }) } });
if (disconnected.results[0].state !== "outside-disconnected" || disconnected.confirmed.length) throw new Error("鞍部分断を区域外にできません");

const uncertain = await controller.evaluate(position, [summitItem], { engine, elevations, connectivity: { ...connectivity, analyze: () => ({ connectedToSummit: null }) } });
if (uncertain.notificationSafe || uncertain.state !== "uncertain") throw new Error("未確定時の通知が抑止されません");

const unavailable = await controller.evaluate(position, [summitItem], { engine, elevations: { getElevation: async () => { throw new Error("offline"); } }, connectivity });
if (unavailable.notificationSafe || unavailable.state !== "needs-terrain") throw new Error("標高未取得時の通知が抑止されません");
if (!controller.format(unavailable).includes(summitItem.id) || !controller.format(unavailable).includes("山頂座標まで直線距離111m")) throw new Error("標高未取得でも公式サミットと直線距離を案内できません");

console.log("検査成功: GPS精度・25m区域内・鞍部分断・未確定・圏外通知抑止");
