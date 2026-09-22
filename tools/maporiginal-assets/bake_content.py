#!/usr/bin/env python3
"""烘焙 mapOriginal 内容包的图像件：远档底图 / 缩略图 / 近档贴片图集。

    /tmp/maporiginal-venv/bin/python bake_content.py [--map s1]

⚠ **为什么远档底图是烘出来的、不是直接用原版鸟瞰图**：
   原版 `noexpo_birdview_map_1.ktx` 是 **3D 相机的透视渲染**，与本仓的正交等距投影
   ⛔ 不存在可靠的 2D 对齐 —— 实测相似变换 IoU 0.62、河网 NCC 0.30、全仿射拟合退化成
   竖条纹假峰（NCC 0.51）。逐格对齐的层（plate 参与点选与视窗指示）必须自己烘。
   原版鸟瞰图改作**装饰性缩略图**，落位由客户端 `mapoFar.ts` 按 `mapoWorldBounds()` 现算
   （与 `bake_minimap` 的 resize+paste 构造同式）。⛔ 早先那份 `plate.calib.json` 已删：
   它描述的其实是 minimap 落位、全仓零消费，且 `calibrate_plate.py` 在 palette 升到
   schemaVersion 2（无 `name`/无 `water`）后重跑必 KeyError，落盘的数字是死数。

★ 近档贴片由**原版 2D 侧**的可平铺地表底纹合成（2026-09-22 换源，⛔ 不再用 scene_3d）：
   `ground_down/underground1` + 七个 `scene/ground/<生物群系>/png/tt_02`，见下面的 `TEXTURE_OF`
   与 README §4.8 的归属判据。⚠ 包里 ⛔ 没有现成的等距地块图，所以仍是**合成**而非直取。
⚠ 原版 2D 的地表真身（`*_group.prefab` 根资源，1,873 条）**两版 APK 都没打进包**（README §4.2），
   已从发行商 CDN 取回 1,784/1,873 = 95.2%；上面八条源的字节也都只在 `cdn-unpacked` 里
   （如 `underground1.ktx` 在容器 `7cc5137e33e0…`）⇒ ⛔ 别写成「贴图本身在基础包里」。
"""
from __future__ import annotations

import argparse
import json
import os
import struct

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PNG = os.path.join(OUT, "png")

# ★ 地表图集按**粗类**建（资源格真正的样子由摆件层的原版 res_field 给，底下这层只是垫底）。
#   ⚠ 次序即 kind id，⛔ 与 terrain.info.json 的 kind 名一一对应，改了要同步 shared。
KINDS = ["plain", "resource", "gold", "river", "mountain", "grove", "scatter", "unknown"]

