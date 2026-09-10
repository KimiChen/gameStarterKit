#!/usr/bin/env python3
"""A3：森之国布局解码 → 本 kit 的 forest-layout.json + 区域生态提示（供 terrain.json 策展）。

输入（仓外逆向学习包，只读）：
  - mapinfowrap_11_mspack.bytes（MessagePack，77 区 1803 实体）
  - Config/Map/map_area.csv（区域名）
  - Config/Map/entity_map_display.csv（EntityClassId → DisplayPath 外观）
输出：apps/kits/slg/data/forest-layout.json
  { "bounds": {...}, "decorations": [{x,y,kind}], "landmarks": [{name,x,y}], "biomes": [{name,terrain,cx,cy}] }
坐标：森之国格（x∈[10,218], y∈[26,161]）1:1 平移到本图中心（1500×1500，北向 y 增大与本 kit 一致）。
"""
import collections
import csv
import json
import msgpack

SRC = "/Volumes/KimData/apksource/sourceVersion/zjcs-1.2.6/yoo-assets/embedded-decrypted/Assets/Config"
OUT = "/Volumes/KimData/work/worldMap/zlb_gameStarterKit/apps/kits/slg/data/forest-layout.json"
MAP = 1500

raw = open(f"{SRC}/MapInfoWrap/mapinfowrap_11_mspack.bytes", "rb").read()
regions = msgpack.unpackb(raw[2:], strict_map_key=False)[1]

area_names = {}
for r in list(csv.reader(open(f"{SRC}/Map/map_area.csv", encoding="utf-8-sig")))[2:]:
    if r and r[0] == "11" and r[1].isdigit():
        area_names[int(r[1])] = r[2]

display = {}
for r in list(csv.reader(open(f"{SRC}/Map/entity_map_display.csv", encoding="utf-8-sig")))[2:]:
    if r and r[0].isdigit():
        display[int(r[0])] = (r[5], r[8] if len(r) > 8 else "")

# 实体 → 装饰类别（mapArt 的森之国六类）。怪物/NPC 不进装饰层（会动的东西不是摆件）。
def classify(entity_class_id: int, refresh_group: int) -> str | None:
    path, memo = display.get(entity_class_id, ("", ""))
    if "WorldMonster" in path or "WorldNPC" in path or "WorldMapCharacter" in path:
        return None
    if "WorldDoor" in path or "Transport" in path:
        return "portal"
    if "WorldBonus" in path or "BonusTouch" in path or "Reward" in path:
        return "chest"
    if "WorldGamePlay" in path or "Puzzle" in path or "Stele" in path:
        return "stele"
    if "WorldBuilding" in path or "Building" in path:
        return "ruin"
    if path:
        return "tree"
    return "tree" if refresh_group == 0 else "vine"  # 未解析的静态物件按植被兜底

xs, ys = [], []
for ents in regions.values():
    for e in ents:
        xs.append(e[4][0][0])
        ys.append(e[4][0][1])
min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
# 原生跨度过小（209×136），放大 5 倍复刻到本图中央（约 1045×680）
SCALE = 5
span_x = (max_x - min_x) * SCALE
span_y = (max_y - min_y) * SCALE
off_x = (MAP - span_x) // 2 - min_x * SCALE
off_y = (MAP - span_y) // 2 - min_y * SCALE
def tx(v): return v * SCALE

decorations = []
skipped = 0
for rid in sorted(regions):
    for e in regions[rid]:
        kind = classify(e[5][0] if isinstance(e[5], list) and e[5] else 0, e[1])
        if kind is None:
            skipped += 1
            continue
        decorations.append({"x": tx(e[4][0][0]) + off_x, "y": tx(e[4][0][1]) + off_y, "kind": kind})

# 区域质心 → 地标候选与生态提示
centroids = {}
for rid, ents in regions.items():
    if not ents:
        continue
    cx = sum(tx(e[4][0][0]) for e in ents) / len(ents) + off_x
    cy = sum(tx(e[4][0][1]) for e in ents) / len(ents) + off_y
    centroids[rid] = (round(cx), round(cy), len(ents))

def biome_of(name: str) -> str:
    if any(k in name for k in ("湖", "海岸", "海角", "海边", "岛", "远航")):
        return "water" if "湖" in name else "sand"
    if any(k in name for k in ("山谷", "峡谷", "崖", "石窟", "巢穴", "大本营")):
        return "rock"
    if any(k in name for k in ("密林", "森林", "树林", "回廊", "花谷", "花海", "蘑森", "蘑菇")):
        return "forest"
    return "grass"

biomes = [{"name": area_names.get(rid, f"区域{rid}"), "terrain": biome_of(area_names.get(rid, "")),
           "cx": c[0], "cy": c[1], "entities": c[2]} for rid, c in sorted(centroids.items())]

# 地标：归木村（10）、世界树半岛（17）、气泡湖（27）、狂花海岸（15）、蛛后巢穴（68）
LANDMARK_IDS = {10: "village", 17: "tree", 27: "lake", 15: "coast", 68: "den"}
landmarks = [{"name": area_names[rid], "x": centroids[rid][0], "y": centroids[rid][1], "tag": LANDMARK_IDS[rid]}
             for rid in LANDMARK_IDS if rid in centroids]

out = {
    "source": "zjcs-1.2.6 mapinfowrap_11 + map_area.csv + entity_map_display.csv（森之国，地图 ClassId 11）",
    "mapSize": MAP,
    "sourceBounds": {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y},
    "scale": SCALE, "offset": {"x": off_x, "y": off_y},
    "counts": {"entities": sum(len(v) for v in regions.values()), "decorations": len(decorations), "skipped": skipped},
    "landmarks": landmarks,
    "biomes": biomes,
    "decorations": decorations,
}
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("decorations:", len(decorations), "| skipped:", skipped, "| landmarks:", landmarks)
print("biome counts:", collections.Counter(b["terrain"] for b in biomes))
