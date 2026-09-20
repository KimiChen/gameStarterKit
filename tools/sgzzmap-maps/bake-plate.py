#!/usr/bin/env python3
"""远档底图：把素材按与地形同一个仿射 warp 进等距世界空间。

用法：bake-plate.py <mapId> [--lod N]
产物：out/<mapId>/plate-lod<N>.png + plate-lod<N>.meta.json

对齐是构造出来的，不是标定出来的：地形按 fit:"grid" 取源图 (col/cols, row/rows) 处，
本脚本对底图做同一映射的逆变换，所以「图比格偏了几格」这类 bug 不可能存在。
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config, projection  # noqa: E402


def bake(cfg: dict, band: dict, map_id: str) -> None:
    rows, cols = cfg["grid"]["rows"], cfg["grid"]["cols"]
    tw, th = projection.TILE_HALF_W, projection.TILE_HALF_H
    out = config.out_dir(map_id)
    src_path = out / "sources" / (band["source"].rsplit(".", 1)[0] + ".png")
    if not src_path.is_file():
        raise SystemExit(f"先跑 prepare-source.py {map_id}（缺 {src_path}）")
    src = np.asarray(Image.open(src_path).convert("RGB"))
    sh, sw = src.shape[:2]

    pw, ph = band.get("size", [2048, 1024])
    min_x, min_y, max_x, max_y = projection.world_bounds(rows, cols, tw, th)

    px = (np.arange(pw, dtype=np.float64) + 0.5) / pw
    py = (np.arange(ph, dtype=np.float64) + 0.5) / ph
    X = min_x + px[None, :] * (max_x - min_x)
    Y = max_y - py[:, None] * (max_y - min_y)

    # grid2pos 的连续逆：A = x/TW = row-col, B = -y/TH-1 = row+col
    A = X / tw
    B = -Y / th - 1.0
    row = (A + B) * 0.5
    col = (B - A) * 0.5

    inside = (row >= 0) & (row < rows) & (col >= 0) & (col < cols)
    sy = np.clip((row / rows * sh).astype(np.int32), 0, sh - 1)
    sx = np.clip((col / cols * sw).astype(np.int32), 0, sw - 1)

    rgba = np.zeros((ph, pw, 4), np.uint8)
    rgba[..., :3] = src[sy, sx]
    rgba[..., 3] = np.where(inside, 255, 0)
    Image.fromarray(rgba).save(out / f"plate-lod{band['lod']}.png")

    (out / f"plate-lod{band['lod']}.meta.json").write_text(json.dumps({
        "schemaVersion": 1, "mapId": map_id, "lod": band["lod"], "source": band["source"],
        "size": [pw, ph],
        "world": {"minX": min_x, "minY": min_y, "maxX": max_x, "maxY": max_y},
        "tileHalf": [tw, th], "grid": {"rows": rows, "cols": cols},
        "pxPerWorldUnit": pw / (max_x - min_x),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  LOD{band['lod']} ← {band['source']}: {pw}×{ph}  覆盖率 {100*inside.mean():.1f}%")


def run(map_id: str, lod: int | None) -> None:
    cfg = config.load(map_id)
    bands = [b for b in cfg["bands"] if b["kind"] == "plate" and (lod is None or b["lod"] == lod)]
    if not bands:
        raise SystemExit("没有匹配的 plate 档位")
    for b in bands:
        bake(cfg, b, map_id)
    print(f"→ {config.out_dir(map_id)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id"); ap.add_argument("--lod", type=int)
    a = ap.parse_args()
    run(a.map_id, a.lod)
