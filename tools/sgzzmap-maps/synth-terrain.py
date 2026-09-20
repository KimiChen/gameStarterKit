#!/usr/bin/env python3
"""海陆掩膜 + 郡分区 → terrain.bytes（1 字节/格）。

用法：synth-terrain.py <mapId>
产物：out/<mapId>/terrain.bytes, terrain.meta.json, terrain-preview.png

⚠ 源图 2048×1152 ≈ 2.36 Mpx 对 2.25 M 格 ≈ 1 px/格，所以陆内地形类型**不是**从图上判出来的
（Z09 的色块是势力设色，不是地貌）。做法是：海陆轮廓与郡分区取自 Z09，郡内的山/林/丘/水/湿地
按 seed 确定性程序化铺设，密度对齐 maps.config.json 的 density（参照 Z04/Z06 的目检观感）。
同一 seed + 同一配置 ⇒ 逐字节同产物。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config, imaging, terrain as T  # noqa: E402


def fbm(shape, seed: int, scale: float, octaves: int = 5, persistence: float = 0.5) -> np.ndarray:
    """确定性值噪声（粗噪声 + 双三次上采样叠加）。⛔ 不用全局随机源。"""
    rng = np.random.default_rng(seed)
    total = np.zeros(shape, np.float32)
    amp, norm, s = 1.0, 0.0, float(scale)
    for _ in range(octaves):
        h = max(2, int(shape[0] / s)); w = max(2, int(shape[1] / s))
        base = (rng.random((h, w), dtype=np.float32) * 255).astype(np.uint8)
        layer = np.asarray(Image.fromarray(base).resize((shape[1], shape[0]), Image.BICUBIC),
                           dtype=np.float32) / 255.0
        total += amp * layer
        norm += amp
        amp *= persistence
        s = max(2.0, s / 2)
    return total / norm


def pick_top(score: np.ndarray, pool: np.ndarray, fraction: float, land_count: int) -> np.ndarray:
    """在 pool 内按 score 取最高的 fraction×land_count 个格。"""
    want = int(round(fraction * land_count))
    if want <= 0 or not pool.any():
        return np.zeros_like(pool)
    vals = score[pool]
    if want >= vals.size:
        return pool.copy()
    cut = np.partition(vals, vals.size - want)[vals.size - want]
    return pool & (score >= cut)


def run(map_id: str) -> None:
    cfg = config.load(map_id)
    rows, cols = cfg["grid"]["rows"], cfg["grid"]["cols"]
    tcfg = cfg["terrain"]
    out = config.out_dir(map_id)

    world = np.load(out / "world.npz")
    land, sea = world["land"], world["sea"]
    land_count = int(land.sum())
    print(f"陆地 {land_count} 格（{100*land.mean():.1f}%）")

    seed = int(tcfg["seed"])
    scale = float(tcfg["featureScale"])
    coast_dist = ndi.distance_transform_edt(land).astype(np.float32)
    inland = np.clip(coast_dist / 60.0, 0.0, 1.0)

    # 山脊场：ridged multifractal（1-|2n-1|）在低频下会连成脊线，山地才像山脉而不是散点。
    ridge_field = 1.0 - np.abs(2.0 * fbm((rows, cols), seed + 303, scale * float(tcfg["ridgeScale"])) - 1.0)
    rw = float(tcfg["ridgeWeight"]); iw = float(tcfg["inlandWeight"])
    elevation = ridge_field * rw + fbm((rows, cols), seed, scale) * (1.0 - rw - iw) + inland * iw
    moisture = fbm((rows, cols), seed + 101, scale * 1.4)
    ridge = np.abs(fbm((rows, cols), seed + 202, scale * 2.2) - 0.5)

    cells = np.full((rows, cols), T.ID["offmap"], np.uint8)
    cells[sea] = T.ID["sea"]
    cells[land] = T.ID["plain"]

    d = tcfg["density"]
    pool = land.copy()
    mountain = pick_top(elevation, pool, d["mountain"], land_count)
    cells[mountain] = T.ID["mountain"]; pool &= ~mountain
    hill = pick_top(elevation, pool, d["hill"], land_count)
    cells[hill] = T.ID["hill"]; pool &= ~hill
    forest = pick_top(moisture, pool, d["forest"], land_count)
    cells[forest] = T.ID["forest"]; pool &= ~forest

    coastal = pool & (coast_dist <= float(tcfg["coastWetlandBand"]))
    wetland = pick_top(moisture, coastal, d["wetland"], land_count)
    cells[wetland] = T.ID["wetland"]; pool &= ~wetland

    # 河网：脊噪声的低值带成线。⛔ 不穿山（山体挡水看着就错）。
    water = pick_top(-ridge, pool & ~mountain, d["water"], land_count)
    cells[water] = T.ID["water"]

    # 碎块吸收；⚠ 水必须豁免——河流本来就是细长连通域，一并吸收会把河网抹平
    cells = imaging.drop_small_components(cells, int(tcfg["minRegionTiles"]),
                                          protect={T.ID["water"], T.ID["sea"], T.ID["offmap"]})

    ids, counts = np.unique(cells, return_counts=True)
    name_of = {tid: cn for tid, _n, cn, _rgb, _p in T.PALETTE}
    print("地形分布：")
    for tid, cnt in zip(ids, counts):
        print(f"  {name_of[int(tid)]:<4} id={int(tid)}  {cnt:9d}  {100*cnt/cells.size:5.2f}%"
              f"{'   (陆内 %.1f%%)' % (100*cnt/land_count) if land[cells == tid].any() and int(tid) not in (5, 8) else ''}")

    payload = struct.pack(">II", rows, cols) + cells.tobytes(order="C")
    (out / "terrain.bytes").write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    meta = T.meta(map_id, rows, cols, digest, len(payload))
    meta["source"] = {"worldAuthority": cfg["worldAuthority"], "seed": seed,
                      "density": d, "featureScale": scale}
    (out / "terrain.meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n",
                                           encoding="utf-8")

    preview = np.asarray(T.PREVIEW, np.uint8)[cells]
    Image.fromarray(preview).resize((cols // 2, rows // 2), Image.BOX).save(out / "terrain-preview.png")
    print(f"→ terrain.bytes {len(payload)} 字节  sha256 {digest[:16]}…")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    run(ap.parse_args().map_id)
