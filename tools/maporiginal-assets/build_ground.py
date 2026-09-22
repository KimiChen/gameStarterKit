#!/usr/bin/env python3
"""原版**地表底**：一张底纹 + 整数次 GL_REPEAT（M2-B1）。

    /tmp/maporiginal-venv/bin/python build_ground.py [--map s1]

★ 机制（docs/MAPORIGINAL-2D.md §1.2 / §1.4 / §1.5）：
  ① **「一格」= 一个 10×10 逻辑格的 block** —— `GroundLayerData:get_grid_size()` 覆写成
     `TILE_WIDTH*20, TILE_HEIGHT*20` = **3000×1500 px**。S1 是 **152×152 块**
     （150 块 + 一圈 margin，`layer_info.lua` 给的 offset 是 {-10,-10}）
     ⇒ 块 i 覆盖逻辑行 `10·i−10 .. 10·i−1`（i=1 → 0..9、i=150 → 1490..1499）。
  ② **整张 S1 的地表底就是一张 `ground_down/underground1.png` 铺满**：
     `get_grid_res()` 取 `IdConsts.RES_GRASS_1`（定值），`season_func_def.lua:418` 的
     `get_ground_grass_res = false` ⇒ 常规季无季节覆盖。
  ③ 铺满一块的办法 = **整数次 GL_REPEAT + 微量拉伸**：
     `u = 256·floor(3000/256) = 2816`（横向 11 次）、`v = 256·floor(1500/256) = 1280`（纵向 5 次）；
     2816 texel 拉到 3000 px = 1.065×、1280 → 1500 = 1.172×。
     取 floor 的意义是**让块边界落在整周期上**，块与块之间不出现半个花纹的错茬。
  ④ UV 是**世界轴对齐**的线性映射（`GROUND_PIC_TBL` 的四点是 W/N/E/S）⇒ 底纹**不跟着菱形转**，
     观感是「一整张连续的大地毯被菱形裁出来」，⛔ **不是「每格一块菱形地砖」**。

⚠ 本 kit 早先的「8 粗类 × 4 变体的逐格菱形贴片」是**自创的**，与上面第 ④ 条直接矛盾 ——
  M2-B1 就是来换掉它的。画面上的颜色变化应当**全部来自上层的 res_field 摆件与山体件**。
⚠ 块原点偏移 **−10** 是按 §1.2 的公式推的（152 = 150 + 2 margin 自洽）。
  旁证：desert 块的中心格有 88.6% 落在 `logic_background == 3` 上（snow ↔ 2 占 97.5%）；
  ⛔ 但 `logic_background` 是**逐格**自由分区、不按块，锐化不了偏移，别拿它当硬证。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PNG = os.path.join(OUT, "png")

SOURCE = "ground_down/underground1.png"     # ★ 平地底，全图唯一一张
BLOCK_TILES = 10                            # 一块 = 10×10 逻辑格
GRID_SIDE = 152                             # S1 的块数（150 + 2 margin）
ORIGIN = -10                                # 块 i 覆盖逻辑行 BLOCK_TILES·i + ORIGIN 起
ORIG_TILE_HALF_W, ORIG_TILE_HALF_H = 150, 75    # config_2d 的 TILE_WIDTH / TILE_HEIGHT（半值）


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()

    src = os.path.join(PNG, SOURCE)
    if not os.path.exists(src):
        raise SystemExit("⛔ 地表底的源没落位：%s\n   先解码：decode_ktx.py --name <key> --out out/png" % src)
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    if (w & (w - 1)) or (h & (h - 1)):
        raise SystemExit("⛔ %s 是 %dx%d，非 POT 在 WebGL1 下不能 GL_REPEAT" % (SOURCE, w, h))
    if float((np.asarray(im)[..., 3] > 250).mean()) < 0.999:
        raise SystemExit("⛔ %s 不是满幅不透明，铺底会露出背景" % SOURCE)

    block_w = ORIG_TILE_HALF_W * 2 * BLOCK_TILES        # 3000
    block_h = ORIG_TILE_HALF_H * 2 * BLOCK_TILES        # 1500
    u = w * (block_w // w)                              # 2816
    v = h * (block_h // h)                              # 1280
    if u == 0 or v == 0:
        raise SystemExit("⛔ 底纹比一块还大，整数次 REPEAT 不成立")

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    im.save(os.path.join(d, "ground-base.png"))
    blob = open(os.path.join(d, "ground-base.png"), "rb").read()

    info = {
        "schemaVersion": 1, "mapId": a.map,
        "texture": {"source": SOURCE, "size": [w, h], "sha256": hashlib.sha256(blob).hexdigest(),
                    "opaque": True, "wrap": "REPEAT/REPEAT"},
        "block": {"tiles": BLOCK_TILES, "gridSide": GRID_SIDE, "origin": ORIGIN,
                  "sizePx": [block_w, block_h],
                  "coversRows": "块 i 覆盖逻辑行 %d·i%+d .. %d·i%+d"
                                % (BLOCK_TILES, ORIGIN, BLOCK_TILES, ORIGIN + BLOCK_TILES - 1)},
        "repeat": {"u": u, "v": v, "timesU": u // w, "timesV": v // h,
                   "stretchU": round(block_w / u, 4), "stretchV": round(block_h / v, 4),
                   "note": "取 floor 让块边界落在整周期上，块与块之间不出现半个花纹的错茬"},
        "uv": {"W": [0, v / 2 / h], "N": [u / 2 / w, 0], "E": [u / w, v / 2 / h], "S": [u / 2 / w, v / h],
               "note": "世界轴对齐的线性映射（GROUND_PIC_TBL 的 W/N/E/S 四点）⇒ 底纹不跟着菱形转"},
        "source": {"authority": "MAPORIGINAL-2D §1.2 / §1.4 / §1.5",
                   "originNote": "块原点偏移 −10 按 §1.2 公式推（152 = 150 + 2 margin 自洽）；"
                                 "desert 块中心 88.6% 落在 logic_background==3（旁证，⛔ 非硬证）"},
    }
    json.dump(info, open(os.path.join(d, "ground.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal **地表底**常量（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 原版的地表底是「**一块 10×10 格 + 一张 256² 底纹整数次 GL_REPEAT**」
 *   （docs/MAPORIGINAL-2D.md §1.4），⛔ **不是「每格一块菱形地砖」** ——
 *   观感是「一整张连续的大地毯被菱形裁出来」。
 * ★ 整张 S1 的底就是**一张** `ground_down/underground1.png`（§1.5）：
 *   `get_grid_res()` 取定值 `RES_GRASS_1`、常规季无季节覆盖。
 *   ⇒ 画面上的颜色变化**全部来自上层的 res_field 摆件与山体件**，⛔ 不来自地表底。
 * ★ UV 是**世界轴对齐**的线性映射 ⇒ 底纹**不跟着菱形转**；横向 repeat %d 次、纵向 %d 次，
 *   取整周期是为了让**块边界落在整周期上**（块与块之间不出现半个花纹的错茬），
 *   代价是微量拉伸 %.3f× / %.3f×。
 * ⚠ 贴图必须 POT 且 wrap = REPEAT/REPEAT，⛔ 不能进图集（图集里没法 GL_REPEAT）。
 */

/** 一块 = 几×几个逻辑格。 */
export const MAPO_GROUND_BLOCK_TILES = %d;
/** S1 的块数（150 + 一圈 margin）。 */
export const MAPO_GROUND_GRID_SIDE = %d;
/** 块 i 覆盖逻辑行 `MAPO_GROUND_BLOCK_TILES · i + MAPO_GROUND_ORIGIN` 起的 BLOCK_TILES 行。 */
export const MAPO_GROUND_ORIGIN = %d;
/** 底纹横向/纵向各铺几次（整数 ⇒ 块边界落在整周期上）。 */
export const MAPO_GROUND_REPEAT_U = %d;
export const MAPO_GROUND_REPEAT_V = %d;
/** 底纹尺寸（px，POT）。 */
export const MAPO_GROUND_TEXTURE_SIZE: readonly [number, number] = [%d, %d];
''' % (a.map, u // w, v // h, block_w / u, block_h / v,
       BLOCK_TILES, GRID_SIDE, ORIGIN, u // w, v // h, w, h)
    open(os.path.join(d, "ground.data.ts"), "w", encoding="utf-8").write(ts)

    print("  底纹 %s %dx%d（满幅不透明、POT）" % (SOURCE, w, h))
    print("  一块 %d×%d 格 = %d×%d px；repeat %d×%d 次；拉伸 %.3f× / %.3f×"
          % (BLOCK_TILES, BLOCK_TILES, block_w, block_h, u // w, v // h, block_w / u, block_h / v))
    print("  块网格 %d²，原点偏移 %+d" % (GRID_SIDE, ORIGIN))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
