#!/usr/bin/env python3
"""摆件图集 = 原作的 **res_field**：按「资源类型 × 等级」直接用原版地物图。

    /tmp/maporiginal-venv/bin/python pack_decor.py [--map s1]

★ **按原游戏的参数摆放**：原作近档是「底图 + 逐格 res_field 单位」，而这个单位由该格的
   `res` 值（类型 + 等级）决定 —— ⛔ 不是我们撒的随机件。所以图集**按原版值建格**：
     格 id = 原版值（2..46）⇒ 客户端拿到某格的值就直接查到该放哪张图，零猜测。
   城址另占几格（64 起），由 `city_center.lua` 的真坐标驱动。

素材来源：`scene/resource/{wood,iron,stone,food,gold}-new/png/<等级>.png`
（切自 `scene/_output_atlas_scene/atlas_tex/resource*.xml`）。
⚠ 某些等级原版没单独出图（例如 wood 缺 4/6），用**最近的已有等级**顶上并记进 info。
⚠ 四种资源 ↔ 木/铁/石/粮 的对应是**假设**（见 build_terrain.py 模块注释）。
"""
from __future__ import annotations

import argparse
import json
import os
import re

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PNG = os.path.join(OUT, "png")

CELL_W, CELL_H = 256, 192
GRID_COLS, GRID_ROWS = 8, 10
ATLAS_W, ATLAS_H = 2048, 2048
CITY_BASE = 64                       # 城址件从这一格起
RES_TYPES = ["wood", "iron", "stone", "food"]
RES_LEVEL_RE = re.compile(r"scene/resource/([a-z]+)-new/png/(\d+)\.png$")
CITY_HINTS = ("main_city", "npc_city", "player_city")


def load_sprites() -> tuple:
    """-> (资源图 {类型: {等级: 路径}}, 城址候选 [路径])。"""
    rows = [json.loads(x) for x in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8")]
    res: dict = {}
    cities: list = []
    for r in rows:
        lg, p = r["logical"], os.path.join(OUT, r["out"])
        if not os.path.exists(p):
            continue
        m = RES_LEVEL_RE.search(lg)
        if m:
            res.setdefault(m.group(1), {})[int(m.group(2))] = p
            continue
        if any(h in lg for h in CITY_HINTS) and "mask" not in lg and "effect" not in lg:
            try:
                w, h = Image.open(p).size
            except OSError:
                continue
            if 120 <= w <= 600 and 80 <= h <= 600:
                cities.append((w * h, p, lg))
    cities.sort(reverse=True)
    return res, cities


def nearest(levels: dict, want: int):
    """原版没出这一级的图时取最近的一级。⛔ 不留空格（空格 = 屏幕上一片资源地没东西）。"""
    if not levels:
        return None, None
    key = min(levels, key=lambda k: (abs(k - want), k))
    return levels[key], key


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    res, cities = load_sprites()
    print("资源图：%s" % {t: sorted(res.get(t, {})) for t in RES_TYPES + ["gold"]})
    print("城址候选 %d 张" % len(cities))

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells = []

    def place(idx: int, path: str, meta: dict) -> None:
        im = Image.open(path).convert("RGBA")
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        gx, gy = (idx % GRID_COLS) * CELL_W, (idx // GRID_COLS) * CELL_H
        ox, oy = (CELL_W - im.width) // 2, CELL_H - im.height      # ⚠ 底对齐：地物立在格上
        atlas.paste(im, (gx + ox, gy + oy), im)
        cells.append({"id": idx, "cell": [gx, gy, CELL_W, CELL_H],
                      "art": [ox, oy, im.width, im.height], **meta})

    missing = []
    for v in range(2, 47):
        if v <= 41:
            t, lv = RES_TYPES[(v - 2) // 10], (v - 2) % 10 + 1
        else:
            t, lv = "gold", v - 41
        path, used = nearest(res.get(t, {}), lv)
        if not path:
            missing.append(v)
            continue
        if used != lv:
            missing.append("%d(用%d级)" % (v, used))
        # ⚠ 存证写**仓外相对路径**，⛔ 不要把本机绝对路径落进要提交的 info.json
        place(v, path, {"kind": "res", "resType": t, "level": lv, "usedLevel": used,
                        "source": os.path.relpath(path, PNG)})
    for i, (_area, path, lg) in enumerate(cities[:8]):
        place(CITY_BASE + i, path, {"kind": "city", "source": lg})

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "decor-atlas.png"))
    info = {"schemaVersion": 2, "mapId": a.map, "cell": [CELL_W, CELL_H],
            "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
            "anchor": "bottom-center", "cityBase": CITY_BASE,
            "indexing": "格 id = 原版 res 值（2..46）；城址件从 cityBase 起",
            "substitutions": missing, "cells": cells}
    json.dump(info, open(os.path.join(d, "decor-atlas.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    shared = '''/**
 * mapOriginal 摆件图集布局（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 格 id = **原版 res 值**（2..46）：客户端拿到某格的值就直接查到该放哪张图，⛔ 零猜测。
 *   这是「按原游戏参数摆放」的落点——原作近档就是逐格一个 res_field，由该格的类型+等级决定。
 * ⚠ 锚点是**底边中点**（地物立在菱形中心上），⛔ 不是几何中心。
 * ⚠ 原版没单独出图的等级用最近一级顶上（`MAPO_DECOR_SUBSTITUTIONS`）。
 */

export interface IMapoDecorCell {
  readonly id: number;
  readonly kind: string;
  readonly cell: readonly [number, number, number, number];
  readonly art: readonly [number, number, number, number];
  readonly resType?: string;
  readonly level?: number;
}

export const MAPO_DECOR_ATLAS_W = %d;
export const MAPO_DECOR_ATLAS_H = %d;
export const MAPO_DECOR_CELL_W = %d;
export const MAPO_DECOR_CELL_H = %d;
/** 城址件的起始格 id；`city_center.lua` 的 249 座城按真坐标落在这里。 */
export const MAPO_DECOR_CITY_BASE = %d;
/** 原版缺级、用邻近级顶上的记录（只作存证）。 */
export const MAPO_DECOR_SUBSTITUTIONS: readonly (number | string)[] = %s;
export const MAPO_DECOR_CELLS: readonly IMapoDecorCell[] = %s;
''' % (a.map, ATLAS_W, ATLAS_H, CELL_W, CELL_H, CITY_BASE,
       json.dumps(missing, ensure_ascii=False),
       json.dumps([{k: v for k, v in c.items() if k not in ("source", "usedLevel")}
                   for c in cells], ensure_ascii=False, indent=2))
    open(os.path.join(d, "decor.data.ts"), "w", encoding="utf-8").write(shared)
    print("摆件 %d 格（资源 %d + 城址 %d）；缺级替代 %s"
          % (len(cells), sum(1 for c in cells if c["kind"] == "res"),
             sum(1 for c in cells if c["kind"] == "city"), missing or "无"))
    print("→ %s/decor-atlas.png (%.1f MB)" % (d, os.path.getsize(os.path.join(d, "decor-atlas.png")) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
