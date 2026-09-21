#!/usr/bin/env python3
"""把原版鸟瞰底图标定到世界包围盒（求 scale + 偏移），并出人工目检叠加图。

    /tmp/maporiginal-venv/bin/python calibrate_plate.py [--map s1] [--overlay]

⚠ 美术底图**不是**世界包围盒的等比缩放：它把海与云雾画到了可玩菱形之外
（实测陆+海只占 0.666W × 0.896H，两个比例对不上）。所以落位必须标定，
⛔ 不能像 sgzzmap 那样「构造出来的对齐」直接按包围盒贴。

做法：把 terrain 的**陆/水掩膜**渲染进世界空间，对底图的陆/海掩膜做
(scale, dx, dy) 三参数粗到细互相关，取交并比最高的一组。
"""
from __future__ import annotations

import argparse
import json
import os
import struct

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PLATE = "png/fairy/ui/ui_common_map/map/map_%s/image/noexpo_birdview_map_1.png"


def world_masks(mid: str, w: int, h: int):
    """terrain -> 世界空间的 (陆掩膜, 水掩膜)，尺寸 w×h、2:1。
    ⚠ 陆掩膜**剔除河/水**：标定要陆对陆，把美术图外扩的那片海算进来会把结果拽偏。"""
    d = os.path.join(OUT, "pack", mid)
    raw = open(os.path.join(d, "terrain.bytes"), "rb").read()
    rows, cols = struct.unpack(">II", raw[:8])
    cls = np.frombuffer(raw, np.uint8, offset=8).reshape(rows, cols)
    info = json.load(open(os.path.join(d, "terrain.info.json"), encoding="utf-8"))
    ids = {e["name"]: e["id"] for e in info["palette"]}
    r, c = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
    # 原作 2D 投影：x=(row-col)*TILE_W，y=-(row+col+1)*TILE_H ⇒ 归一化即旋转 45°
    u = (((r - c) + cols - 1) / (rows + cols - 2) * (w - 1)).astype(np.int32)
    v = ((r + c) / (rows + cols - 2) * (h - 1)).astype(np.int32)
    land = np.zeros((h, w), bool)
    water = np.zeros((h, w), bool)
    wet = np.isin(cls, [ids["water"], ids["river"]])
    land[v.ravel(), u.ravel()] = True
    water[v[wet], u[wet]] = True
    land &= ~water
    return land, water


def plate_masks(mid: str, w: int, h: int):
    im = Image.open(os.path.join(OUT, PLATE % mid)).convert("RGB").resize((w, h), Image.LANCZOS)
    a = np.asarray(im).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    sat = a.max(2) - a.min(2)
    # ⚠ 云雾是低饱和的灰绿，阈值放松会把左上角那片云当成陆
    land = (g >= b + 4) & (sat > 34) & (a.max(2) < 232)
    sea = (b > r + 14) & (b > g + 8) & (sat > 16)
    return land, sea


def iou(a: np.ndarray, b: np.ndarray) -> float:
    u = (a | b).sum()
    return float((a & b).sum()) / u if u else 0.0


def search(mid: str, w=512, h=256):
    wl, _ww = world_masks(mid, w, h)
    pl, _ps = plate_masks(mid, w, h)
    target = pl                                        # ⚠ 陆对陆，⛔ 不含外扩的海
    best = None

    def sweep(ks, xs, ys):
        nonlocal best
        for k in ks:
            sw, sh = max(4, int(w * k)), max(2, int(h * k))
            small = np.asarray(
                Image.fromarray(wl.astype(np.uint8) * 255).resize((sw, sh), Image.NEAREST)) > 127
            for dx in xs:
                if dx < 0 or dx + sw > w:
                    continue
                for dy in ys:
                    if dy < 0 or dy + sh > h:
                        continue
                    canvas = np.zeros((h, w), bool)
                    canvas[dy:dy + sh, dx:dx + sw] = small
                    sc = iou(canvas, target)
                    if best is None or sc > best[0]:
                        best = (sc, float(k), dx / w, dy / h)

    sweep(np.arange(0.50, 1.02, 0.02), range(0, w, 8), range(0, h, 4))       # 粗
    _s, k0, fx0, fy0 = best
    x0, y0 = int(fx0 * w), int(fy0 * h)
    sweep(np.arange(max(0.40, k0 - 0.04), min(1.02, k0 + 0.041), 0.005),      # 细
          range(x0 - 12, x0 + 13), range(y0 - 8, y0 + 9))
    return best


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--overlay", action="store_true", help="出人工目检叠加图")
    a = ap.parse_args()

    s, k, fx, fy = search(a.map)
    print("标定：scale=%.3f  偏移=(%.4f, %.4f)W/H  IoU=%.3f" % (k, fx, fy, s))
    d = os.path.join(OUT, "pack", a.map)
    json.dump({"schemaVersion": 1, "mapId": a.map, "plate": PLATE % a.map,
               "scale": round(k, 4), "offsetFracX": round(fx, 5), "offsetFracY": round(fy, 5),
               "iou": round(s, 4),
               "note": "世界包围盒 -> 底图像素：u = (fx + x_norm*scale)*W，v = (fy + y_norm*scale)*H；"
                       "x_norm/y_norm 是世界包围盒内的 [0,1] 归一化坐标。"},
              open(os.path.join(d, "plate.calib.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("→ %s/plate.calib.json" % d)

    if a.overlay:
        W, H = 1024, 512
        wl, ww = world_masks(a.map, W, H)
        im = Image.open(os.path.join(OUT, PLATE % a.map)).convert("RGB").resize((W, H), Image.LANCZOS)
        arr = np.asarray(im).copy()
        sw, sh = int(W * k), int(H * k)
        dx, dy = int(fx * W), int(fy * H)
        edge = np.asarray(Image.fromarray(wl.astype(np.uint8) * 255).resize((sw, sh), Image.NEAREST)) > 127
        ee = edge ^ np.pad(edge, 1, mode="edge")[1:-1, 1:-1]
        sub = arr[dy:dy + sh, dx:dx + sw]
        sub[edge] = (sub[edge] * 0.55 + np.array([255, 60, 60]) * 0.45).astype(np.uint8)
        wsm = np.asarray(Image.fromarray(ww.astype(np.uint8) * 255).resize((sw, sh), Image.NEAREST)) > 127
        sub[wsm] = (sub[wsm] * 0.4 + np.array([60, 160, 255]) * 0.6).astype(np.uint8)
        arr[dy:dy + sh, dx:dx + sw] = sub
        p = os.path.join(OUT, "preview", "plate_calib_%s.png" % a.map)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        Image.fromarray(arr).save(p)
        print("人工闸叠加图 → %s（红=地形轮廓，蓝=河/水）" % p)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