# ★ 全部是原版 **2D 沙盘**侧的源（2026-09-22 换源；本 kit ⛔ 不再收 scene_3d/**，3D 归 mapOriginal3d）。
#
# ⚠ 判据不是「路径里有没有 3d」，是 2D 地表组预制体的**直接引用**：
#   `scene/ground/<生物群系>/` 下各有 10 个 `*_polygon_mask_group.prefab`，其中的 `polygon_2d`
#   节点直引本目录的 `tt_02`（各 10 次）—— 这是原版 2D 铺该地貌时真正用的底纹。
#   desert / snow 另有各 60 个 `*_polygon_group` 直引 `ground_down/underground{3,2}`。
# ⚠ `plain` 是八条里**唯一带推断**的：`underground1` 的 2D 归属是实证（赛季配置表里登记名
#   「草1」、且是 `all_root_res_list.cw` 的常驻根资源、无 scene_3d 对位），但「它被 polygon 平铺
#   成草地底」没有直接证据 —— grass 的四个 `middlelevel_0N_group.prefab` 在手且只引 a1..a8。
#   ⇒ 更可能是地图编辑器的**地表笔刷**（代码直贴）。台账里如实标注，⛔ 不要写成实证。
# ⚠ 选源看的是**灰度质感与可平铺性**，⛔ 不是颜色：色相 100% 来自本仓调色板（见下面的着色式）。
TEXTURE_OF = {
    "plain":    "ground_down/underground1.png",              # 「草1」，256² 双向无缝
    "resource": "scene/ground/caodi_gan/png/tt_02.png",      # 干草地；低频最低 ⇒ 96 万格不露节律
    "gold":     "scene/ground/huangmo/png/tt_02.png",        # 荒漠；偏亮细砂
    "river":    "scene/ground/zhaoze/png/tt_02.png",         # 沼泽；水系里唯一满幅不透明的底
    "mountain": "scene/ground/caodi_shi/png/tt_02.png",      # 石草地；暗于平地
    "grove":    "scene/ground/senlin/png/tt_02.png",         # 森林；对上 LAND_TYPE.FOREST
    "scatter":  "scene/ground/caodi_huijin/png/tt_02.png",   # 草地灰烬
    "unknown":  "scene/ground/dongtu_tuxue/png/tt_02.png",   # 冻土；纹理最强，兜底哨兵一眼可辨
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
    # 远档底图按**原版值**直接取色（调色板是按值建的，⛔ 不用再折算 kind）
    pal = np.zeros((64, 3), np.uint8)
    for e in info["palette"]:
        pal[e["id"]] = e["color"]
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


def kind_style(info):
    """kind -> (cn, 颜色)。取该 kind 下格数最多的那条调色板项的颜色。"""
    best = {}
    for e in info["palette"]:
        k = e["kind"]
        if k not in best or e["tiles"] > best[k]["tiles"]:
            best[k] = e
    return {k: (best[k]["cn"], best[k]["color"]) for k in best}


# 四个变体的取窗相位（0..1 的比例）。⚠ 任意两个**既不共行也不共列**，⛔ 别改成 (0,0)/(1,0)/(0,1)/(1,1)
#   那种角窗 —— 源是正方且窗口等于源边长时四个角窗会塌成同一个。
PHASES = [(0.00, 0.00), (0.62, 0.24), (0.24, 0.76), (0.86, 0.52)]


def phase_crop(src, px, py, wW, wH):
    """按相位取一个 wW×wH 的窗口；相位方向上没有余量时**环绕**取（np.roll）。

    ⚠ 环绕只在「窗口 = 源边长」时才会触发；此时源必须是无缝可平铺的，否则片内会露缝。
    """
    W, H = src.width, src.height
    fx, fy = W - wW, H - wH
    if fx > 0 and fy > 0:
        return src.crop((round(px * fx), round(py * fy),
                         round(px * fx) + wW, round(py * fy) + wH))
    a = np.asarray(src)
    if fx <= 0:
        a = np.roll(a, round(px * W), axis=1)
    if fy <= 0:
        a = np.roll(a, round(py * H), axis=0)
    a = a[:wH, :wW] if fx <= 0 and fy <= 0 else (
        a[round(py * fy):round(py * fy) + wH, :wW] if fx <= 0
        else a[:wH, round(px * fx):round(px * fx) + wW])
    return Image.fromarray(a)


def pack_atlas(d, info, lods=(0, 1, 2)):
    """每档一张 POT 图集：8 列 × 4 行的 240×120 菱形贴片（8 粗类 × 4 变体 = 32 格）+ 4px 出血带。

    ⚠ 出血带是**边缘复制**，⛔ 不靠 UV 内缩（内缩会把画面往里压、菱形边缘少一圈）。
    """
    style = kind_style(info)
    mask = diamond_mask(CELL_W, CELL_H, GUTTER)
    cells = []
    for lod in lods:
        atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
        cells = []
        for kid, kind in enumerate(KINDS):
            e = {"id": kid, "name": kind, "cn": style.get(kind, (kind, [128, 128, 128]))[0],
                 "color": style.get(kind, (kind, [128, 128, 128]))[1]}
            tex_rel = TEXTURE_OF.get(kind)
            if tex_rel and not os.path.exists(os.path.join(PNG, tex_rel)):
                # ⛔ 不许静默降级成纯色：源没落位时以前不报错、画面直接变平涂，极难查
                raise SystemExit("⛔ %s 的源没落位：%s\n   先解码：decode_ktx.py --name <key> --out out/png"
                                 % (kind, os.path.join(PNG, tex_rel)))
            src = None
            if tex_rel:
                im = Image.open(os.path.join(PNG, tex_rel)).convert("RGBA")
                # ⚠ 透明区**合成到中性灰**再转 RGB，⛔ 不能直接 convert("RGB")：
                #   那会把透明读成黑 ⇒ lum≈0 ⇒ 整片压成 0.62×底色的暗块。
                #   取 128 是唯一不改色相的中性值（lum=0.5 ⇒ 增益 1.0 ⇒ 正好是调色板原色）。
                src = Image.alpha_composite(
                    Image.new("RGBA", im.size, (128, 128, 128, 255)), im).convert("RGB")
                # ⚠ 远档 = 先**低通**再取同一窗口，⛔ 不是裁更小的块：
                #   裁小块会越远越锐越花（与注释相反），实测现行 lod0→lod2 的 std 是上升的。
                if lod:
                    src = src.filter(ImageFilter.GaussianBlur(0.8 * (2 ** lod)))
            col = np.array(e["color"], np.float32)
            for v in range(VARIANTS):
                idx = e["id"] * VARIANTS + v
                if src is None:
                    rgb = np.tile(col, (CELL_H, CELL_W, 1))
                else:
                    # ★ 四个变体 = **2:1 定形窗 + 四个错开相位**，⛔ 不再旋转、⛔ 不再按 lod 缩窗。
                    # ⚠ 旧式 `side=min(w,h)//2**lod` + 角窗对**正方源在 lod0 必然退化**
                    #   （ox=oy=0 ⇒ v0 与 v3 逐像素相同）；实测旧产物 8 类里 7 类 v0≡v3。
                    # ⚠ 2:1 窗还消掉了「正方窗 resize 纵向压 2×、而 v1/v2 先转 90° 方向相反」
                    #   造成的四片分裂成两种观感；512² 源取 240×120 是 1:1 像素、零重采样。
                    wW = min(src.width, CELL_W)
                    wH = min(src.height, max(1, wW // 2))
                    px, py = PHASES[v]
                    t = phase_crop(src, px, py, wW, wH)
                    if (wW, wH) != (CELL_W, CELL_H):
                        t = t.resize((CELL_W, CELL_H), Image.LANCZOS)
                    base = np.asarray(t).astype(np.float32)
                    lum = base.mean(2, keepdims=True) / 255.0
                    rgb = np.clip(col * (0.62 + 0.76 * lum), 0, 255)
                tile = np.dstack([rgb, mask * 255.0]).astype(np.uint8)
                cx = (idx % GRID_COLS) * (CELL_W + GUTTER * 2) + GUTTER
                cy = (idx // GRID_COLS) * (CELL_H + GUTTER * 2) + GUTTER
                atlas.paste(Image.fromarray(tile, "RGBA"), (cx, cy))
                cells.append({"id": idx, "kindId": kid, "kind": kind, "variant": v,
                              "cn": e["cn"], "cell": [cx, cy, CELL_W, CELL_H],
                              "source": tex_rel or "（纯色，无原版纹理）"})
        p = os.path.join(d, "atlas-lod%d.png" % lod)
        atlas.save(p)
        json.dump({"schemaVersion": 1, "lod": lod, "cell": [CELL_W, CELL_H], "gutter": GUTTER,
                   "gridCols": GRID_COLS, "variants": VARIANTS, "kinds": KINDS,
                   "size": [ATLAS_W, ATLAS_H], "uv": "diamond-midpoints",
                   "cells": cells},
                  open(os.path.join(d, "atlas-lod%d.info.json" % lod), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  atlas-lod%d %dx%d（%d 粗类 × %d 变体 × %dx%d + %dpx 出血）" %
              (lod, ATLAS_W, ATLAS_H, len(KINDS), VARIANTS, CELL_W, CELL_H, GUTTER))


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
