(function () {
  "use strict";
  const DEFAULT_VERTICAL_METERS = 25;
  const DEFAULT_SEARCH_METERS = 5000;

  function distanceMeters(latitude1, longitude1, latitude2, longitude2) {
    const radians = Math.PI / 180;
    const latitudeDifference = (latitude2 - latitude1) * radians;
    const longitudeDifference = (longitude2 - longitude1) * radians;
    const value = Math.sin(latitudeDifference / 2) ** 2 + Math.cos(latitude1 * radians) * Math.cos(latitude2 * radians) * Math.sin(longitudeDifference / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  async function load(url) {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) throw new Error("SOTA公式サミット情報を読み込めませんでした: " + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.summits)) throw new Error("SOTA公式サミット情報の形式が正しくありません");
    return data;
  }

  function nearbySummits(latitude, longitude, catalog, searchMeters = DEFAULT_SEARCH_METERS) {
    if (!catalog || !Array.isArray(catalog.summits)) return [];
    return catalog.summits.map(summit => ({ summit, horizontalMeters: distanceMeters(latitude, longitude, summit.latitude, summit.longitude) }))
      .filter(match => match.horizontalMeters <= searchMeters)
      .sort((a, b) => a.horizontalMeters - b.horizontalMeters);
  }

  function classify(match, terrain) {
    const verticalMeters = Number(terrain?.verticalMeters) || DEFAULT_VERTICAL_METERS;
    const thresholdMeters = match.summit.altitudeMeters - verticalMeters;
    const elevationMeters = Number(terrain?.elevationMeters);
    const elevationUncertaintyMeters = Math.max(0, Number(terrain?.elevationUncertaintyMeters) || 0);
    const result = { ...match, thresholdMeters, verticalMeters, elevationMeters: Number.isFinite(elevationMeters) ? elevationMeters : null };
    if (!Number.isFinite(elevationMeters)) return { ...result, state: "needs-terrain", reason: "地形標高が未取得です" };
    if (elevationMeters + elevationUncertaintyMeters < thresholdMeters) return { ...result, state: "outside-elevation", reason: "25m下の基準標高に届きません" };
    if (terrain?.connectedToSummit === true) return { ...result, state: "confirmed", reason: "25m区域が山頂へ連続しています" };
    if (terrain?.connectedToSummit === false) return { ...result, state: "outside-disconnected", reason: "基準標高以上でも山頂区域から分断されています" };
    return { ...result, state: "needs-connectivity", reason: "標高条件は満たす可能性がありますが、山頂との地形連続性が未確認です" };
  }

  window.SotaActivationEngine = { load, nearbySummits, classify, distanceMeters, DEFAULT_VERTICAL_METERS, DEFAULT_SEARCH_METERS };
}());
