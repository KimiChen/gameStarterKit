#!/usr/bin/env python3
"""近档地块图集：从素材里切出每类地形最有代表性的贴片。

用法：cut-atlas.py <mapId> [--lod N]
产物：out/<mapId>/atlas-lod<N>.png + atlas-lod<N>.meta.json

⚠ 近三档的素材（Z00 一座城 / Z02 / Z04 一个郡）是区域特写，⛔ 不是全图的不同缩放，
所以它们不能当拉伸底图用；正确用法是贴片来源——取的是笔触与设色，不是地理。
⚠ 单张素材覆盖不全九类（Z00 里就没有荒漠、没有羊皮纸图框）。所以按「本档优先、按档距
就近回退」跨素材找，并把实际来源逐格记进 meta，⛔ 不假装它来自本档。
每格按菱形取 UV（四边中点），故图集格是 2:1。
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config, terrain as T  # noqa: E402

CELL_W, CELL_H, GRID_COLS = 256, 128, 3
MIN_STD = 12.0          # 贴片至少要有这么多纹理方差 —— ⚠ 近档要的是笔触，不是平色块
FLAT_PENALTY = 2.0      # 太平的贴片按差额罚分（Z09 的势力色块天生平，不罚就永远是它赢）
FALLBACK_PENALTY = 22.0 # 每退一档素材加的罚分：本档能用就别回退
TINT = 0.42             # 贴片朝调色板色的染色比例：保住笔触，同时让九类可辨


def _sat(a: np.ndarray) -> np.ndarray:
    return np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))


def score_field(arr: np.ndarray, target) -> tuple[np.ndarray, int, int]:
    """对每个窗口一次性算「均值偏差 + 方差惩罚」。用积分图，⛔ 不逐窗遍历。"""
    a = arr.astype(np.float64)
    h, w = a.shape[:2]
    oh, ow = h - CELL_H + 1, w - CELL_W + 1
    n = CELL_W * CELL_H
    mean = np.zeros((oh, ow, 3)); var = np.zeros((oh, ow, 3))
    for c in range(3):
        s1 = _sat(a[..., c]); s2 = _sat(a[..., c] ** 2)
        box1 = s1[CELL_H:, CELL_W:] - s1[:-CELL_H, CELL_W:] - s1[CELL_H:, :-CELL_W] + s1[:-CELL_H, :-CELL_W]
        box2 = s2[CELL_H:, CELL_W:] - s2[:-CELL_H, CELL_W:] - s2[CELL_H:, :-CELL_W] + s2[:-CELL_H, :-CELL_W]
        mean[..., c] = box1 / n
        var[..., c] = np.maximum(box2 / n - (box1 / n) ** 2, 0.0)
    tgt = np.asarray(target, np.float64)
    std = np.sqrt(var).mean(2)
    score = np.linalg.norm(mean - tgt, axis=2) + FLAT_PENALTY * np.maximum(MIN_STD - std, 0.0)
    idx = int(np.argmin(score))
    return float(score.flat[idx]), idx % ow, idx // ow, float(std.flat[idx])


def tint(patch: np.ndarray, rgb) -> np.ndarray:
    """朝目标色染，保留相对明暗（笔触）。"""
    a = patch.astype(np.float32)
    lum = a.mean(2, keepdims=True)
    base = np.asarray(rgb, np.float32)[None, None, :]
    shaded = np.clip(base * (lum / max(lum.mean(), 1.0)), 0, 255)
    return np.clip(a * (1 - TINT) + shaded * TINT, 0, 255).astype(np.uint8)


def run(map_id: str, only_lod: int | None) -> None:
    cfg = config.load(map_id)
    out = config.out_dir(map_id)
    bands = [b for b in cfg["bands"] if b["kind"] == "atlas"]
    loaded: dict[str, np.ndarray] = {}

    def source(name: str) -> np.ndarray:
        if name not in loaded:
            p = out / "sources" / (name.rsplit(".", 1)[0] + ".png")
            if not p.is_file():
                raise SystemExit(f"先跑 prepare-source.py {map_id} --all（缺 {p}）")
            loaded[name] = np.asarray(Image.open(p).convert("RGB"))
        return loaded[name]

    for band in [b for b in bands if only_lod is None or b["lod"] == only_lod]:
        # 本档优先，其余按档距就近；世界权威图殿后（它有海与羊皮纸图框）
        order = sorted(bands, key=lambda b: abs(b["lod"] - band["lod"]))
        prefer = [b["source"] for b in order] + [cfg["worldAuthority"]]
        prefer = list(dict.fromkeys(prefer))

        rows_n = (len(T.PALETTE) + GRID_COLS - 1) // GRID_COLS
        atlas = Image.new("RGBA", (CELL_W * GRID_COLS, CELL_H * rows_n), (0, 0, 0, 0))
        cells = []
        for tid, name, cn, rgb, _p in T.PALETTE:
            # 人工策展优先：配置里钉了 rect 就用它，⛔ 自动挑的贴片会把栅栏／小人／桥这类
            # 摆件也一起平铺到成千上万个格子上。策展格式：bands[].cells = {"plain": ["Z00-默认.png", x, y]}
            pinned = (band.get("cells") or {}).get(name)
            if pinned:
                sname, x, y = pinned[0], int(pinned[1]), int(pinned[2])
                patch = tint(source(sname)[y:y + CELL_H, x:x + CELL_W], rgb)
                cx, cy = (tid % GRID_COLS) * CELL_W, (tid // GRID_COLS) * CELL_H
                atlas.paste(Image.fromarray(patch).convert("RGBA"), (cx, cy))
                cells.append({"id": tid, "name": name, "cn": cn, "cell": [cx, cy, CELL_W, CELL_H],
                              "source": sname, "from": [x, y], "pinned": True, "tint": TINT})
                print(f"  LOD{band['lod']} {cn:<4} ← 人工策展     ({x:4d},{y:4d})")
                continue
            chosen = None
            for si, sname in enumerate(prefer):
                s, x, y, std = score_field(source(sname), rgb)
                s += FALLBACK_PENALTY * si
                if chosen is None or s < chosen[3]:
                    chosen = (sname, x, y, s, std)
            sname, x, y, s, std = chosen
            patch = tint(source(sname)[y:y + CELL_H, x:x + CELL_W], rgb)
            cx, cy = (tid % GRID_COLS) * CELL_W, (tid // GRID_COLS) * CELL_H
            atlas.paste(Image.fromarray(patch).convert("RGBA"), (cx, cy))
            own = "本档" if sname == band["source"] else f"回退 {sname.split('-')[0]}"
            cells.append({"id": tid, "name": name, "cn": cn, "cell": [cx, cy, CELL_W, CELL_H],
                          "source": sname, "from": [int(x), int(y)], "score": round(s, 2),
                          "std": round(std, 2), "tint": TINT})
            print(f"  LOD{band['lod']} {cn:<4} ← {own:<10} ({x:4d},{y:4d})  score {s:6.2f}  纹理 {std:5.1f}")
        atlas.save(out / f"atlas-lod{band['lod']}.png")
        (out / f"atlas-lod{band['lod']}.meta.json").write_text(json.dumps({
            "schemaVersion": 1, "mapId": map_id, "lod": band["lod"], "source": band["source"],
            "cell": [CELL_W, CELL_H], "gridCols": GRID_COLS, "size": list(atlas.size),
            "uv": "diamond-midpoints", "cells": cells,
        }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {out}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("map_id"); ap.add_argument("--lod", type=int)
    a = ap.parse_args(); run(a.map_id, a.lod)
