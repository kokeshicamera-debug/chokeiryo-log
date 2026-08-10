import fs from "node:fs";

// OpenStreetMapの公園・保護区域を、未照合POTAの代表地点と重なるものだけに絞り込む。
// 使い方:
// node build-pota-candidates-from-osm.mjs <POTA一覧.csv> <既存索引.json...> <出力.geojson> <進捗.json> <報告.json> [一回の照会数]

const [catalogFile, ...rest] = process.argv.slice(2);
if (rest.length < 5) throw new Error("使い方: node build-pota-candidates-from-osm.mjs <POTA一覧.csv> <既存索引.json...> <出力.geojson> <進捗.json> <報告.json> [一回の照会数]");
let batchSize = 12;
if (/^\d+$/u.test(rest.at(-1))) batchSize = Math.max(1, Number(rest.pop()));
const [outputFile, progressFile, reportFile] = rest.splice(-3);

function csvLine(line) {
  const values = []; let value = "", quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') { if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted; }
    else if (character === "," && !quoted) { values.push(value); value = ""; } else value += character;
  }
  values.push(value); return values;
}
function catalog(file) {
  return fs.readFileSync(file, "utf8").trim().split(/\r?\n/u).slice(1).map(line => {
    const [ref, nameEn, entityName, latitude, longitude] = csvLine(line);
    return { ref, nameEn, entityName, latitude: Number(latitude), longitude: Number(longitude) };
  }).filter(item => /^JP-\d{4}$/u.test(item.ref) && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}
function coveredRefs(indexFiles) {
  const refs = new Set(["JP-0016", "JP-1292", "JP-1293"]);
  for (const file of indexFiles) for (const park of JSON.parse(fs.readFileSync(file, "utf8")).parks || []) if (park.ref) refs.add(park.ref);
  return refs;
}
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (((yi > point[1]) !== (yj > point[1])) && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi) inside = !inside;
  }
  return inside;
}
function stitch(segments) {
  const remaining = segments.filter(segment => segment.length > 2).map(segment => [...segment]);
  const rings = [];
  while (remaining.length) {
    let ring = remaining.pop(), changed = true;
    while (changed && ring.length > 2 && !(ring[0].lat === ring.at(-1).lat && ring[0].lon === ring.at(-1).lon)) {
      changed = false;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index], last = ring.at(-1), first = candidate[0], end = candidate.at(-1);
        if (last.lat === first.lat && last.lon === first.lon) { ring = ring.concat(candidate.slice(1)); remaining.splice(index, 1); changed = true; break; }
        if (last.lat === end.lat && last.lon === end.lon) { ring = ring.concat([...candidate].reverse().slice(1)); remaining.splice(index, 1); changed = true; break; }
      }
    }
    if (ring.length > 3 && ring[0].lat === ring.at(-1).lat && ring[0].lon === ring.at(-1).lon) rings.push(ring.map(point => [point.lon, point.lat]));
  }
  return rings;
}
function rings(element) {
  if (element.type === "way" && Array.isArray(element.geometry)) return stitch([element.geometry]);
  if (element.type === "relation") return stitch((element.members || []).filter(member => member.role !== "inner" && Array.isArray(member.geometry)).map(member => member.geometry));
  return [];
}
function isPark(element) {
  const tags = element.tags || {};
  return tags.leisure === "park" || tags.boundary === "national_park" || tags.boundary === "protected_area" || tags.protect_class || tags.landuse === "recreation_ground";
}
function featureFor(park, elements) {
  const point = [park.longitude, park.latitude];
  for (const element of elements.filter(isPark)) {
    const ring = rings(element).find(candidate => pointInRing(point, candidate));
    if (!ring) continue;
    return { type: "Feature", properties: { potaRef: park.ref, nameEn: park.nameEn, source: "© OpenStreetMap contributors / ODbL", boundarySource: "OpenStreetMap contributors / ODbL", osmType: element.type, osmId: element.id, osmName: element.tags?.name || element.tags?.["name:en"] || "", boundaryStatus: "OpenStreetMap公園・保護区域候補（POTA公式境界ではありません）" }, geometry: { type: "Polygon", coordinates: [ring] } };
  }
  return null;
}
function query(parks) {
  const filters = parks.flatMap(park => ["[leisure=park]", "[boundary=national_park]", "[boundary=protected_area]", "[protect_class]", "[landuse=recreation_ground]"].map(filter => `nwr(around:6000,${park.latitude},${park.longitude})${filter};`)).join("");
  return `[out:json][timeout:180];(${filters});out tags geom;`;
}
async function overpass(ql) {
  const response = await fetch("https://overpass.kumi.systems/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "ChokeiryoLog/1.10 (offline POTA candidate builder)" }, body: `data=${encodeURIComponent(ql)}` });
  if (!response.ok) throw new Error(`Overpass ${response.status}: ${(await response.text()).slice(0, 160)}`);
  return response.json();
}

const parks = catalog(catalogFile), covered = coveredRefs(rest);
const prior = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, "utf8")) : { completed: [], features: [], failures: [] };
for (const feature of prior.features || []) {
  feature.properties = { ...feature.properties, boundarySource: feature.properties?.boundarySource || "OpenStreetMap contributors / ODbL" };
}
const completed = new Set(prior.completed || []), byRef = new Map((prior.features || []).map(feature => [feature.properties?.potaRef, feature])), failures = [...(prior.failures || [])];
const allTargets = parks.filter(park => !covered.has(park.ref) && !completed.has(park.ref));
const maximum = Number(process.env.POTA_OSM_MAX || 0);
const targets = maximum > 0 ? allTargets.slice(0, maximum) : allTargets;
console.log(`未照合 ${targets.length}件をOpenStreetMapから確認します（既存候補 ${byRef.size}件）。`);
for (let start = 0; start < targets.length; start += batchSize) {
  const batch = targets.slice(start, start + batchSize);
  try {
    const result = await overpass(query(batch));
    for (const park of batch) { const feature = featureFor(park, result.elements || []); if (feature) byRef.set(park.ref, feature); completed.add(park.ref); }
    console.log(`${Math.min(start + batch.length, targets.length)}/${targets.length}件: 候補 ${byRef.size}件`);
  } catch (error) { console.warn(`${batch.map(park => park.ref).join(", ")}: ${error.message}`); failures.push({ refs: batch.map(park => park.ref), message: error.message, at: new Date().toISOString() }); }
  fs.writeFileSync(progressFile, `${JSON.stringify({ version: 1, source: "© OpenStreetMap contributors / ODbL", generatedAt: new Date().toISOString(), completed: [...completed], features: [...byRef.values()], failures })}\n`, "utf8");
  await new Promise(resolve => setTimeout(resolve, 1200));
}
const features = [...byRef.values()].sort((left, right) => left.properties.potaRef.localeCompare(right.properties.potaRef));
fs.writeFileSync(outputFile, `${JSON.stringify({ type: "FeatureCollection", attribution: "© OpenStreetMap contributors", licence: "ODbL-1.0", generatedAt: new Date().toISOString(), features })}\n`, "utf8");
fs.writeFileSync(reportFile, `${JSON.stringify({ version: 1, attribution: "© OpenStreetMap contributors", licence: "ODbL-1.0", totalJapanPota: parks.length, precovered: covered.size, targets: parks.length - covered.size, osmCandidates: features.length, stillUnmatched: parks.filter(park => !covered.has(park.ref) && !byRef.has(park.ref)).map(park => park.ref), failures }, null, 2)}\n`, "utf8");
console.log(`完了: OSM候補 ${features.length}件。`);
