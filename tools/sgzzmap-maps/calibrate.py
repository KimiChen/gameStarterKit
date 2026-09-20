#!/usr/bin/env python3
"""人工标定闸：把判出来的海陆/郡界/网格叠回素材，供目检签字。

用法：calibrate.py <mapId> --overlay
      calibrate.py <mapId> --suggest-centroids
      calibrate.py <mapId> --check-links
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config, imaging  # noqa: E402


def overlay(map_id: str) -> None:
    cfg = config.load(map_id)
    rows, cols = cfg["grid"]["rows"], cfg["grid"]["cols"]
    out = config.out_dir(map_id)
    src = Image.open(out / "sources" / (cfg["worldAuthority"].rsplit(".", 1)[0] + ".png")).convert("RGB")
    w, h = src.size
    world = np.load(out / "world.npz")
    land, sea, region = world["land"], world["sea"], world["region"]

    def edges(mask):
        return mask & ~ndi.binary_erosion(mask, structure=imaging.ST)

    layer = np.zeros((rows, cols, 4), np.uint8)
    reg_edge = region != ndi.maximum_filter(region, size=3)
    layer[reg_edge & land] = (255, 200, 60, 150)      # 郡界 琥珀
    layer[edges(land)] = (255, 40, 40, 255)           # 陆缘 红
    layer[edges(sea)] = (60, 160, 255, 255)           # 海缘 蓝
    ov = Image.fromarray(layer).resize((w, h), Image.NEAREST)
    canvas = src.copy(); canvas.paste(ov, (0, 0), ov)

    d = ImageDraw.Draw(canvas)
    for r in range(0, rows + 1, 100):                  # 100 格一道刻度
        y = int(r / rows * h); d.line([(0, y), (w, y)], fill=(0, 0, 0), width=1)
        d.text((4, max(0, y - 12)), f"row {r}", fill=(0, 0, 0))
    for c in range(0, cols + 1, 100):
        x = int(c / cols * w); d.line([(x, 0), (x, h)], fill=(0, 0, 0), width=1)
        d.text((x + 3, 4), f"col {c}", fill=(0, 0, 0))
    canvas.save(out / "calibrate-overlay.png")
    print(f"→ {out}/calibrate-overlay.png　（★ 人工目检：陆缘红线是否贴海岸、郡界是否贴色块）")


def suggest_centroids(map_id: str) -> None:
    cfg = config.load(map_id)
    src = config.out_dir(map_id) / "sources" / (cfg["worldAuthority"].rsplit(".", 1)[0] + ".png")
    a = np.asarray(Image.open(src).convert("RGB"))
    q = (a >> 3).astype(np.int32)
    key = q[..., 0] * 1024 + q[..., 1] * 32 + q[..., 2]
    vals, counts = np.unique(key, return_counts=True)
    print("主色（5bit 量化，降序）：")
    for i in np.argsort(-counts)[:12]:
        k = int(vals[i])
        print(f"  [{(k//1024)*8:3d},{((k//32)%32)*8:3d},{(k%32)*8:3d}]  {100*counts[i]/key.size:5.2f}%")


def check_links(map_id: str) -> int:
    cfg = config.load(map_id)
    out = config.out_dir(map_id)
    path = out / "links.json"
    if not path.is_file():
        print(f"（无 {path}，跳过）"); return 0
    data = json.loads(path.read_text(encoding="utf-8"))
    rows, cols = cfg["grid"]["rows"], cfg["grid"]["cols"]
    raw = (out / "terrain.bytes").read_bytes()
    cells = np.frombuffer(raw, np.uint8, offset=8).reshape(rows, cols)
    from lib import terrain as T
    passable = {tid for tid, _n, _cn, _rgb, p in T.PALETTE if p}
    fails = []
    table = {tuple(e["pos"]): [tuple(a) for a in e["adjacents"]] for e in data["links"]}
    for pos, adjs in table.items():
        if cells[pos[0], pos[1]] not in passable:
            fails.append(f"{pos} 落在不可通行地形上")
        for a in adjs:
            if cells[a[0], a[1]] not in passable:
                fails.append(f"{pos}→{a} 的对端落在不可通行地形上")
            if pos not in table.get(a, []):
                fails.append(f"{pos}→{a} 不对称（B 处没有回指 A）")
    for f in fails:
        print("  ❌ " + f)
    print("通过" if not fails else f"不通过（{len(fails)} 项）")
    return 0 if not fails else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--overlay", action="store_true")
    ap.add_argument("--suggest-centroids", action="store_true")
    ap.add_argument("--check-links", action="store_true")
    a = ap.parse_args()
    if a.overlay: overlay(a.map_id)
    if a.suggest_centroids: suggest_centroids(a.map_id)
    if a.check_links: raise SystemExit(check_links(a.map_id))
    if not (a.overlay or a.suggest_centroids or a.check_links): ap.error("选一个动作")
