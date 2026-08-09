/* JARL市郡区番号表と、オフライン行政区域判定の結果を照合する。 */
(function () {
  "use strict";
  function key(value) {
    return String(value || "").replace(/[市区郡町村]$/u, "").replace(/[ヶケ]/g, "ケ").replace(/[（(].*?[）)]/g, "").replace(/\s/g, "");
  }
  async function load(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error("JCC/JCG番号表を読み込めませんでした: " + response.status);
    return response.json();
  }
  function find(municipality, data) {
    if (!municipality || !data) return null;
    const prefecture = municipality.prefecture;
    const cities = data.cities?.[prefecture] || {};
    const counties = data.counties?.[prefecture] || {};
    const city = cities[key(municipality.municipality)];
    if (city) return { type: "JCC", code: city };
    if (prefecture === "東京都" && municipality.municipality.endsWith("区") && cities["東京23"]) {
      return { type: "JCC", code: cities["東京23"] };
    }
    const county = counties[key(municipality.county)];
    if (county) return { type: "JCG", code: county };
    return null;
  }
  window.OfflineJccEngine = { load, find };
}());
