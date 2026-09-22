#!/usr/bin/env python3
"""多格地形的**区域件**图集（山脉 / 林丛 / 散落）。

    /tmp/maporiginal-venv/bin/python pack_regions.py [--map s1]

★ 素材全是原版 2D 等距件，⛔ 无一张是我们画的：
    山脉 `scene/ground/mountain_new/grass_fall_new/png/m1..m10`（原版 2D 山体，10 张）
    林丛 `scene/build/{main_city,city/png}/tree/*`（原版树簇）
    散落 `scene/ground/grass/png/a*`（原版草丛）
⚠ 这些件早先「找不到」是因为 `slice_atlas.py` 只切了多页图集的**第一页**
  （`remain_tex.xml` 有 17 页），⛔ 别再据此下「原版 2D 山林素材不在包里」的结论。

⚠ 格子比摆件图集大得多（512×320 而不是 256×192）：一座山要横跨 7 格菱形 ≈ 2100 世界像素，
  用 256 宽的源会糊成一团。⛔ 别为了省纹理把它塞回摆件图集。
"""
from __future__ import annotations

import argparse
import json
import os
import re

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

CELL_W, CELL_H = 512, 320
GRID_COLS, GRID_ROWS = 4, 6
ATLAS_W, ATLAS_H = 2048, 2048

MOUNTAIN_RE = re.compile(r"scene/ground/mountain_new/grass_fall_new/png/m(\d+)\.png$")
GRASS_RE = re.compile(r"scene/ground/grass/png/a(\d+)\.png$")
TREE_RE = re.compile(r"scene/build/(?:main_city|city/png)/tree/[^/]+\.png$")
# ⚠ 树目录里混着**伐木场道具**（树桩 / 原木 / 木板堆），它们不是林丛。
#   按文件名剔不住（叫 15/17/18_04 这种），⛔ 别写名字黑名单 —— 换季/换图就漏。
#   判据用**绿度** = G / ((R+B)/2)：实测道具 ≤ 1.114、树簇（含秋黄）≥ 1.142，分得很开。
TREE_GREEN_MIN = 1.13


def greenness(im) -> float:
    a = np.asarray(im.convert("RGBA")).astype(np.float32)
    m = a[..., 3] > 40
    if m.sum() < 50:
        return 0.0
    r, g, b = a[..., 0][m].mean(), a[..., 1][m].mean(), a[..., 2][m].mean()
    return float(g / max((r + b) / 2, 1.0))


def load_sprites():
    rows = [json.loads(x) for x in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8")]
    mountains, trees, grass = [], [], []
    for r in rows:
        lg, p = r["logical"], os.path.join(OUT, r["out"])
        if not os.path.exists(p):
            continue
        m = MOUNTAIN_RE.search(lg)
        if m:
            mountains.append((int(m.group(1)), lg, p))
            continue
        g = GRASS_RE.search(lg)
        if g:
            grass.append((int(g.group(1)), lg, p))
            continue
        if TREE_RE.search(lg):
            try:
                im = Image.open(p)
                w, h = im.size
            except OSError:
                continue
            if w * h >= 4000 and greenness(im) >= TREE_GREEN_MIN:
                trees.append((w * h, lg, p))
    mountains.sort()
    grass.sort()
    trees.sort(reverse=True)
    return mountains, trees, grass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    mountains, trees, grass = load_sprites()
    print("原版件：山体 %d / 树簇 %d / 草丛 %d" % (len(mountains), len(trees), len(grass)))
    if not mountains or not trees or not grass:
        raise SystemExit("⛔ 原版件缺料 —— 先跑 slice_atlas.py --all（含 remain_tex 多页）")

    # ⚠ 每族的件按**从小到大**排：build_regions 用区的跨度挑件，次序就是「小区用小件」
    def by_area(items):
        out = []
        for _k, lg, p in items:
            im = Image.open(p).convert("RGBA")
            bb = im.getbbox()
            if bb:
                im = im.crop(bb)
            out.append((im.width * im.height, lg, im))   # ⚠ im 已按 bbox 裁过 = 原版实心尺寸
        out.sort()
        return out

    picks = [("mountain", by_area(mountains)[:10]),
             ("grove", by_area(trees)[:8]),
             ("scatter", by_area(grass)[:6])]

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells, idx = [], 0
    for kind, items in picks:
        for _area, lg, im in items:
            if idx >= GRID_COLS * GRID_ROWS:
                raise SystemExit("⛔ region 图集格位不够（%d）" % idx)
            im = im.copy()
            native = [im.width, im.height]       # ★ 原图像素 = 原版尺寸的唯一依据
            im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
            gx, gy = (idx % GRID_COLS) * CELL_W, (idx // GRID_COLS) * CELL_H
            ox, oy = (CELL_W - im.width) // 2, CELL_H - im.height   # ⚠ 底对齐
            atlas.paste(im, (gx + ox, gy + oy), im)
            cells.append({"id": idx, "kind": kind,
                          "cell": [gx, gy, CELL_W, CELL_H],
                          "art": [ox, oy, im.width, im.height],
                          "native": native, "source": lg})
            idx += 1

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "region-atlas.png"))
    info = {"schemaVersion": 1, "mapId": a.map, "cell": [CELL_W, CELL_H],
            "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
            "anchor": "bottom-center",
            "indexing": "格 id 由 build_regions 写进 regions.bin；族内按面积升序（小区用小件）",
            "cells": cells}
    json.dump(info, open(os.path.join(d, "region-atlas.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal **区域件**图集布局（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 多格地形（山脉 / 林丛 / 散落）的件。摆放表在 `regions.bin`（Cocos BufferAsset），
 *   ⛔ 不进 shared：2.8 万条、217 KB。这里只有**图集布局**。
 * ⚠ 锚点是**底边中点**，⛔ 不是几何中心。
 * ⚠ 族内按面积**升序**排，`build_regions.py` 按区的等距跨度挑件（大区用大件）。
 * ★ `native` 是原图像素：原版 2D 一格 300×150 px ⇒ 世界宽 = native[0] × (MAPO_TILE_HALF_W / 150)。
 *   实测山体件占 0.94~2.25 格、树簇 0.12~0.45 格 —— 这就是原版的比例。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别再拉伸。
 */

export interface IMapoRegionCell {
    readonly id: number;
    readonly kind: string;
    readonly cell: readonly [number, number, number, number];
    readonly art: readonly [number, number, number, number];
    /** ★ **原图像素尺寸**。件在世界里多大由它定，⛔ 不是按连通区拉伸。 */
    readonly native: readonly [number, number];
}

export const MAPO_REGION_ATLAS_W = %d;
export const MAPO_REGION_ATLAS_H = %d;
export const MAPO_REGION_CELL_W = %d;
export const MAPO_REGION_CELL_H = %d;
export const MAPO_REGION_CELLS: readonly IMapoRegionCell[] = %s;
''' % (a.map, ATLAS_W, ATLAS_H, CELL_W, CELL_H,
       json.dumps([{k: v for k, v in c.items() if k != "source"} for c in cells],
                  ensure_ascii=False, indent=2))
    open(os.path.join(d, "region.data.ts"), "w", encoding="utf-8").write(ts)
    print("区域件 %d 格（%s）" % (len(cells), {k: len(v) for k, v in picks}))
    print("→ %s/region-atlas.png (%.1f MB)" % (d, os.path.getsize(os.path.join(d, "region-atlas.png")) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
