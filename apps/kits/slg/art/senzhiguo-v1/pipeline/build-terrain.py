#!/usr/bin/env python3
"""森之国地理 terrain.json 生成器：读 forest-layout.json 的 biomes/landmarks，输出 1500×1500 区域矩形。

结构：默认草地 → 四边海环（水）→ 海岸带（沙滩，贴海环内侧）→ 生态矩形（林地/岩石/裸土/内陆湖）。
"""
import json

LAYOUT = "/Volumes/KimData/work/worldMap/zlb_gameStarterKit/apps/kits/slg/data/forest-layout.json"
OUT_DATA = "/Volumes/KimData/work/worldMap/zlb_gameStarterKit/apps/kits/slg/data/terrain.json"
OUT_RES = "/Volumes/KimData/work/worldMap/zlb_gameStarterKit/apps/Cocos/assets/resources/kits/slg/terrain.json"

MAP = 1500
EDGE = 120  # 海环宽度（格）

layout = json.load(open(LAYOUT))
palette = [
    {"id": 0, "color": [108, 148, 88]},    # 草地
    {"id": 1, "color": [62, 108, 66]},     # 林地
    {"id": 2, "color": [64, 118, 152]},    # 水面
    {"id": 3, "color": [96, 92, 88]},      # 岩石
    {"id": 4, "color": [196, 178, 128]},   # 沙滩
    {"id": 5, "color": [136, 106, 72]},    # 裸土
]
T = {"grass": 0, "forest": 1, "water": 2, "rock": 3, "sand": 4, "dirt": 5}

regions = []
# 四边海环（先铺水，沙滩后叠在内缘）
regions.append({"x": 0, "y": MAP - EDGE, "width": MAP, "height": EDGE, "terrain": 2})
regions.append({"x": 0, "y": 0, "width": MAP, "height": EDGE, "terrain": 2})
regions.append({"x": 0, "y": 0, "width": EDGE, "height": MAP, "terrain": 2})
regions.append({"x": MAP - EDGE, "y": 0, "width": EDGE, "height": MAP, "terrain": 2})

def clamp_rect(cx, cy, w, h, terrain):
    x = max(EDGE + 8, min(MAP - EDGE - 8 - w, round(cx - w / 2)))
    y = max(EDGE + 8, min(MAP - EDGE - 8 - h, round(cy - h / 2)))
    return {"x": x, "y": y, "width": w, "height": h, "terrain": terrain}

# 生态矩形：按区域实体量定尺寸
for b in layout["biomes"]:
    t = T[b["terrain"]]
    if t == 0:
        continue
    size = min(150, max(48, round(b["entities"] * 1.6)))
    if b["terrain"] == "sand":
        regions.append(clamp_rect(b["cx"], b["cy"], size * 2, max(40, size // 2), 4))
    elif b["terrain"] == "water":
        regions.append(clamp_rect(b["cx"], b["cy"], size, round(size * 0.75), 2))
    elif b["terrain"] == "rock":
        regions.append(clamp_rect(b["cx"], b["cy"], size, round(size * 0.85), 3))
    elif b["terrain"] == "forest":
        regions.append(clamp_rect(b["cx"], b["cy"], size, size, 1))

# 气泡湖内陆湖（战力区质心 801,624）与归木村裸土场
regions.append(clamp_rect(801, 624, 170, 120, 2))
regions.append(clamp_rect(838, 766, 90, 70, 5))

terrain = {"name": "森之国", "width": MAP, "height": MAP, "palette": palette, "regions": regions}
text = json.dumps(terrain, ensure_ascii=False, indent=2) + "\n"
open(OUT_DATA, "w").write(text)
open(OUT_RES, "w").write(text)
print("regions:", len(regions), "| water:", sum(1 for r in regions if r["terrain"] == 2),
      "| forest:", sum(1 for r in regions if r["terrain"] == 1), "| sand:", sum(1 for r in regions if r["terrain"] == 4))
