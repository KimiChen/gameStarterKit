#!/usr/bin/env python3
"""世界权威图（Z09）→ 海陆掩膜 + 郡分区。

用法：extract-world.py <mapId>
产物：out/<mapId>/world.npz（land/sea/region，均为 rows×cols 网格分辨率）
      out/<mapId>/world-mask.png（目检图）
      out/<mapId>/regions.json（郡分区元数据）
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config, imaging  # noqa: E402


def quantize_regions(rgb, land, cfg, rows, cols):
    """势力色块 → 郡分区。取的是「分区形状」，⛔ 不是地形类型（色块是势力设色）。

    先降到网格分辨率再中值滤波再量化——在源分辨率上量化会碎成几万个噪点连通域。
    小于 minTiles 的碎块用一次 EDT 最近邻整体归并，⛔ 不要逐块 dilation（1500² 上跑不完）。
    """
    rq = cfg["regions"]
    small = Image.fromarray(rgb.astype(np.uint8)).resize((cols, rows), Image.BOX)
    small = small.filter(ImageFilter.MedianFilter(5))
    idx = np.asarray(small.quantize(colors=rq["quantizeColors"], method=Image.MEDIANCUT))
    idx = np.where(land, idx.astype(np.int16), -1)

    region = np.zeros((rows, cols), np.int32)
    next_id = 1
    for value in np.unique(idx):
        if value < 0:
            continue
        lab, n = ndi.label(idx == value, structure=imaging.ST)
        if n:
            region[lab > 0] = lab[lab > 0] + (next_id - 1)
            next_id += n

    sizes = np.bincount(region.ravel(), minlength=next_id)
    keep_ids = {int(i) for i in np.nonzero(sizes >= rq["minTiles"])[0] if i > 0}
    if not keep_ids:
        raise SystemExit("没有任何郡达到 minTiles——调小 regions.minTiles 或 quantizeColors")
    kept = np.isin(region, list(keep_ids))
    # 碎块与未分配的陆地：一次 EDT，取最近保留郡的编号
    _, (iy, ix) = ndi.distance_transform_edt(~kept, return_indices=True)
    region = np.where(land, np.where(kept, region, region[iy, ix]), 0)

    ids = [int(i) for i in np.unique(region) if i > 0]
    remap = np.zeros(max(ids) + 1, np.int32)
    for new_id, old in enumerate(ids, start=1):
        remap[old] = new_id
    return remap[region], len(ids)


def run(map_id: str) -> None:
    cfg = config.load(map_id)
    rows, cols = cfg["grid"]["rows"], cfg["grid"]["cols"]
    prepared = config.out_dir(map_id) / "sources" / (cfg["worldAuthority"].rsplit(".", 1)[0] + ".png")
    if not prepared.is_file():
        raise SystemExit(f"先跑 prepare-source.py {map_id}（缺 {prepared}）")

    rgb, hsv = imaging.load_rgb_hsv(prepared)
    sea_px = imaging.sea_mask(rgb, hsv, cfg["sea"])
    frame_px = imaging.frame_mask(rgb, hsv, sea_px, cfg["frame"])
    land_px = imaging.land_mask(~sea_px & ~frame_px, cfg["landMorph"])
    # ⚠ 闭运算 + 填洞会把海湾一起吞掉（实测吃掉约一半海面）。轮廓用形态学求，海面按原始掩膜挖回来。
    land_px &= ~sea_px
    print(f"源图 {rgb.shape[1]}×{rgb.shape[0]}：海 {100*sea_px.mean():.1f}%  陆 {100*land_px.mean():.1f}%")

    land = imaging.resample_mask(land_px, rows, cols)
    sea = imaging.resample_mask(sea_px, rows, cols) & ~land
    region, n_regions = quantize_regions(rgb, land, cfg, rows, cols)
    offmap = ~land & ~sea
    print(f"网格 {rows}×{cols}：陆 {100*land.mean():.1f}%  海 {100*sea.mean():.1f}%  "
          f"图外 {100*offmap.mean():.1f}%  郡 {n_regions} 个")

    out = config.out_dir(map_id)
    np.savez_compressed(out / "world.npz", land=land, sea=sea, region=region.astype(np.uint16))

    vis = np.zeros((rows, cols, 3), np.uint8)
    vis[land] = (150, 165, 110); vis[sea] = (62, 95, 108); vis[offmap] = (128, 125, 105)
    rng = np.random.default_rng(7)
    tint = rng.integers(-26, 27, size=(n_regions + 1, 3))
    tint[0] = 0
    vis = np.clip(vis.astype(np.int16) + tint[region], 0, 255).astype(np.uint8)
    Image.fromarray(vis).resize((cols // 2, rows // 2), Image.BOX).save(out / "world-mask.png")

    sizes = np.bincount(region.ravel(), minlength=n_regions + 1)
    (out / "regions.json").write_text(json.dumps({
        "schemaVersion": 1, "mapId": map_id, "rows": rows, "cols": cols,
        "count": n_regions,
        "landTiles": int(land.sum()), "seaTiles": int(sea.sum()), "offmapTiles": int(offmap.sum()),
        "regions": [{"id": int(i), "tiles": int(sizes[i])} for i in range(1, n_regions + 1)],
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {out}/world.npz, regions.json, world-mask.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    run(ap.parse_args().map_id)
