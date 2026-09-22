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

★ 近档贴片由**原版 2D 侧**的可平铺地表底纹合成（2026-09-22 换源，⛔ 不再用 scene_3d）。
   ⚠ 「2D 侧素材」成立、「S1 画面上真用」**不成立**（§1.7）—— 详见下面 `TEXTURE_OF` 上方的口径注：
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
def load_pack(mid: str):
    d = os.path.join(OUT, "pack", mid)
    raw = open(os.path.join(d, "terrain.bytes"), "rb").read()
    rows, cols = struct.unpack(">II", raw[:8])
    cls = np.frombuffer(raw, np.uint8, offset=8).reshape(rows, cols)
    info = json.load(open(os.path.join(d, "terrain.info.json"), encoding="utf-8"))
    return d, rows, cols, cls, info


def summary_layer(d, cls):
    """远档**概览**用的填充层：覆盖格填上它所属件的值（`res_multi`）。

    ⚠ **只给远档底图 / 缩略图用**，⛔ 绝不回写 `terrain.bytes`、⛔ 绝不用来出件 ——
      M0-B1 删掉的正是「把覆盖格填成锚点值」那一步（它销毁了锚点信息）。
      这里重新填一次是因为远档是**概览**：不填的话 142,958 个覆盖格变平地，
      LOD 4–5 上 19 格的大山只剩 2,299 个锚点格、山脉整片消失。
    """
    raw = open(os.path.join(d, "raw", "multi.bytes"), "rb").read()
    multi = np.frombuffer(raw, np.uint8, offset=4, count=cls.size).reshape(cls.shape)
    return np.where(cls == 0, multi, cls).astype(np.uint8)


def project_plate(rows, cols, cls, pal, W, H):
    """把格阵按**世界包围盒**线性投到 W×H。

    ★ 这就是 `mapoWorldToMinimap` / `mapoPlateBounds` 用的同一套映射 ——
      远档底图与缩略图都走它，⇒ 图与点选换算天然一致，⛔ 不存在标定误差。
    """
    r, c = np.meshgrid(np.arange(rows), np.arange(cols), indexing="ij")
    u = (((r - c) + cols - 1) / (rows + cols - 2) * (W - 1)).astype(np.int32)
    v = ((r + c) / (rows + cols - 2) * (H - 1)).astype(np.int32)
    img = np.zeros((H, W, 4), np.uint8)
    img[v.ravel(), u.ravel(), :3] = pal[cls.ravel()]
    img[v.ravel(), u.ravel(), 3] = 255
    # 菱形内部的采样空洞：一次 2x2 最大值填补
    from scipy.ndimage import grey_dilation
    for ch in range(4):
        img[..., ch] = grey_dilation(img[..., ch], size=(2, 2))
    return img


def value_palette(info):
    pal = np.zeros((64, 3), np.uint8)
    for e in info["palette"]:
        pal[e["id"]] = e["color"]
    return pal


def bake_plate(d, rows, cols, cls, info, sizes=((2048, 1024, 4), (1024, 512, 5))):
    """按世界包围盒烘远档底图（**逐格精确对齐**，⛔ 无标定误差）。"""
    cls = summary_layer(d, cls)          # ★ 远档概览：覆盖格按所属件取色（见 summary_layer）
    # 远档底图按**原版值**直接取色（调色板是按值建的，⛔ 不用再折算 kind）
    pal = value_palette(info)
    for W, H, lod in sizes:
        img = project_plate(rows, cols, cls, pal, W, H)
        p = os.path.join(d, "plate-lod%d.png" % lod)
        Image.fromarray(img).save(p)
        json.dump({"schemaVersion": 1, "lod": lod, "size": [W, H],
                   "note": "由 terrain.bytes（覆盖格按 res_multi 补成概览）按世界包围盒烘焙，逐格精确对齐；"
                           "⛔ 不读此文件定位，落位用 mapoWorldBounds() 同式算出"},
                  open(os.path.join(d, "plate-lod%d.info.json" % lod), "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print("  plate-lod%d %dx%d -> %s" % (lod, W, H, os.path.basename(p)))


def bake_minimap(d, rows, cols, cls, info, side=512):
    """缩略图：**由地形按与点选换算同一套投影烘**（⛔ 不再贴原版鸟瞰插画）。

    ⚠ 换掉的理由：原版 `noexpo_birdview_map_1` 是 **3D 相机的透视渲染**，与本仓的正交等距
      ⛔ 不存在可靠对齐（实测相似变换 IoU 0.62、河网 NCC 0.30）。而缩略图在本 kit 里是
      **可点击导航**的（`mapoMinimapCell` → `centerOn`）⇒ 图与点选换算必须同一套投影，
      否则用户点哪跑哪。现在两者都走 `project_plate`（= `mapoWorldToMinimap` 的映射）。
    ⚠ 画布是正方、内容占中间半幅（上下各 1/4 留白）—— 与 `mapoWorldToMinimap` 的
      `0.25 + v * 0.5` 严格对应，⛔ 改一边必须改另一边。
    """
    cls = summary_layer(d, cls)
    img = project_plate(rows, cols, cls, value_palette(info), side, side // 2)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(Image.fromarray(img), (0, side // 4))
    canvas.save(os.path.join(d, "minimap.png"))
    mask = np.zeros((side, side), np.uint8)
    yy, xx = np.mgrid[0:side, 0:side]
    inside = (np.abs(xx - side / 2) / (side / 2) + np.abs(yy - side / 2) / (side / 4)) <= 1.0
    mask[inside] = 255
    Image.fromarray(mask, "L").save(os.path.join(d, "minimap-mask.png"))
    json.dump({"schemaVersion": 2, "size": [side, side], "content": [side, side // 2],
               "contentTop": side // 4,
               "source": "terrain.bytes（覆盖格按 res_multi 补成概览）",
               "projection": "与 plate 同式 = mapoWorldToMinimap 的 0.25 + v*0.5",
               "note": "⛔ 不再贴原版 noexpo_birdview（3D 透视渲染，与正交等距无可靠对齐）；"
                       "本图**参与点选定位**，⇒ 投影必须与 mapoMinimapCell 同源"},
              open(os.path.join(d, "minimap.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  minimap %dx%d（由地形烘，投影与点选同源）+ 菱形蒙版" % (side, side))


# ⚠ **图集烘焙已在 M2-B1 删除**：那是「8 粗类 × 4 变体的逐格菱形贴片」，是本仓**自创**的做法，
#   与原版直接矛盾 —— 原版的地表底是「一块 10×10 格 + 一张 256² 底纹整数次 GL_REPEAT」
#   （MAPORIGINAL-2D §1.4），画面上的颜色变化全部来自上层的 res_field 摆件与山体件。
#   现在由 `build_ground.py` 出 `ground-base.png`。⛔ 别把逐格图集加回来。
#   （连带删除的还有 diamond_mask / kind_style / PHASES / phase_crop / pack_atlas，
#     以及 TEXTURE_OF 那七张 `tt_02` —— 它们驱动的 `_polygon_mask` 层在 S1 本来就一格不画，见 §1.7。）


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    d, rows, cols, cls, info = load_pack(a.map)
    print("烘焙内容包 %s（%dx%d，%d 类）" % (a.map, rows, cols, len(info["palette"])))
    bake_plate(d, rows, cols, cls, info)
    bake_minimap(d, rows, cols, cls, info)
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
