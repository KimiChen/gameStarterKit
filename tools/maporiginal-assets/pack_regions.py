#!/usr/bin/env python3
"""原版「山」族 14 形的件图集（每形一格，格 id = **原版 res 值**）。

    /tmp/maporiginal-venv/bin/python pack_regions.py [--map s1] [--season fall|base]

★ 素材与形的对应**不是挑的，是读出来的**：`mountain_forms.py` 逐个读
  `scene/ground/mountain_new[/<季>]/<form>_group.prefab.bin` 的字符串池拿到贴图名。
  13 形只用到 m1..m10 十张图（三对共用），⛔ 别再按面积/绿度启发式挑件。

★ **默认用基础季**（`mountain_new/png/`，M0-B3）：秋季（`grass_fall_new`）只是同一批件的换季版。
  ⚠ 顺带解决了一个坑：秋季 prefab 结构不同（根节点多 tag + 组件表），`prefab_bin.py` 会
  **静默**解成 0 个子节点 ⇒ 取不到 transform。所以 B2 的 transform 只能走基础季，
  施工单里「B3 依赖 B2」的次序实际是反的。

★ **件的大小 = 原图像素 × prefab 里的 scale**（M0-B2，MAPORIGINAL-2D §3.3）：
  m2 只有 563 px 却要盖满 19 格的足迹，靠的就是 `mountain19m_01` 的 scale 2.163。
  三对共用贴图的形（m7/m6/m2）**全靠 transform 区分** ⇒ 只抄像素必然「14 形压成 10 形」。
  本脚本逐个解 prefab 取 sprite 的 `position` / `scale` / `angle` / `size` / `pivot`，
  并断言 `size` == 原图像素（这同时是「贴图对应没搞错」的交叉校验）。

⚠ 图**不再按 bbox 裁**：裁了 `size` 就对不上，`position`（相对 pivot 中心的偏移）也失准。

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
import prefab_bin  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

CELL_W, CELL_H = 682, 409
GRID_COLS, GRID_ROWS = 3, 5          # 15 格位 ≥ 13 形
SCALE_MIN, SCALE_MAX = 0.1, 8.0      # 入库校验：prefab 的 scale 必须落在这区间
ATLAS_W, ATLAS_H = 2048, 2048
SEASON_DIR = {"base": MF.PREFAB_DIR_BASE, "fall": MF.PREFAB_DIR_FALL}


def read_transform(season_dir: str, form: str) -> dict:
    """prefab → 那一个 sprite_2d 的 transform。⚠ 解析必须零残留，否则退出。"""
    blob = open(resolve_by_name("%s/%s_group.prefab.bin" % (season_dir, form)), "rb").read()
    d = prefab_bin.parse(blob)
    if d.get("_bytes_left"):
        raise SystemExit("⛔ %s 解析有残留 %s B，transform 不可信" % (form, d["_bytes_left"]))
    kids = d.get("children") or []
    if len(kids) != 1 or kids[0].get("class") != "sprite_2d":
        raise SystemExit(
            "⛔ %s/%s 没解出「一个 node_2d 挂一个 sprite_2d」（解出 %s）。\n"
            "   ⚠ 已知：**秋季**目录（grass_fall_new）的 prefab 结构不同（根节点多一段 tag "
            "'default' + 组件表），`prefab_bin.py` 会静默解成 0 个子节点且仍报 _bytes_left=0；\n"
            "   基础季（mountain_new/）的 13 个全部零残留可解 —— 取 transform 只走基础季。"
            % (season_dir, form, [k.get("class") for k in kids]))
    root_s, ch = d["scale"], kids[0]
    if abs(root_s[0] - 1.0) > 1e-6 or abs(root_s[1] - 1.0) > 1e-6:
        raise SystemExit("⛔ %s 的根节点 scale 不是 1（%s），件的换算要连根一起算" % (form, root_s))
    sx, sy = float(ch["scale"][0]), float(ch["scale"][1])
    if not (SCALE_MIN < sx < SCALE_MAX and SCALE_MIN < sy < SCALE_MAX):
        raise SystemExit("⛔ %s 的 scale %s 不在 (%s, %s) 内" % (form, (sx, sy), SCALE_MIN, SCALE_MAX))
    return {"scale": [round(sx, 6), round(sy, 6)],
            "offset": [round(float(ch["position"][0]), 4), round(float(ch["position"][1]), 4)],
            "angle": round(float(ch["angle"][2]), 4),
            "pivot": [round(float(x), 4) for x in ch["pivot"]],
            "lowZ": int(ch["low_z"]),
            "size": [int(ch["size"][0]), int(ch["size"][1])]}


def load_sprites(season_dir: str) -> dict:
    """贴图基名 → **未裁**的 RGBA 图。⚠ 缺一张就退出，⛔ 不静默降级。"""
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
        # ⛔ 不裁 bbox：裁了就与 prefab 的 size / position 对不上（M0-B2）
        got[m.group(1)] = (r["logical"], Image.open(p).convert("RGBA"))
    miss = sorted(want - set(got))
    if miss:
        raise SystemExit("⛔ %s 缺件 %s —— 先跑 slice_atlas.py --all（含 remain_tex 多页）"
                         % (season_dir, miss))
    return got


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--season", default="base", choices=sorted(SEASON_DIR))
    a = ap.parse_args()
    season_dir = SEASON_DIR[a.season]
    sprites = load_sprites(season_dir)

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells = []
    for idx, v in enumerate(MF.VALUES):
        shan, form, tex, shape = MF.FORMS[v]
        logical, src = sprites[tex]
        tr = read_transform(season_dir, form)
        im = src.copy()
        native = [im.width, im.height]          # ★ 原图像素（未缩、未裁）
        if tr["size"] != native:
            raise SystemExit("⛔ %s 的 prefab size %s ≠ 原图 %s —— 贴图对应搞错了"
                             % (form, tr["size"], native))
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        gx, gy = (idx % GRID_COLS) * CELL_W, (idx // GRID_COLS) * CELL_H
        ox, oy = (CELL_W - im.width) // 2, CELL_H - im.height       # ⚠ 底对齐
        atlas.paste(im, (gx + ox, gy + oy), im)
        cells.append({"id": v, "kind": "mountain", "shan": shan, "form": form,
                      "shape": shape, "footprintCells": len(MF.footprint_cells(v, 0)),
                      "cell": [gx, gy, CELL_W, CELL_H],
                      "art": [ox, oy, im.width, im.height],
                      "native": native,
                      "scale": tr["scale"], "offset": tr["offset"], "angle": tr["angle"],
                      "pivot": tr["pivot"], "lowZ": tr["lowZ"], "source": logical})

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "region-atlas.png"))
    info = {"schemaVersion": 2, "mapId": a.map, "cell": [CELL_W, CELL_H],
            "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
            "season": a.season, "seasonDir": season_dir,
            "anchor": "bottom-center",
            "indexing": "格 id = 原版 res 值（48..61，⛔ 无 56）；贴图由 prefab 字符串池读出",
            "transform": "scale/offset/angle/pivot 逐形取自 prefab 的 sprite_2d；"
                         "offset 是精灵**中心**相对锚点格的偏移（原版 px），pivot 恒 [0.5, 0.5]",
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
 * ★ **件的大小 = `native` × `scale`**（M0-B2，§3.3）：`native` 是原图像素、`scale` 是 prefab 里
 *   那个 sprite 的缩放。m2 只有 563 px 却要盖满 19 格，靠的就是 `mountain19m_01` 的 2.163；
 *   三对共用贴图的形**全靠 transform 区分** ⇒ ⛔ 只用 native 会把 14 形压成 10 形。
 * ★ `offset` 是精灵**中心**相对锚点格的偏移（原版 px，+y 向上）；`pivot` 恒 [0.5, 0.5]。
 *   世界坐标：中心 = 锚点格位置 + toWorld(offset)，底边中点 = 中心 − (0, h/2)。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别按足迹拉伸 ——
 *   `scale` 是原版给的定值，⛔ 不是我们按格数算的。
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
    /** ★ **原图像素尺寸**（未裁 bbox），等于 prefab 里 sprite 的 `size`。 */
    readonly native: readonly [number, number];
    /** ★ prefab 里 sprite 的缩放 [x, y]。件的世界尺寸 = native × scale × (halfW / 150)。 */
    readonly scale: readonly [number, number];
    /** ★ 精灵**中心**相对锚点格的偏移（原版 px，+y 向上）。 */
    readonly offset: readonly [number, number];
    /** prefab 里 sprite 绕中心的旋转（**度**，CCW 为正）。13 形里只有 2 形非零。 */
    readonly angle: number;
    /** prefab 里 sprite 的轴心，恒 [0.5, 0.5]（中心）。 */
    readonly pivot: readonly [number, number];
    /** prefab 里 sprite 的 `low_z`（同节点内的叠序，13 形恒 1）。 */
    readonly lowZ: number;
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
