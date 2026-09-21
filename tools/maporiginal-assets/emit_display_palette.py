#!/usr/bin/env python3
"""16 类显示层调色板 → shared TS（只有调色板，⛔ 不含格数据）。

    /tmp/maporiginal-venv/bin/python emit_display_palette.py [--map s1] [--out <ts>]

⚠ 为什么要单独一份：显示层的**格数据**塞不进 shared（熵 2.95 bit/格），但它的**调色板**
（16 条、约 1 KB）必须进 —— 客户端要拿它给近档着色、给详情面板显示地形中文名。
⛔ 别再拿 4 类通行层的 `MAPO_TERRAIN_PALETTE` 去查 16 类 id（会把「森林」显示成「可走陆地」）。
"""
from __future__ import annotations

import argparse
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--out")
    a = ap.parse_args()
    info = json.load(open(os.path.join(OUT, "pack", a.map, "terrain.info.json"), encoding="utf-8"))
    rows = [{"id": e["id"], "name": e["name"], "cn": e["cn"], "color": e["color"],
             "passable": e["passable"]} for e in info["palette"]]
    ts = '''/**
 * mapOriginal **显示层**（16 类）调色板 —— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_display_palette.py` 从 `terrain.info.json` 派生。
 * ⚠ 这里只有调色板：显示层的格数据走 Cocos BufferAsset（熵太高，塞不进 shared），
 *   见 `apps/kits/mapOriginal/README.md` §3。
 * ⛔ 别拿 4 类通行层的 `MAPO_TERRAIN_PALETTE` 去查 16 类 id。
 */
import type { IMapoTerrainClass } from "../api/hexmap/index";

export const MAPO_DISPLAY_PALETTE: readonly IMapoTerrainClass[] = %s;

/** id → 类，⛔ 不要每格去 find。 */
export const MAPO_DISPLAY_BY_ID: ReadonlyMap<number, IMapoTerrainClass> =
    new Map(MAPO_DISPLAY_PALETTE.map((e) => [e.id, e]));
''' % json.dumps(rows, ensure_ascii=False, indent=2)
    dst = a.out or os.path.join(OUT, "pack", a.map, "display.data.ts")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(ts)
    print("→ %s（%d 类，%.1f KB）" % (dst, len(rows), os.path.getsize(dst) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
