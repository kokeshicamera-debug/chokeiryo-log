(function () {
  "use strict";

  const SEARCH_METERS = 5000;
  const MAX_GPS_ACCURACY_METERS = 50;
  const MAX_TERRAIN_CANDIDATES = 3;

  function toCatalog(items) {
    return {
      summits: (items || []).map(item => ({
        reference: item.id,
        name: item.name,
        latitude: item.latitude,
        longitude: item.longitude,
        altitudeMeters: Number(item.altitude),
      })).filter(summit => summit.reference && Number.isFinite(summit.altitudeMeters)),
    };
  }

  function notificationMatches(results) {
    return results.filter(result => result.state === "confirmed").map(result => ({
      id: result.summit.reference,
      name: result.summit.name,
      distance: result.horizontalMeters,
      officialActivationZone: true,
    }));
  }

  async function evaluate(position, items, dependencies = {}) {
    const engine = dependencies.engine || window.SotaActivationEngine;
    const elevations = dependencies.elevations || window.GsiElevationProvider;
    const connectivity = dependencies.connectivity || window.SotaTerrainConnectivity;
    const accuracy = Number(position?.accuracy);
    if (!position || !Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
      return { state: "needs-position", results: [], notificationSafe: false, message: "位置情報を取得中…" };
    }
    if (!engine) {
      return { state: "needs-terrain", results: [], notificationSafe: false, message: "公式サミット情報を確認できません" };
    }
    const nearby = engine.nearbySummits(position.latitude, position.longitude, toCatalog(items), SEARCH_METERS);
    if (!nearby.length) return { state: "outside", results: [], nearby: [], notificationSafe: true, message: "近くに公式サミットはありません" };
    if (Number.isFinite(accuracy) && accuracy > MAX_GPS_ACCURACY_METERS) {
      return { state: "needs-accuracy", results: [], nearby, notificationSafe: false, message: `GPS精度を確認中（±${Math.round(accuracy)}m・通知なし）` };
    }
    if (!elevations || !connectivity) {
      return { state: "needs-terrain", results: [], nearby, notificationSafe: false, message: "25m地形判定を準備できません（通知なし）" };
    }

    let currentElevation;
    try {
      currentElevation = await elevations.getElevation(position.latitude, position.longitude);
    } catch (error) {
      return { state: "needs-terrain", results: [], nearby, notificationSafe: false, message: "地形標高を取得できません（通知なし）" };
    }

    const results = [];
    for (const match of nearby) {
      let result = engine.classify(match, currentElevation);
      if (result.state === "needs-connectivity" && results.filter(item => item.terrainChecked).length < MAX_TERRAIN_CANDIDATES) {
        const sampled = await connectivity.sample(elevations, match.summit, position, dependencies.gridOptions || {});
        const terrain = connectivity.analyze(sampled.grid, sampled.samples, result.thresholdMeters);
        result = { ...engine.classify(match, { ...currentElevation, connectedToSummit: terrain.connectedToSummit }), terrain, terrainChecked: true };
      }
      results.push(result);
      if (results.length >= MAX_TERRAIN_CANDIDATES) break;
    }
    const confirmed = notificationMatches(results);
    const unresolved = results.some(result => result.state === "needs-terrain" || result.state === "needs-connectivity");
    return { state: confirmed.length ? "confirmed" : unresolved ? "uncertain" : "outside", results, nearby, confirmed, notificationSafe: !unresolved, currentElevation };
  }

  function formatNearby(matches) {
    return (matches || []).slice(0, 3).map(match => {
      const summit = match.summit;
      return `${summit.reference} ${summit.name}（標高${Math.round(summit.altitudeMeters)}m・山頂座標まで${Math.round(match.horizontalMeters)}m）`;
    }).join(" ／ ");
  }

  function format(evaluation) {
    if (evaluation.message && evaluation.nearby?.length) {
      return `${formatNearby(evaluation.nearby)}（最寄りの公式サミット・25m区域未確認・${evaluation.message}）`;
    }
    if (evaluation.message) return evaluation.message;
    const confirmed = evaluation.confirmed || notificationMatches(evaluation.results || []);
    if (confirmed.length) return confirmed.slice(0, 3).map(match => `${match.id} ${match.name} 25m区域内（地形確認済み）`).join(" ／ ");
    const closest = evaluation.results?.[0] || evaluation.nearby?.[0];
    if (!closest) return "近くに公式サミットはありません";
    const summit = closest.summit;
    if (closest.state === "outside-elevation") return `${summit.reference} ${summit.name} 区域外（標高条件）`;
    if (closest.state === "outside-disconnected") return `${summit.reference} ${summit.name} 区域外（鞍部で分断）`;
    return `${summit.reference} ${summit.name} 25m区域を確認中（通知なし）`;
  }

  window.SotaRuntimeController = { evaluate, format, formatNearby, notificationMatches, toCatalog, SEARCH_METERS, MAX_GPS_ACCURACY_METERS, MAX_TERRAIN_CANDIDATES };
}());
