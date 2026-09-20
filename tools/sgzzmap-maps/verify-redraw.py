#!/usr/bin/env python3
"""terrain.bytes 的机检闸。用法：verify-redraw.py <mapId>

退出码非 0 即不合格。检查项见 README「P0 退出」。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config, imaging, terrain as T  # noqa: E402

WATER_BAND = (0.05, 0.35)     # 海+水域占全图的合理带
PROTECTED = {T.ID["water"], T.ID["sea"], T.ID["offmap"]}


def run(map_id: str) -> int:
    cfg = config.load(map_id)
    rows, cols = cfg["grid"]["rows"], cfg["grid"]["cols"]
    out = config.out_dir(map_id)
    raw = (out / "terrain.bytes").read_bytes()
    meta = json.loads((out / "terrain.meta.json").read_text(encoding="utf-8"))
    fails: list[str] = []

    def check(ok: bool, msg: str) -> None:
        print(("  ✅ " if ok else "  ❌ ") + msg)
        if not ok:
            fails.append(msg)

    print(f"{map_id}：")
    check(len(raw) == 8 + rows * cols, f"字节数 {len(raw)} == 8 + {rows}×{cols} = {8 + rows*cols}")
    h_rows, h_cols = struct.unpack(">II", raw[:8])
    check((h_rows, h_cols) == (rows, cols), f"头解出 ({h_rows}, {h_cols}) == ({rows}, {cols})")
    check(hashlib.sha256(raw).hexdigest() == meta["sha256"], "sha256 与 terrain.meta.json 一致")
    check(meta["byteLength"] == len(raw), "meta.byteLength 与实际一致")

    cells = np.frombuffer(raw, np.uint8, offset=8).reshape(rows, cols)
    max_id = max(p[0] for p in T.PALETTE)
    check(int(cells.max()) <= max_id, f"最大地形 id {int(cells.max())} ≤ {max_id}")
    ids_in_meta = {e["id"] for e in meta["palette"]}
    check(set(int(v) for v in np.unique(cells)) <= ids_in_meta, "出现的 id 都在调色板内")

    water_share = float(((cells == T.ID["sea"]) | (cells == T.ID["water"])).mean())
    check(WATER_BAND[0] <= water_share <= WATER_BAND[1],
          f"水面占比 {100*water_share:.1f}% 在 {100*WATER_BAND[0]:.0f}–{100*WATER_BAND[1]:.0f}% 内")

    min_tiles = int(cfg["terrain"]["minRegionTiles"])
    worst = []
    for tid, name, cn, _rgb, _p in T.PALETTE:
        sel = cells == tid
        if not sel.any():
            continue
        lab, n = ndi.label(sel, structure=imaging.ST)
        sizes = ndi.sum(sel, lab, range(1, n + 1)) if n else np.array([])
        tiny = int((sizes < min_tiles).sum()) if sizes.size else 0
        biggest = int(sizes.max()) if sizes.size else 0
        flag = "（豁免）" if tid in PROTECTED else ""
        print(f"     {cn:<4} id={tid} 格数 {int(sel.sum()):>9} 连通域 {n:>6} "
              f"最大 {biggest:>9} 小于{min_tiles}格的 {tiny:>6} {flag}")
        if tid not in PROTECTED and tiny:
            worst.append(f"{cn} 有 {tiny} 个小于 {min_tiles} 格的连通域")
    check(not worst, f"非豁免地形无小于 {min_tiles} 格的碎块" + ("：" + "；".join(worst) if worst else ""))

    print(("通过" if not fails else f"不通过（{len(fails)} 项）"))
    return 0 if not fails else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    raise SystemExit(run(ap.parse_args().map_id))
