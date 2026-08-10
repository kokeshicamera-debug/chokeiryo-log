"""日本のOSM PBFから、POTA代表地点を含む公園・保護区域だけを抽出する。
使い方: python extract-pota-candidates-from-osm-pbf.py <japan.osm.pbf> <POTA.csv> <既存候補.geojson> <出力.geojson>
出力は © OpenStreetMap contributors / ODbL。POTA公式境界ではなく候補としてのみ使用する。
"""
import csv, json, math, os, sys
import osmium

SOURCE = "© OpenStreetMap contributors / ODbL"

def point_in_ring(point, ring):
    inside = False
    for index, current in enumerate(ring):
        previous = ring[index - 1]
        if ((current[1] > point[1]) != (previous[1] > point[1]) and
            point[0] < (previous[0] - current[0]) * (point[1] - current[1]) / ((previous[1] - current[1]) or 1e-20) + current[0]):
            inside = not inside
    return inside

def contains(point, geometry):
    polygons = geometry.get("coordinates", []) if geometry.get("type") == "MultiPolygon" else [geometry.get("coordinates", [])]
    for polygon in polygons:
        if polygon and point_in_ring(point, polygon[0]) and not any(point_in_ring(point, hole) for hole in polygon[1:]):
            return True
    return False

def bounds(geometry):
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    points = [point for polygon in polygons for ring in polygon for point in ring]
    return min(point[0] for point in points), min(point[1] for point in points), max(point[0] for point in points), max(point[1] for point in points)

def area_size(geometry):
    left, bottom, right, top = bounds(geometry)
    return (right - left) * (top - bottom)

def is_park(tags):
    return tags.get("leisure") == "park" or tags.get("boundary") in {"national_park", "protected_area"} or bool(tags.get("protect_class")) or tags.get("landuse") == "recreation_ground"

with open(sys.argv[2], encoding="utf-8") as file:
    catalog = {row["reference"]: row for row in csv.DictReader(file)}
existing = json.load(open(sys.argv[3], encoding="utf-8"))
features = {feature["properties"]["potaRef"]: feature for feature in existing.get("features", [])}
targets = {ref: (float(row["longitude"]), float(row["latitude"])) for ref, row in catalog.items() if ref not in features}

# 既に公的GISなどで候補を持つ公園は、OSM候補として重複させない。
for index_path in sys.argv[5:]:
    with open(index_path, encoding="utf-8") as file:
        known = json.load(file)
    for park in known.get("parks", []):
        targets.pop(park.get("ref"), None)
for reference in {"JP-0016", "JP-1292", "JP-1293"}:
    targets.pop(reference, None)

# 全国の面を一つずつ全POTA地点と比較すると非常に遅いため、0.25度の格子で
# 近くの候補地点だけを探す。
GRID_SIZE = 0.25
target_grid = {}
for ref, point in targets.items():
    cell = (math.floor(point[0] / GRID_SIZE), math.floor(point[1] / GRID_SIZE))
    target_grid.setdefault(cell, []).append((ref, point))

def nearby_targets(left, bottom, right, top):
    possible = []
    for longitude in range(math.floor(left / GRID_SIZE), math.floor(right / GRID_SIZE) + 1):
        for latitude in range(math.floor(bottom / GRID_SIZE), math.floor(top / GRID_SIZE) + 1):
            possible.extend(target_grid.get((longitude, latitude), ()))
    return [(ref, point) for ref, point in possible if left <= point[0] <= right and bottom <= point[1] <= top]

class Parks(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.factory = osmium.geom.GeoJSONFactory()
        self.count = 0
        self.scanned = 0
    def area(self, area):
        self.scanned += 1
        if self.scanned % 100000 == 0:
            print(f"checked areas: {self.scanned:,} / new candidates: {self.count}", flush=True)
        tags = dict(area.tags)
        if not is_park(tags): return
        try: geometry = json.loads(self.factory.create_multipolygon(area))
        except Exception: return
        try: left, bottom, right, top = bounds(geometry)
        except Exception: return
        possible = nearby_targets(left, bottom, right, top)
        for ref, point in possible:
            if not contains(point, geometry): continue
            current = features.get(ref)
            if current and area_size(current["geometry"]) >= area_size(geometry): continue
            row = catalog[ref]
            features[ref] = {"type":"Feature", "properties":{"potaRef":ref,"nameEn":row["name"],"boundarySource":"OpenStreetMap contributors / ODbL","source":SOURCE,"osmType":"area","osmId":str(area.id),"osmName":tags.get("name", tags.get("name:en", "")),"boundaryStatus":"OpenStreetMap公園・保護区域候補（POTA公式境界ではありません）"}, "geometry":geometry}
            self.count += 1
            print(f"候補: {ref} {row['name']}", flush=True)

handler = Parks()
handler.apply_file(sys.argv[1], locations=True)
collection = {"type":"FeatureCollection","attribution":"© OpenStreetMap contributors","licence":"ODbL-1.0","features":[features[ref] for ref in sorted(features)]}
with open(sys.argv[4], "w", encoding="utf-8") as file: json.dump(collection, file, ensure_ascii=False, separators=(",", ":"))
print(f"完了: 合計 {len(features)}件（今回更新 {handler.count}件）")
