#!/usr/bin/env python3
"""原版**值空间**调色板 → shared TS（只有调色板，⛔ 不含格数据）。

    /tmp/maporiginal-venv/bin/python emit_display_palette.py [--map s1] [--out <ts>]

★ 这一份是「按原游戏参数摆放」的查表底座：显示层每格存的就是**原版 res 值**
  （1 平地 / 2..41 资源(类型×等级) / 42..46 金矿 / 47 河流 / 48..61 多格地形），
  客户端拿到值后
    ① 查 `MAPO_VALUE_KIND_ID[v]` 得粗类 ⇒ 地表图集第几行（8 粗类 × 4 变体）；
    ② 直接拿 v 当摆件图集的格 id ⇒ 该放哪张原版 res_field 图（`decor.data.ts`）；
    ③ 查 `MAPO_VALUE_PALETTE` 得中文名/颜色/通行 ⇒ 详情面板与远档着色。
  ⛔ 零猜测、零随机：格长什么样完全由原版数据定。

⚠ 为什么只有调色板进 shared：显示层的**格数据**熵 2.95 bit/格，varint-RLE 胀到 125.6%
  （3.9 MB TS），⛔ 塞不进 shared；它走 Cocos BufferAsset。进 shared 的是 3 类通行层。
"""
from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
RES_TYPE_CN = ["木", "铁", "石", "粮"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--out")
    a = ap.parse_args()
    d = os.path.join(OUT, "pack", a.map)
    info = json.load(open(os.path.join(d, "terrain.info.json"), encoding="utf-8"))
    atlas = json.load(open(os.path.join(d, "atlas-lod0.info.json"), encoding="utf-8"))
    kinds = atlas["kinds"]                       # ⚠ 次序即粗类 id = 图集行号

    pal = info["palette"]
    vmax = max(e["id"] for e in pal)
    rows = []
    for e in pal:
        r = {"id": e["id"], "kind": e["kind"], "kindId": kinds.index(e["kind"]),
             "cn": e["cn"], "color": e["color"], "passable": e["passable"]}
        if "resType" in e:
            r["resType"] = e["resType"]
            r["level"] = e["level"]
        rows.append(r)
    by_id = {e["id"]: e for e in rows}
    unknown = kinds.index("unknown")
    kind_id = [by_id[v]["kindId"] if v in by_id else unknown for v in range(vmax + 1)]
    colors = [by_id[v]["color"] if v in by_id else [120, 120, 120] for v in range(vmax + 1)]

    ts = '''/**
 * mapOriginal **原版值空间**调色板 —— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_display_palette.py` 从 `terrain.info.json` +
 * `atlas-lod0.info.json` 派生。显示层每格存的就是**原版 res 值**（%s）。
 *
 * ★ 一格长什么样完全由这个值查出来，⛔ 不掺随机/哈希：
 *   ① `MAPO_VALUE_KIND_ID[v]` → 粗类 id → 地表图集第几行（%d 粗类 × 4 变体）；
 *   ② 值本身就是摆件图集格 id → 该格放哪张原版 res_field 图（见 `decor.data.ts`）；
 *   ③ `MAPO_VALUE_BY_ID.get(v)` → 中文名 / 颜色 / 通行。
 * ⚠ 资源类型编号→中文是**假设**（%s）。
 * ⛔ 别拿 3 类通行层的 `MAPO_TERRAIN_PALETTE` 来查这里的 id。
 */

export interface IMapoValueClass {
    /** 原版 res 值（res==0 的格由 res_multi 顶替，见 build_terrain.py）。 */
    readonly id: number;
    /** 粗类名，与地表图集的行一一对应。 */
    readonly kind: string;
    /** 粗类 id = 图集行号。 */
    readonly kindId: number;
    readonly cn: string;
    readonly color: readonly [number, number, number];
    readonly passable: boolean;
    /** 资源类型编号（0..3），仅资源格有。 */
    readonly resType?: number;
    /** 资源等级（1..10），仅资源格有。 */
    readonly level?: number;
}

/** 粗类表：**次序即粗类 id**，与 `atlas-lod*.info.json` 的 `kinds` 逐项相等。 */
export const MAPO_VALUE_KINDS: readonly string[] = %s;
/** 资源类型编号 → 中文。⚠ 静态数据定不了真实置换，见模块头。 */
export const MAPO_RES_TYPE_CN: readonly string[] = %s;
/** 原版值上界（含）。 */
export const MAPO_VALUE_MAX = %d;

export const MAPO_VALUE_PALETTE: readonly IMapoValueClass[] = %s;

/** 值 → 类，⛔ 不要每格去 find。 */
export const MAPO_VALUE_BY_ID: ReadonlyMap<number, IMapoValueClass> =
    new Map(MAPO_VALUE_PALETTE.map((e) => [e.id, e]));

/** 下标 = 原版值 → 粗类 id。**逐格热路径查这张表**，⛔ 不要查 Map。 */
export const MAPO_VALUE_KIND_ID: readonly number[] = %s;

/** 下标 = 原版值 → RGB。远档着色与顶点色走它，⛔ 不要查 Map。 */
export const MAPO_VALUE_COLORS: readonly (readonly [number, number, number])[] = %s;
''' % (info["rule"], len(kinds), info["resTypeAssumption"],
       json.dumps(kinds), json.dumps(RES_TYPE_CN, ensure_ascii=False), vmax,
       json.dumps(rows, ensure_ascii=False, indent=2),
       json.dumps(kind_id), json.dumps(colors))

    dst = a.out or os.path.join(d, "display.data.ts")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(ts)
    print("→ %s（%d 值 / %d 粗类，%.1f KB）" % (dst, len(rows), len(kinds),
                                              os.path.getsize(dst) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
