#!/usr/bin/env python3
"""原版「山」族 14 形的件图集（每形一格，格 id = **原版 res 值**）。

    /tmp/maporiginal-venv/bin/python pack_regions.py [--map s1] [--season fall|base]

★ 素材与形的对应**不是挑的，是读出来的**：`mountain_forms.py` 逐个读
  `scene/ground/mountain_new[/<季>]/<form>_group.prefab.bin` 的字符串池拿到贴图名。
  13 形只用到 m1..m10 十张图（三对共用），⛔ 别再按面积/绿度启发式挑件。

⚠ 2026-09-22 M0-B1 起改成**一族 14 形**（见 docs/MAPORIGINAL-2D.md §3.2）：
  早先分的「山脉 / 林丛 / 散落」三族是本仓自创的分类，树簇与草丛件已移除 ——
  48..61 在原版全是 `山1..山14`，⛔ 别再往里塞 tree/grass。

⚠ 格子按最大原图定（m5 697×345）：只有 m5 被缩 2.4%，其余全是原生像素。
  ⛔ 别为了省纹理缩到 512 —— 件在世界里要跨到 3.5 格宽（M0-B2 还要再乘 prefab 的 scale）。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mountain_forms as MF  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

CELL_W, CELL_H = 680, 352
GRID_COLS, GRID_ROWS = 3, 5          # 15 格位 ≥ 13 形
ATLAS_W, ATLAS_H = 2048, 2048
SEASON_DIR = {"base": MF.PREFAB_DIR_BASE, "fall": MF.PREFAB_DIR_FALL}


def load_sprites(season_dir: str) -> dict:
    """贴图基名 → 已按 bbox 裁过的 RGBA 图。⚠ 缺一张就退出，⛔ 不静默降级。"""
    want = {t for _n, _p, t, _s in MF.FORMS.values()}
    pat = re.compile(r"^%s/png/(m\d+)\.png$" % re.escape(season_dir))
    got = {}
    for line in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        m = pat.match(r["logical"])
        if not m or m.group(1) not in want:
            continue
        p = os.path.join(OUT, r["out"])
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGBA")
        bb = im.getbbox()
        got[m.group(1)] = (r["logical"], im.crop(bb) if bb else im)
    miss = sorted(want - set(got))
    if miss:
        raise SystemExit("⛔ %s 缺件 %s —— 先跑 slice_atlas.py --all（含 remain_tex 多页）"
                         % (season_dir, miss))
    return got


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--season", default="fall", choices=sorted(SEASON_DIR))
    a = ap.parse_args()
    season_dir = SEASON_DIR[a.season]
    sprites = load_sprites(season_dir)

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells = []
    for idx, v in enumerate(MF.VALUES):
        shan, form, tex, shape = MF.FORMS[v]
        logical, src = sprites[tex]
        im = src.copy()
        native = [im.width, im.height]          # ★ 原图像素（未缩）= 件尺寸的唯一依据
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        gx, gy = (idx % GRID_COLS) * CELL_W, (idx // GRID_COLS) * CELL_H
        ox, oy = (CELL_W - im.width) // 2, CELL_H - im.height       # ⚠ 底对齐
        atlas.paste(im, (gx + ox, gy + oy), im)
        cells.append({"id": v, "kind": "mountain", "shan": shan, "form": form,
                      "shape": shape, "footprintCells": len(MF.footprint_cells(v, 0)),
                      "cell": [gx, gy, CELL_W, CELL_H],
                      "art": [ox, oy, im.width, im.height],
                      "native": native, "source": logical})

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "region-atlas.png"))
    info = {"schemaVersion": 2, "mapId": a.map, "cell": [CELL_W, CELL_H],
            "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
            "season": a.season, "seasonDir": season_dir,
            "anchor": "bottom-center",
            "indexing": "格 id = 原版 res 值（48..61，⛔ 无 56）；贴图由 prefab 字符串池读出",
            "cells": cells}
    json.dump(info, open(os.path.join(d, "region-atlas.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal 「山」族件图集（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ **格 id = 原版 res 值**（48..61，⛔ 无 56）：客户端拿到锚点值就直接查到该放哪张图。
 *   原版 48..61 是**一族 14 形**（`山1..山14`，见 docs/MAPORIGINAL-2D.md §3.2），
 *   ⛔ 不是本仓早先分的「山脉 / 林丛 / 散落」三族。山9（值 56）无 2D prefab，数据里也 0 命中。
 * ★ 贴图对应是**从 prefab 读出来的**（`mountain_forms.py`）：13 形只用到 m1..m10 十张图，
 *   1m_01/1m_04 共用 m7、1m_02/1m_03 共用 m6、19m_01/19m_02 共用 m2，靠 transform 区分。
 * ⚠ 锚点是**底边中点**，⛔ 不是几何中心。
 * ★ `native` 是原图像素：世界宽 = native[0] × (MAPO_TILE_HALF_W / 150)。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别再拉伸。
 */

export interface IMapoRegionCell {
    /** ★ 原版 res 值（48..61），同时是 `regions.bin` 里的 cell 字段。 */
    readonly id: number;
    readonly kind: string;
    /** 原版件号 `山N`。 */
    readonly shan: number;
    /** 原版 prefab 名，如 `mountain19m_01`。 */
    readonly form: string;
    /** 足迹形：1m / 2m_x / 2m_xy / 2m_y / 4m / 7m / 19m。 */
    readonly shape: string;
    /** 该形覆盖的格数（1 / 2 / 4 / 7 / 19）。 */
    readonly footprintCells: number;
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
    print("山族件 %d 形（季 %s）：%s" % (len(cells), a.season,
                                       " ".join("%d=%s" % (c["id"], c["source"].rsplit("/", 1)[-1])
                                                for c in cells)))
    print("→ %s/region-atlas.png (%.1f MB)" % (d, os.path.getsize(os.path.join(d, "region-atlas.png")) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
