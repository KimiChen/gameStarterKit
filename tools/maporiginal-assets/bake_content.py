#!/usr/bin/env python3
"""烘焙 mapOriginal 内容包的图像件：远档底图 / 缩略图 / 近档贴片图集。

    /tmp/maporiginal-venv/bin/python bake_content.py [--map s1]

⚠ **为什么远档底图是烘出来的、不是直接用原版鸟瞰图**：
   原版 `noexpo_birdview_map_1.ktx` 是 **3D 相机的透视渲染**，与本仓的正交等距投影
   ⛔ 不存在可靠的 2D 对齐 —— 实测相似变换 IoU 0.62、河网 NCC 0.30、全仿射拟合退化成
   竖条纹假峰（NCC 0.51）。逐格对齐的层（plate 参与点选与视窗指示）必须自己烘。
   原版鸟瞰图改作**装饰性缩略图**，落位只做近似（plate.calib.json）。

⚠ 近档贴片由**原版可平铺 3D 地表 albedo** 合成（仍是原版像素）：包里 ⛔ 没有现成的
   等距地块图，原版 2D 档的 .group 地表也不在基础包内（见 README §4.2）。
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
PNG = os.path.join(OUT, "png")

# 每个显示类取哪张原版 albedo 做底纹（⛔ 不存在的就退化为纯色）
TEXTURE_OF = {
    "plain":    "scene_3d/ground/gaodi/tex/grass.png",
    "wood":     "scene_3d/ground/mountain_new/grass/tex/m_grass_xl_slope_01_d.png",
    "stone":    "scene_3d/ground/gaodi_shan/tex/m_grass_xl_04_d.png",
    "food":     "scene_3d/ground/mountain_new/grass_fall/tex/m_grass_fall_xl_slope_01_d.png",
    "iron":     "scene_3d/ground/dibiaohuawen/tex/xiaobujian_d.png",
    "gold":     "scene_3d/ground/mountain_new/grass_fall/tex/m_grass_fall_xl_slope_03_d.png",
    "water":    "scene_3d/pcg_v5/water/normal.png",
    "forest":   "scene_3d/ground/mountain_new/th_shan/tex/m_grass_xl_slope_01_d.png",
    "wetland":  "scene_3d/ground/gaodi/tex/grass.png",
    "desert":   "scene_3d/ground/gaodi_snow/tex/zhandao_02_d.png",
    "hill":     "scene_3d/ground/gaodi_shan/tex/m_grass_xl_04_d.png",
    "river":    "scene_3d/ground/terrain/albedo_river_v2.png",
    "mountain": "scene_3d/ground/mountain_new/th_shan/tex/m_grass_xl_slope_03_d.png",
    "grove":    "scene_3d/ground/mountain_new/grass/tex/m_grass_xl_slope_03_d.png",
    "scatter":  "scene_3d/ground/gaodi/tex/grass.png",
    "special":  "scene_3d/ground/dibiaohuawen_snow/tex/xiaobujian_d.png",
}
# ⚠ 单格 240×120（仍 2:1）而不是 256×128：8 列 × (256+8) = 2112 > 2048 放不下，
#   240 的节距 248 × 8 = 1984 ≤ 2048、行 128 × 8 = 1024 正好铺满。
CELL_W, CELL_H, GUTTER = 240, 120, 4
# ★ 每类 **4 个变体**：同一张片复制上千遍时整片地会读作「铺地砖」而不是连续地貌。
#   16 类 × 4 变体 = 64 格，8×8 正好铺满 2048×1024。
ATLAS_W, ATLAS_H, GRID_COLS, VARIANTS = 2048, 1024, 8, 4


def load_pack(mid: str):
    d = os.path.join(OUT, "pack", mid)
    raw = open(os.path.join(d, "terrain.bytes"), "rb").read()
    rows, cols = struct.unpack(">II", raw[:8])
    cls = np.frombuffer(raw, np.uint8, offset=8).reshape(rows, cols)
    info = json.load(open(os.path.join(d, "terrain.info.json"), encoding="utf-8"))
    return d, rows, cols, cls, info


def bake_plate(d, rows, cols, cls, info, sizes=((2048, 1024, 4), (1024, 512, 5))):
    """按世界包围盒烘远档底图（**逐格精确对齐**，⛔ 无标定误差）。"""
    pal = np.array([e["color"] for e in info["palette"]], np.uint8)
    r, c = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
    for W, H, lod in sizes:
        u = (((r - c) + cols - 1) / (rows + cols - 2) * (W - 1)).astype(np.int32)
        v = ((r + c) / (rows + cols - 2) * (H - 1)).astype(np.int32)
        img = np.zeros((H, W, 4), np.uint8)
        img[v.ravel(), u.ravel(), :3] = pal[cls.ravel()]
        img[v.ravel(), u.ravel(), 3] = 255
        # 菱形内部的采样空洞：一次 3x3 最大值填补
        from scipy.ndimage import grey_dilation
        for ch in range(4):
            img[..., ch] = grey_dilation(img[..., ch], size=(2, 2))
        p = os.path.join(d, "plate-lod%d.png" % lod)
        Image.fromarray(img).save(p)
        json.dump({"schemaVersion": 1, "lod": lod, "size": [W, H],
                   "note": "由 terrain.bytes 按世界包围盒烘焙，逐格精确对齐；"
                           "⛔ 不读此文件定位，落位用 mapoWorldBounds() 同式算出"},
                  open(os.path.join(d, "plate-lod%d.info.json" % lod), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  plate-lod%d %dx%d -> %s" % (lod, W, H, os.path.basename(p)))


def bake_minimap(d, mid):
    """原版鸟瞰底图 -> 装饰性缩略图 + 菱形蒙版。⚠ 装饰件，⛔ 不参与点选定位。"""
    src = os.path.join(PNG, "fairy/ui/ui_common_map/map/map_%s/image/noexpo_birdview_map_1.png" % mid)
    if not os.path.exists(src):
        print("  ⚠ 缺原版鸟瞰底图，跳过缩略图")
        return
    im = Image.open(src).convert("RGBA")
    side = 512
    im2 = im.resize((side, side // 2), Image.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im2, (0, side // 4))          # ⚠ 正方画布、内容垂直居中：上下各 1/4 留白
    canvas.save(os.path.join(d, "minimap.png"))
    mask = np.zeros((side, side), np.uint8)
    yy, xx = np.mgrid[0:side, 0:side]
    inside = (np.abs(xx - side / 2) / (side / 2) + np.abs(yy - side / 2) / (side / 4)) <= 1.0
    mask[inside] = 255
    Image.fromarray(mask, "L").save(os.path.join(d, "minimap-mask.png"))
    print("  minimap %dx%d（内容垂直居中，上下各 1/4 留白）+ 菱形蒙版" % (side, side))


def diamond_mask(w: int, h: int, bleed: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.abs(xx - (w - 1) / 2) / ((w - 1) / 2) + np.abs(yy - (h - 1) / 2) / ((h - 1) / 2)
    return (d <= 1.0 + bleed * 2.0 / w).astype(np.float32)


def pack_atlas(d, info, lods=(0, 1, 2)):
    """每档一张 POT 图集：4x4 的 256x128 菱形贴片 + 4px 出血带。

    ⚠ 出血带是**边缘复制**，⛔ 不靠 UV 内缩（内缩会把画面往里压、菱形边缘少一圈）。
    """
    pal = info["palette"]
    mask = diamond_mask(CELL_W, CELL_H, GUTTER)
    cells = []
    for lod in lods:
        atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
        cells = []
        for e in pal:
            tex_rel = TEXTURE_OF.get(e["name"])
            src = None
            if tex_rel and os.path.exists(os.path.join(PNG, tex_rel)):
                src = Image.open(os.path.join(PNG, tex_rel)).convert("RGB")
            col = np.array(e["color"], np.float32)
            for v in range(VARIANTS):
                idx = e["id"] * VARIANTS + v
                if src is None:
                    rgb = np.tile(col, (CELL_H, CELL_W, 1))
                else:
                    step = max(1, 2 ** lod)             # 远档取更大的纹理块 ⇒ 更平
                    side = max(8, min(src.width, src.height) // step)
                    # ⚠ 四个变体取**不同位置 + 不同朝向**的窗口，⛔ 不是同一块的镜像
                    #   （镜像只在格内翻，整片地仍读得出重复节律）
                    ox = (v % 2) * max(0, src.width - side)
                    oy = (v // 2) * max(0, src.height - side)
                    t = src.crop((ox, oy, ox + side, oy + side))
                    if v in (1, 2):
                        t = t.transpose(Image.Transpose.ROTATE_90 if v == 1 else Image.Transpose.ROTATE_270)
                    t = t.resize((CELL_W, CELL_H), Image.LANCZOS)
                    base = np.asarray(t).astype(np.float32)
                    lum = base.mean(2, keepdims=True) / 255.0
                    rgb = np.clip(col * (0.62 + 0.76 * lum), 0, 255)
                tile = np.dstack([rgb, mask * 255.0]).astype(np.uint8)
                cx = (idx % GRID_COLS) * (CELL_W + GUTTER * 2) + GUTTER
                cy = (idx // GRID_COLS) * (CELL_H + GUTTER * 2) + GUTTER
                atlas.paste(Image.fromarray(tile, "RGBA"), (cx, cy))
                cells.append({"id": idx, "classId": e["id"], "variant": v,
                              "name": e["name"], "cn": e["cn"],
                              "cell": [cx, cy, CELL_W, CELL_H],
                              "source": tex_rel or "（纯色，无原版纹理）"})
        p = os.path.join(d, "atlas-lod%d.png" % lod)
        atlas.save(p)
        json.dump({"schemaVersion": 1, "lod": lod, "cell": [CELL_W, CELL_H], "gutter": GUTTER,
                   "gridCols": GRID_COLS, "variants": VARIANTS,
                   "size": [ATLAS_W, ATLAS_H], "uv": "diamond-midpoints",
                   "cells": cells},
                  open(os.path.join(d, "atlas-lod%d.info.json" % lod), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  atlas-lod%d %dx%d（%d 类 × %d 变体 × %dx%d + %dpx 出血）" %
              (lod, ATLAS_W, ATLAS_H, len(pal), VARIANTS, CELL_W, CELL_H, GUTTER))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    d, rows, cols, cls, info = load_pack(a.map)
    print("烘焙内容包 %s（%dx%d，%d 类）" % (a.map, rows, cols, len(info["palette"])))
    bake_plate(d, rows, cols, cls, info)
    bake_minimap(d, a.map)
    pack_atlas(d, info)
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
