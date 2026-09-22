#!/usr/bin/env python3
"""原版地名表 → 内容包 labels.json。

    /tmp/maporiginal-venv/bin/python build_labels.py [--map s1]

来源（仓外只读，反编译可读源）：
    src-lua/script/ui/view/map/birdview/season_cfg/<赛季>/canton_name_info.lua  9 个**大区**
    src-lua/script/ui/view/map/birdview/season_cfg/<赛季>/area_name_info.lua    ~55 个**郡**

⚠ 原作的地名 mark（`ui/view/map/birdview/marks/area_name_mark.lua`）是按
`minimap_mgr.data:get_canton_id_by_grid(row, col)` 拿 canton id 再查表；这里直接取表里自带的
`grid = {row, col}`（每条地名的落点），⛔ 不需要复刻那条运行时查询。
⚠ `name` 字段是 i18n key（形如 `地图文案_西凉`），显示文本取 `_` 之后那一段；
key 原样留在 `key` 里备查，⛔ 不要丢。
"""
from __future__ import annotations

import argparse
import json
import os
import re

import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
SV = CFG["sourceVersionRoot"]
SEASON_DIR = "src-lua/script/ui/view/map/birdview/season_cfg"


def unescape(text: str) -> str:
    """Lua 的 `\\229\\156\\176` 十进制字节转义 → UTF-8。"""
    def dec(m: re.Match) -> str:
        raw = bytes(int(x) for x in re.findall(r"\\(\d{1,3})", m.group(0)))
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return m.group(0)
    return re.sub(r"(?:\\\d{1,3})+", dec, text)


def display(key: str) -> str:
    return key.split("_", 1)[1] if "_" in key else key


def parse_cities(path: str) -> list:
    """`city_center.lua`：`[id] = {row, col}`，249 座城的**真坐标**（⛔ 无名字，名字在服务端）。"""
    if not os.path.exists(path):
        return []
    body = open(path, encoding="utf-8", errors="ignore").read()
    return [{"id": int(i), "row": int(r), "col": int(c)}
            for i, r, c in re.findall(r"\[(\d+)\]\s*=\s*\{(\d+),\s*(\d+)\}", body)]


def parse_city_cells(logical: str, cities: list) -> list:
    """`city.bytes` 的**占格表**（MAPORIGINAL-2D §5）：

        [u16 BE 城数=249][每城: u8 格数 N][N × {u16 BE row, u16 BE col}]

    ⚠ 必须**精确读完不多不少**（11,007 B），否则布局判错；
    ★ 每城的第 1 格 == `city_center.lua[i]`，249/249 逐条相等 —— 这是布局的硬证。
    """
    from decode_ktx import resolve_by_name
    blob = open(resolve_by_name(logical), "rb").read()
    n = int.from_bytes(blob[:2], "big")
    o, out = 2, []
    for i in range(n):
        cnt = blob[o]
        o += 1
        cells = []
        for _ in range(cnt):
            cells.append([int.from_bytes(blob[o:o + 2], "big"),
                          int.from_bytes(blob[o + 2:o + 4], "big")])
            o += 4
        out.append(cells)
    if o != len(blob):
        raise SystemExit("⛔ city.bytes 布局不符：读到 %d / 共 %d B" % (o, len(blob)))
    if len(out) != len(cities):
        raise SystemExit("⛔ city.bytes 的 %d 座 ≠ city_center.lua 的 %d 座" % (len(out), len(cities)))
    for i, (cells, c) in enumerate(zip(out, cities)):
        if not cells or cells[0] != [c["row"], c["col"]]:
            raise SystemExit("⛔ 第 %d 座的首格 %s ≠ city_center %s"
                             % (i + 1, cells[:1], [c["row"], c["col"]]))
    return out


def parse(path: str) -> list:
    if not os.path.exists(path):
        return []
    body = unescape(open(path, encoding="utf-8", errors="ignore").read())
    out = []
    for block in re.findall(r"\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", body):
        name = re.search(r'name\s*=\s*"([^"]*)"', block)
        grid = re.search(r"grid\s*=\s*\{row\s*=\s*(\d+),\s*col\s*=\s*(\d+)\}", block)
        if not name or not grid:
            continue
        area = re.search(r"area_id\s*=\s*(\d+)", block)
        out.append({"key": name.group(1), "name": display(name.group(1)),
                    "row": int(grid.group(1)), "col": int(grid.group(2)),
                    **({"areaId": int(area.group(1))} if area else {})})
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    base = os.path.join(SV, SEASON_DIR, a.map)
    cantons = parse(os.path.join(base, "canton_name_info.lua"))
    areas = parse(os.path.join(base, "area_name_info.lua"))
    cities = parse_cities(os.path.join(SV, "src-lua/asset/config/S1/cn/res_pro/city_center.lua"))
    if not cantons and not areas:
        raise SystemExit(f"⛔ {base} 下没解出地名；确认赛季目录名（VFS 里是小写）")
    # ⚠ 去重：同名同点的重复条目（表里偶有）
    seen = set()
    areas = [x for x in areas if not (x["name"], x["row"], x["col"]) in seen
             and not seen.add((x["name"], x["row"], x["col"]))]
    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    # ★ M0-B4：城的**占格**（249 座共 2,689 格）。原版第 4 道门 = 该格有 build 就不画资源件。
    city_cells = parse_city_cells("map/%s/cn/city.bytes" % a.map, cities)
    payload = {"schemaVersion": 2, "mapId": a.map,
               "source": f"{SEASON_DIR}/{a.map}/{{canton,area}}_name_info.lua"
                         " + asset/config/S1/cn/res_pro/city_center.lua"
                         f" + map/{a.map}/cn/city.bytes（占格表）",
               "cantons": cantons, "areas": areas, "cities": cities,
               "cityCells": city_cells}
    json.dump(payload, open(os.path.join(d, "labels.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("大区 %d 个：%s" % (len(cantons), "、".join(x["name"] for x in cantons)))
    print("郡 %d 个：%s …" % (len(areas), "、".join(x["name"] for x in areas[:8])))
    import collections
    shapes = collections.Counter(len(c) for c in city_cells)
    print("城 %d 座（真坐标，来自 city_center.lua）" % len(cities))
    print("占格 %d 格，形态 %s（格数:座数）"
          % (sum(len(c) for c in city_cells), dict(sorted(shapes.items()))))
    print("→ %s/labels.json" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
