/* 町字の代表点から、現在地に最も近い町字を求める（境界判定ではなく推定）。 */
(function () {
  "use strict";
  async function load(url) {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error("町字住所データを読み込めませんでした: " + response.status);
    return response.json();
  }
  function nearest(latitude, longitude, municipalityCode, data) {
    const points = data?.towns?.[municipalityCode];
    if (!points?.length) return null;
    const latitudeScale = Math.cos(latitude * Math.PI / 180);
    let closest = null;
    let smallest = Infinity;
    for (const point of points) {
      const northSouth = point[0] - latitude;
      const eastWest = (point[1] - longitude) * latitudeScale;
      const squared = northSouth * northSouth + eastWest * eastWest;
      if (squared < smallest) { smallest = squared; closest = point; }
    }
    return closest ? { town: closest[2], koaza: closest[3], distanceMeters: Math.round(Math.sqrt(smallest) * 111320) } : null;
  }
  window.OfflineTownEngine = { load, nearest };
}());
