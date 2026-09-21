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
}}

/** 大区（{ncanton} 个）：远档显示。 */
export const MAPO_CANTON_LABELS: readonly IMapoLabel[] = {cantons};

/** 郡（{narea} 个）：中近档显示。 */
export const MAPO_AREA_LABELS: readonly IMapoLabel[] = {areas};

/** 城址（{ncity} 座）：原版 `city_center.lua` 的**真坐标**，⛔ 无名字（名字在服务端 AOI 里）。 */
export const MAPO_CITY_SITES: readonly IMapoCitySite[] = {cities};
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

    ts = HEAD.format(map=a.map, ncanton=len(data["cantons"]), narea=len(data["areas"]),
                     ncity=len(data.get("cities", [])),
                     cantons=rows("cantons"), areas=rows("areas"), cities=rows("cities", None))
    dst = a.out or os.path.join(d, "labels.data.ts")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(ts)
    print("→ %s（大区 %d、郡 %d、城 %d，%.1f KB）"
          % (dst, len(data["cantons"]), len(data["areas"]), len(data.get("cities", [])),
             os.path.getsize(dst) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
