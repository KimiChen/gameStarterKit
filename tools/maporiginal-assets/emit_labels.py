#!/usr/bin/env python3
"""labels.json → shared TS 地名模块（小，直接进 shared）。

    /tmp/maporiginal-venv/bin/python emit_labels.py [--map s1] [--out <ts>]

⚠ 与地形不同：地名只有几十条、几 KB，⛔ 没必要走资源加载 —— 进 shared 就能首帧画出来，
将来服务端要按郡做统计也现成。
"""
from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

HEAD = """/**
 * mapOriginal 地名与城址（{map}）—— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_labels.py` 从原版
 * `script/ui/view/map/birdview/season_cfg/{map}/{{canton,area}}_name_info.lua`
 * 与 `asset/config/S1/cn/res_pro/city_center.lua` 派生。
 * ⚠ 原表的 `name` 是 i18n key（`地图文案_西凉`），这里取 `_` 之后的显示名。
 * ⚠ 位置是原表自带的 `grid`（每条地名的落点），⛔ 不是我们算的分区质心。
 */

export interface IMapoLabel {{
  readonly name: string;
  readonly row: number;
  readonly col: number;
  /** 郡才有；大区没有。 */
  readonly areaId?: number;
}}

export interface IMapoCitySite {{
  readonly id: number;
  readonly row: number;
  readonly col: number;
  /** 城名，如「南皮」「风陵渡」。 */
  readonly name: string;
  /** `大型城池` / `中型城池` / `小型城池`。 */
  readonly cityType: string;
  /** 城池等级（1..8）。 */
  readonly level: number;
  /** 占格形状代号，如 `H_SHAPE` / `DOUBLE_H_SHAPE` / `RADIUS_2` / `PIER_*`。 */
  readonly shape: string;
  /** 原版 3D 件 id（`city_res`）；⚠ 2D 沙盘用不上，只作溯源。 */
  readonly clientResId: number;
}}

/** 大区（{ncanton} 个）：远档显示。 */
export const MAPO_CANTON_LABELS: readonly IMapoLabel[] = {cantons};

/** 郡（{narea} 个）：中近档显示。 */
export const MAPO_AREA_LABELS: readonly IMapoLabel[] = {areas};

/**
 * 城址（{ncity} 座）：原版 `city_center.lua` 的**真坐标** + `base.cw` 的**真名与类型**。
 *
 * ★ 名字/类型/等级/形状来自 `base.cw` 的 `city[1]` 桶（2026-09-23，MAPORIGINAL-2D §11-1），
 *   经 `city_shape_grids`（格 → 城序号）对上。
 *   ⚠ 本模块一度写着「⛔ 无名字（名字在服务端 AOI 里）」——**那是错的**，
 *   名字一直在客户端配置里，只是当时 `base.cw` 没解开。
 * ★ **形状与占格 1:1 自洽**（独立互证）：{shapePairs}。
 * ⚠ 其中 **12 座是渡口**（`PIER_*`：孟津/风陵渡/蒲坂津/白马/夏口…），
 *   它们在 `city_shape` 里带非零 `even_res_center`/`odd_res_center` 美术偏移；
 *   ⛔ 将来画城址件时这 12 座要套偏移，其余 237 座偏移为 0。
 */
export const MAPO_CITY_SITES: readonly IMapoCitySite[] = {cities};

/**
 * 城的**占格**（{ncity} 座共 {ncell} 格）—— 格键 `row * 10000 + col`，按城序、城内按原表序。
 *
 * ★ 来自 `map/{map}/cn/city.bytes`（MAPORIGINAL-2D §5），每城第 1 格 == `MAPO_CITY_SITES[i]`。
 *   占格形态只有 5 种：{shapes}（格数:座数）。
 * ★ 用途 = 原版 `ViewModelResField:check_validate` 的**第 4 道门**（§2.1）：
 *   该格有 build 且 `is_show_res_field()` 为假 ⇒ **不画资源件**。⛔ 城址件与资源件不叠。
 * ⚠ 城**不在 `res.bytes` 里**：2,689 个城格 100% 是 `res==1` 平地、`res_multi==0`，
 *   地块层完全不知道城的存在 ⇒ 抑制只能靠这张表，⛔ 没法从地形值推出来。
 */
export const MAPO_CITY_CELL_KEYS: readonly number[] = {cityCellKeys};

/** 每座城占几格（{ncity} 项，前缀和即可切回逐城分组）。 */
export const MAPO_CITY_CELL_COUNTS: readonly number[] = {cityCellCounts};
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--out")
    a = ap.parse_args()
    d = os.path.join(OUT, "pack", a.map)
    data = json.load(open(os.path.join(d, "labels.json"), encoding="utf-8"))

    def rows(key: str, indent: int = 2) -> str:
        return json.dumps([{k: v for k, v in e.items() if k != "key"} for e in data.get(key, [])],
                          ensure_ascii=False, indent=indent)

    groups = data.get("cityCells", [])
    keys = [r * 10000 + c for g in groups for r, c in g]
    counts = [len(g) for g in groups]
    shapes = {}
    for n in counts:
        shapes[n] = shapes.get(n, 0) + 1
    pairs = {}
    for c, g in zip(data.get("cities", []), groups):
        pairs.setdefault(c.get("shape", "?"), set()).add(len(g))
    shape_pairs = "、".join("%s=%s 格" % (k, "/".join(str(x) for x in sorted(v)))
                           for k, v in sorted(pairs.items()))
    ts = HEAD.format(map=a.map, ncanton=len(data["cantons"]), narea=len(data["areas"]),
                     shapePairs=shape_pairs,
                     ncity=len(data.get("cities", [])), ncell=len(keys),
                     shapes="、".join("%d:%d" % kv for kv in sorted(shapes.items())),
                     cantons=rows("cantons"), areas=rows("areas"), cities=rows("cities", None),
                     cityCellKeys=json.dumps(keys), cityCellCounts=json.dumps(counts))
    dst = a.out or os.path.join(d, "labels.data.ts")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(ts)
    print("→ %s（大区 %d、郡 %d、城 %d / 占格 %d，%.1f KB）"
          % (dst, len(data["cantons"]), len(data["areas"]), len(data.get("cities", [])),
             len(keys), os.path.getsize(dst) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
