#!/usr/bin/env python3
"""原版「山」族 14 形的件图集（每形一格，格 id = **原版 res 值**）。

    /tmp/maporiginal-venv/bin/python pack_regions.py [--map s1]

★ 素材与形的对应**不是挑的，是读出来的**：`mountain_forms.py` 逐个读
  `scene/ground/mountain_new/<form>_group.prefab.bin` 的字符串池拿到贴图名。
  13 形只用到 m1..m10 十张图（三对共用），⛔ 别再按面积/绿度启发式挑件。

★ **默认用基础季**（`mountain_new/png/`，M0-B3）：秋季（`grass_fall_new`）只是同一批件的换季版。
  2026-09-24 已修复旧解析器的 tag/组件表错读，不能再以“解析为 0 子节点”判断素材缺失。

★ **季/地貌变体（N1）**：`land` 表的 `snow_client_res_id` 指向
  `scene/ground/mountain_snow/<同形>_group.prefab`（雪山1..14，逐形与本表**互校**，对不上即退出）；
  雪件的贴图（`mountain_snow/png/1..9`）与 transform **逐形重读**，⛔ 不抄基础季的
  （实测雪山 19m 的 scale 是 2.0，基础季是 2.163，offset 也不同）。
  ⚠ **沙漠山不需要新美术**：`desert_client_res_id`（荒地山1..14）的 2D `src_name` 与基础季
  **逐字相同**（只有 `src_name_3d` 不同）⇒ 2D 沙盘沙漠带的山件就是基础季件（实测，
  14/14 全中）；客户端沙漠带回落基础季格，⛔ 不要为此复制一份图集格。
  ⚠ 图集 2048×4096（3×10 格）：基础 13 + 雪 13 = 26 格 > 2048² 的 15 格位，故加高一倍
  （竖着加 ⇒ 基础季 13 格的图内坐标**逐字节不变**）；选单图而不是按套分两张，是因为
  一屏会混着两种带（带界穿屏），单图集单材质才能继续一张 mesh 合批。

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
import land_variants as LV  # noqa: E402
import mountain_forms as MF  # noqa: E402
import prefab_bin  # noqa: E402
from prefab_visual import visual_fields
from build_tops import normalize  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

CELL_W, CELL_H = 682, 409
GRID_COLS, GRID_ROWS = 3, 10          # 30 格位 ≥ 基础 13 + 雪 13
SCALE_MIN, SCALE_MAX = 0.1, 8.0      # 入库校验：prefab 的 scale 必须落在这区间
ATLAS_W, ATLAS_H = 2048, 4096
SNOW_DIR = "scene/ground/mountain_snow"


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

            % (season_dir, form, [k.get("class") for k in kids]))
    root_s, ch = d["scale"], kids[0]
    if abs(root_s[0] - 1.0) > 1e-6 or abs(root_s[1] - 1.0) > 1e-6:
        raise SystemExit("⛔ %s 的根节点 scale 不是 1（%s），件的换算要连根一起算" % (form, root_s))
    sx, sy = float(ch["scale"][0]), float(ch["scale"][1])
    if not (SCALE_MIN < sx < SCALE_MAX and SCALE_MIN < sy < SCALE_MAX):
        raise SystemExit("⛔ %s 的 scale %s 不在 (%s, %s) 内" % (form, (sx, sy), SCALE_MIN, SCALE_MAX))
    return {"texture": normalize(ch["texture"]),
            "scale": [round(sx, 6), round(sy, 6)],
            "offset": [round(float(ch["position"][0]), 4), round(float(ch["position"][1]), 4)],
            "angle": round(float(ch["angle"][2]), 4),
            "pivot": [round(float(x), 4) for x in ch["pivot"]],
            "lowZ": int(ch["low_z"]),
            **visual_fields(ch)}


def load_sprites(*dirs: str) -> dict:
    """贴图逻辑路径（小写）→ **未裁**的 RGBA 图。⚠ 缺一张就退出，⛔ 不静默降级。"""
    got = {}
    for line in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        lg = r["logical"]
        if not any(lg.startswith("%s/png/" % d) for d in dirs):
            continue
        p = os.path.join(OUT, r["out"])
        if not os.path.exists(p):
            continue
        # ⛔ 不裁 bbox：裁了就与 prefab 的 size / position 对不上（M0-B2）
        got[lg.lower()] = (lg, Image.open(p).convert("RGBA"))
    return got


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    sprites = load_sprites(MF.PREFAB_DIR_BASE, SNOW_DIR)

    # ── land 表互校（N1）：雪件列必须指向同形的 mountain_snow prefab，
    #    沙件列必须与基础季同路径（荒地山只有 src_name_3d 不同） ──────────
    variant_ids: dict = {}
    desert_same = 0
    for v in MF.VALUES:
        ids = LV.variant_res_ids(v)
        variant_ids[v] = ids
        form = MF.FORMS[v][1]
        snow_src = LV.res_src_name(ids["snow"])
        want_snow = "%s/%s_group.prefab" % (SNOW_DIR, form)
        if snow_src.lower() != want_snow.lower():
            raise SystemExit("⛔ land %d 的雪件列指向 %s，不是 %s" % (v, snow_src, want_snow))
        desert_src = LV.res_src_name(ids["desert"])
        base_src = LV.res_src_name(ids["base"])
        if desert_src.lower() != base_src.lower():
            raise SystemExit("⛔ land %d 的沙件列 %s ≠ 基础季 %s —— 「荒地山 2D 与基础季同件」"
                             "的实测被推翻，沙漠带要有自己的山件图集格了" % (v, desert_src, base_src))
        desert_same += 1

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells = []

    def place(slot: int, v: int, tr: dict, variant: str) -> None:
        shan, form, _tex, shape = MF.FORMS[v]
        logical, src = sprites[tr["texture"].lower()]
        native = [src.width, src.height]            # ★ 原图像素（未缩、未裁）
        if tr["size"] != native:
            raise SystemExit("⛔ %s（%s）的 prefab size %s ≠ 原图 %s —— 贴图对应搞错了"
                             % (form, variant, tr["size"], native))
        im = src.copy()
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        gx, gy = (slot % GRID_COLS) * CELL_W, (slot // GRID_COLS) * CELL_H
        ox, oy = (CELL_W - im.width) // 2, (CELL_H - im.height)       # ⚠ 底对齐
        atlas.paste(im, (gx + ox, gy + oy))
        cells.append({"id": v, "kind": "mountain", "variant": variant, "shan": shan,
                      "form": form, "shape": shape,
                      "footprintCells": len(MF.footprint_cells(v, 0)),
                      "cell": [gx, gy, CELL_W, CELL_H],
                      "art": [ox, oy, im.width, im.height],
                      "native": native,
                      "scale": tr["scale"], "offset": tr["offset"], "angle": tr["angle"],
                      "lowZ": tr["lowZ"], **{k: tr[k] for k in ("size", "pivot", "skew", "mirror_x", "mirror_y", "color", "add_color")}, "source": logical})

    for idx, v in enumerate(MF.VALUES):
        place(idx, v, read_transform(MF.PREFAB_DIR_BASE, MF.FORMS[v][1]), "base")
    for k, v in enumerate(MF.VALUES):
        place(len(MF.VALUES) + k, v, read_transform(SNOW_DIR, MF.FORMS[v][1]), "snow")

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "region-atlas.png"))
    info = {"schemaVersion": 3, "mapId": a.map, "cell": [CELL_W, CELL_H],
            "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
            "anchor": "prefab-pivot",
            "indexing": "格 id = 原版 res 值（48..61，⛔ 无 56）；贴图由 prefab 字符串池读出；"
                        "变体格同 id 空间、按 variant 分表（N1）",
            "transform": "scale/offset/angle/pivot 逐形取自该套件 prefab 的 sprite_2d；"
                         "offset 是精灵**中心**相对锚点格的偏移（原版 px），pivot 恒 [0.5, 0.5]",
            "variants": {"来源": "base.cw land 表 snow_client_res_id/desert_client_res_id"
                                 "（⛔ autumn 不接，M0-B3；雪件 = mountain_snow 同形 prefab）",
                         "desertSameAsBase": desert_same,
                         "desertSameAsBase依据": "荒地山的 2D src_name 与基础季逐字相同"
                                                "（只有 src_name_3d 不同）——有 2D 件的 13 形全中"
                                                "（山9 无 2D 件、数据 0 命中，不参与）",
                         "resIds": {str(v): variant_ids[v] for v in MF.VALUES}},
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
 * ★ **季/地貌变体**（N1）：`MAPO_REGION_CELLS` 是基础季，`MAPO_REGION_SNOW_CELLS` 是雪件
 *   （`mountain_snow` 同形 prefab，transform 逐形重读 ⛔ 不抄基础季）。哪格用哪套由
 *   `logic/mapoBands.ts` 的 cell 级地貌带定。⚠ **沙漠带的山件 = 基础季件**：
 *   land 表荒地山1..14 的 2D `src_name` 与基础季逐字相同（实测 14/14），⛔ 没有沙件表。
 *   ⚠ `autumn_*` 不接（M0-B3）。
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
    /** 基础季 / 雪（N1）。⚠ 沙漠带的山件与基础季同件，⛔ 没有沙件表。 */
    readonly variant: string;
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
    /** prefab 里 sprite 绕中心的旋转（**度**，CCW 为正）。 */
    readonly angle: number;
    /** prefab 里 sprite 的轴心，恒 [0.5, 0.5]（中心）。 */
    readonly pivot: readonly [number, number];
    readonly size: readonly [number, number];
    readonly skew: readonly [number, number];
    readonly mirror_x: boolean;
    readonly mirror_y: boolean;
    readonly color: readonly [number, number, number, number];
    readonly add_color: readonly [number, number, number, number];
    /** prefab 里 sprite 的 `low_z`（同节点内的叠序）。 */
    readonly lowZ: number;
}

export const MAPO_REGION_ATLAS_W = %d;
export const MAPO_REGION_ATLAS_H = %d;
export const MAPO_REGION_CELL_W = %d;
export const MAPO_REGION_CELL_H = %d;
/** 基础季 13 形。 */
export const MAPO_REGION_CELLS: readonly IMapoRegionCell[] = %s;
/** 雪山 13 形（id = 原版 res 值；N1）。 */
export const MAPO_REGION_SNOW_CELLS: readonly IMapoRegionCell[] = %s;
''' % (a.map, ATLAS_W, ATLAS_H, CELL_W, CELL_H,
       json.dumps([{k: v for k, v in c.items() if k != "source"}
                   for c in cells if c["variant"] == "base"], ensure_ascii=False, indent=2),
       json.dumps([{k: v for k, v in c.items() if k != "source"}
                   for c in cells if c["variant"] == "snow"], ensure_ascii=False, indent=2))
    open(os.path.join(d, "region.data.ts"), "w", encoding="utf-8").write(ts)
    print("山族件 %d 形 ×2 套（基础 + 雪）：%s"
          % (len(MF.VALUES),
             " ".join("%d=%s" % (c["id"], c["source"].rsplit("/", 1)[-1])
                      for c in cells if c["variant"] == "snow")))
    print("  沙漠山与基础季同件 %d/13（实测，⛔ 无沙件格；山9 无 2D 件、数据 0 命中不参与）"
          % desert_same)
    print("→ %s/region-atlas.png (%.1f MB)" % (d, os.path.getsize(os.path.join(d, "region-atlas.png")) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
