import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("gsi-elevation-provider.js", "utf8"), context);
const provider = context.window.GsiElevationProvider;
if (provider.decodeElevationRgb(0, 0, 1) !== 0.01) throw new Error("正標高のRGB変換が不正です");
if (provider.decodeElevationRgb(255, 255, 255) !== -0.01) throw new Error("負標高のRGB変換が不正です");
if (provider.decodeElevationRgb(128, 0, 0) !== null) throw new Error("欠損値のRGB変換が不正です");
if (provider.SOURCES.map(source => source.id).join(",") !== "DEM1A,DEM5A,DEM5B,DEM5C,DEM10B") throw new Error("標高データの優先順が不正です");
for (const [latitude, longitude] of [[35.6812, 139.7671], [43.0642, 141.3469], [26.2124, 127.6809]]) {
  for (const source of provider.SOURCES) {
    const position = provider.tilePosition(latitude, longitude, source.zoom);
    if (position.pixelX < 0 || position.pixelX > 255 || position.pixelY < 0 || position.pixelY > 255) throw new Error("タイル内座標が不正です");
    const url = provider.tileUrl(source, position);
    if (!url.includes(`/${source.zoom}/${position.tileX}/${position.tileY}.png`)) throw new Error("標高タイルURLが不正です");
  }
}
if (provider.CACHE_LIMIT !== 128) throw new Error("保存上限が不正です");
console.log("検査成功: RGB標高変換・5段階フォールバック・タイル座標・保存上限");
