"""Geofabrikの日本PBFを再開可能な形で一時保存する。"""
import os, sys, time, urllib.request
url = "https://download.geofabrik.de/asia/japan-latest.osm.pbf"
output = sys.argv[1] if len(sys.argv) > 1 else "data/.cache/japan-latest.osm.pbf"
log = output + ".progress.txt"
start = os.path.getsize(output) if os.path.exists(output) else 0
request = urllib.request.Request(url, headers={"Range": f"bytes={start}-"} if start else {})
with urllib.request.urlopen(request, timeout=180) as response:
    total = start + int(response.headers.get("Content-Length", "0"))
    mode = "ab" if start else "wb"
    with open(output, mode) as file:
        done = start
        while True:
            data = response.read(8 * 1024 * 1024)
            if not data: break
            file.write(data); done += len(data)
            with open(log, "w", encoding="utf-8") as progress:
                progress.write(f"{done}\n{total}\n{done / total * 100:.1f}%\n")
print("download complete", done)
