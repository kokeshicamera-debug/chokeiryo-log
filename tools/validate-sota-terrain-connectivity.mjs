import fs from "node:fs";
import vm from "node:vm";

const context = { window: {}, Uint8Array, Int32Array };
vm.runInNewContext(fs.readFileSync("sota-terrain-connectivity.js", "utf8"), context);
const terrain = context.window.SotaTerrainConnectivity;
const grid = {
  rows: 5,
  columns: 5,
  points: Array.from({ length: 25 }, () => ({})),
  spacingMeters: 20,
  summitIndex: 10,
  positionIndex: 14,
};
const high = () => ({ elevationMeters: 980, elevationUncertaintyMeters: 1 });
const low = () => ({ elevationMeters: 960, elevationUncertaintyMeters: 1 });
const threshold = 975;

const ridge = Array.from({ length: 25 }, low);
for (const index of [10, 11, 12, 13, 14]) ridge[index] = high();
if (terrain.analyze(grid, ridge, threshold).state !== "connected") throw new Error("連続した尾根を判定できません");

const saddle = ridge.map(sample => ({ ...sample }));
saddle[12] = low();
if (terrain.analyze(grid, saddle, threshold).state !== "disconnected") throw new Error("低い鞍部による分断を判定できません");

const uncertain = ridge.map(sample => ({ ...sample }));
uncertain[12] = { elevationMeters: 975, elevationUncertaintyMeters: 2 };
if (terrain.analyze(grid, uncertain, threshold).state !== "uncertain") throw new Error("標高誤差を未確定として扱えません");

const missing = ridge.map(sample => ({ ...sample }));
missing[12] = { elevationMeters: null };
if (terrain.analyze(grid, missing, threshold).state !== "needs-terrain") throw new Error("欠けた標高を未確定として扱えません");

const diagonalOnly = Array.from({ length: 9 }, low);
diagonalOnly[0] = high();
diagonalOnly[4] = high();
diagonalOnly[8] = high();
const diagonalGrid = { rows: 3, columns: 3, points: Array.from({ length: 9 }, () => ({})), spacingMeters: 20, summitIndex: 0, positionIndex: 8 };
if (terrain.analyze(diagonalGrid, diagonalOnly, threshold).state !== "disconnected") throw new Error("角だけで接する地形を連続扱いしています");

const large = terrain.buildGrid({ latitude: 35, longitude: 138 }, { latitude: 35.05, longitude: 138.05 }, { maxCells: 40000 });
if (large.points.length > 41000) throw new Error("地形格子の安全上限を超えています");
if (!(large.spacingMeters >= 20)) throw new Error("地形格子の間隔が不正です");

console.log("検査成功: 連続尾根・鞍部分断・標高誤差・欠損・格子上限");
