#!/usr/bin/env python3
"""从原版切片里挑摆件、打成 POT 图集。

    /tmp/maporiginal-venv/bin/python pack_decor.py [--map s1]

⚠ 原版的近档地表不是「一格一块方砖」，而是**一格一张有机地皮精灵 + 互相叠压**
（`scene/resource/**`、`scene/build/**`、`scene/_output_atlas_scene/atlas_tex/small_build*`）。
本管线先把它们当**摆件层**用（铺在菱形地表之上），这是打散「铺地砖」观感最直接的一层。

挑选规则（⛔ 别手点 3,510 张）：
  ① 只取尺寸像地块/建筑的（宽 96..600、高 64..600）；
  ② ⛔ 剔除 mask / flood / effect / 动画帧（末段 `_0007` 这种）；
  ③ **按父目录去重**：同一个地物往往有几十帧/几个朝向，只留最大的一张；
  ④ 按面积降序取前 N，保证图集里都是「看得清」的件。
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
FRAME_RE = re.compile(r"_\d{4}(@@[^/]*)?\.png$")
SKIP = ("flood_mask", "mask", "effect", "camara", "cloud", "banner", "guide", "light")
FROM = ("small_build", "resource-1", "npc_city-1", "player_city-1", "junying-1")

# 路径关键词 → 摆件类别（给放置逻辑用）
def cells_min(cells: list) -> list:
    """给 shared 用的精简形态：⛔ 不带 source（那是仓外路径，只留在 .info.json 里）。"""
    return [{"id": c["id"], "kind": c["kind"], "cell": c["cell"], "art": c["art"]} for c in cells]


def kind_of(logical: str) -> str:
    p = logical.lower()
    if "main_city" in p or "npc_city" in p or "player_city" in p:
        return "city"
    if "tower" in p or "junying" in p or "camp" in p:
        return "camp"
    if "/resource" in p or "food" in p or "gold" in p or "iron" in p or "stone" in p or "wood" in p:
        return "resource"
    return "build"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--count", type=int, default=GRID_COLS * GRID_ROWS)
    a = ap.parse_args()

    rows = [json.loads(x) for x in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8")]
    best: dict[str, tuple] = {}
    for r in rows:
        lg = r["logical"]
        if not any(t in r["from_atlas"] for t in FROM):
            continue
        if any(s in lg for s in SKIP) or FRAME_RE.search(lg):
            continue
        p = os.path.join(OUT, r["out"])
        if not os.path.exists(p):
            continue
        try:
            w, h = Image.open(p).size
        except OSError:
            continue
        if not (96 <= w <= 600 and 64 <= h <= 600):
            continue
        # ⚠ 按**内容**再筛一道，⛔ 光靠路径关键词滤不掉光效与条纹面片：
        #   ① alpha 几乎铺满 ⇒ 是矩形面片/背景板，不是立在格上的地物；
        #   ② 平均饱和度过低 ⇒ 是白色光晕/描边这类特效。
        try:
            im = Image.open(p).convert("RGBA").resize((64, 48))
        except OSError:
            continue
        px = list(im.getdata())
        opaque = [q for q in px if q[3] > 32]
        if not opaque or len(opaque) / len(px) > 0.98:
            continue
        sat = sum(max(q[0], q[1], q[2]) - min(q[0], q[1], q[2]) for q in opaque) / len(opaque)
        if sat < 14:
            continue
        folder = lg.rsplit("/", 1)[0]                       # ③ 按父目录去重
        if folder not in best or w * h > best[folder][0]:
            best[folder] = (w * h, w, h, lg, p)
    picked = sorted(best.values(), reverse=True)[: a.count]
    print("候选目录 %d 个，选入 %d 件" % (len(best), len(picked)))

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells = []
    for i, (_area, w, h, lg, p) in enumerate(picked):
        im = Image.open(p).convert("RGBA")
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        cx = (i % GRID_COLS) * CELL_W + (CELL_W - im.width) // 2
        cy = (i // GRID_COLS) * CELL_H + (CELL_H - im.height)   # ⚠ 底对齐：摆件立在格上
        atlas.paste(im, (cx, cy), im)
        cells.append({
            "id": i, "kind": kind_of(lg), "source": lg,
            "cell": [(i % GRID_COLS) * CELL_W, (i // GRID_COLS) * CELL_H, CELL_W, CELL_H],
            "art": [cx - (i % GRID_COLS) * CELL_W, cy - (i // GRID_COLS) * CELL_H, im.width, im.height],
        })
    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "decor-atlas.png"))
    json.dump({
        "schemaVersion": 1, "mapId": a.map, "cell": [CELL_W, CELL_H],
        "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
        # ⚠ 摆件在格内的锚点：底边中点（立在菱形中心），⛔ 不是几何中心
        "anchor": "bottom-center", "cells": cells,
    }, open(os.path.join(d, "decor-atlas.info.json"), "w", encoding="utf-8"),
        ensure_ascii=False, indent=1)
    # shared 侧要用的布局（客户端算 UV / 选件都靠它）
    shared = """/**
 * mapOriginal 摆件图集布局（%s）—— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/pack_decor.py` 从**原版切片**打包派生。
 * ⚠ 锚点是**底边中点**（摆件立在菱形中心上），⛔ 不是几何中心。
 * ⚠ `art` 是该件在格内的实际像素矩形（居中、底对齐），格内其余是透明填充。
 */

export interface IMapoDecorCell {
  readonly id: number;
  /** city / camp / build / resource —— 放置逻辑按它挑件。 */
  readonly kind: string;
  /** 图集里的格矩形 [x, y, w, h]。 */
  readonly cell: readonly [number, number, number, number];
  /** 格内实际画面的矩形 [x, y, w, h]（相对格左上）。 */
  readonly art: readonly [number, number, number, number];
}

export const MAPO_DECOR_ATLAS_W = %d;
export const MAPO_DECOR_ATLAS_H = %d;
export const MAPO_DECOR_CELL_W = %d;
export const MAPO_DECOR_CELL_H = %d;
export const MAPO_DECOR_CELLS: readonly IMapoDecorCell[] = %s;
""" % (a.map, ATLAS_W, ATLAS_H, CELL_W, CELL_H,
        json.dumps(cells_min(cells), ensure_ascii=False, indent=2))
    sp = os.path.join(d, "decor.data.ts")
    open(sp, "w", encoding="utf-8").write(shared)
    print("→ %s" % sp)
    import collections
    print("按类别：", collections.Counter(c["kind"] for c in cells).most_common())
    print("→ %s/decor-atlas.png (%.1f MB)" % (d, os.path.getsize(os.path.join(d, "decor-atlas.png")) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
