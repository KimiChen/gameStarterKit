"""地形分类表。这是单源：terrain.meta.json 由此生成，TS 侧的 hexmap 面对照校验。

语义取自 三国志战略版 res_pro/terrain_attr.lua 的 LAND_TYPE 子集（sourceVersion/sgzz-2084.1768）。
"""
from __future__ import annotations

# (id, name, 中文名, RGB 预览色, 可通行)
PALETTE = [
    (0, "plain",    "平原", (137, 148, 100), True),
    (1, "forest",   "森林", (86, 112, 74),   True),
    (2, "hill",     "丘陵", (150, 148, 112), True),
    (3, "mountain", "山地", (123, 130, 126), False),
    (4, "water",    "水域", (96, 128, 138),  False),
    (5, "sea",      "海",   (62, 95, 108),   False),
    (6, "wetland",  "湿地", (112, 132, 104), True),
    (7, "desert",   "荒漠", (176, 166, 124), True),
    (8, "offmap",   "图外", (128, 125, 105), False),
]

ID = {name: tid for tid, name, _cn, _rgb, _p in PALETTE}
PASSABLE = [p for _tid, _n, _cn, _rgb, p in PALETTE]
PREVIEW = [rgb for _tid, _n, _cn, rgb, _p in PALETTE]


def meta(map_id: str, rows: int, cols: int, sha256: str, byte_length: int) -> dict:
    return {
        "schemaVersion": 1,
        "mapId": map_id,
        "maxRow": rows,
        "maxCol": cols,
        "byteLength": byte_length,
        "sha256": sha256,
        "palette": [
            {"id": tid, "name": name, "cn": cn, "color": list(rgb), "passable": p}
            for tid, name, cn, rgb, p in PALETTE
        ],
    }
