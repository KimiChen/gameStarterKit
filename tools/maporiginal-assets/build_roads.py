#!/usr/bin/env python3
"""原版**道路层**（M3-B1）：`road_info.lua` → 路片图集 + 摆放表。

    /tmp/maporiginal-venv/bin/python build_roads.py [--map s1]

★ 数据链（勘察见 `recon_road.py`，结论已写进 MAPORIGINAL-2D §4.2）：
  ① **坐标系由干净集直给**：`road_info.lua` 的 `layer_info` =
     `{width=1125, height=1125, grid_width=200, aridJheighi=100}`；
     `aridJheighi` 是 KS[11] 定点损坏的 `grid_height`。
     ⇒ 一个路格 = **半宽 200 / 半高 100**（逻辑格是 150/75）= **4/3 个逻辑格**，
       `1500 × 150/200 = 1125` 自洽。
     ★ **独立佐证**：18 张路片**每一张都正好 400×200 px** = `grid_width×2 / grid_height×2`
       —— 半值约定不必只靠算术。
  ② `tiles` 的键是客户端格键 `(row << 16) | col`、值是 `type_info` 下标（1..37）。
     ⇒ **选片在制图期就烘死了**，与河同构，运行时 ⛔ 不做邻接判断。
  ③ `type_info[i] = {client_res id ∈ 1170..1187, 水平翻转 ±1, 1}`。

⚠ **id → 精灵的绑定是 `[推断]`**（`client_res` 在未解的 `base.cw` 里）：按路网**邻接度**
  给每个 id 定类（纯度基本 1.00），再与精灵按**完整路径字母序**的度序列比对，18 位逐位全等。
  唯一未定的是 `upend/6-1` 还是 `6-2`（两者度相同且相邻，签名分不开）——
  本脚本取字母序靠前的那张，⚠ 换一张只影响这一类的贴图、不影响摆位。
  ⛔ 别把这条当干净集引用；本脚本每次构建都**重算签名**，对不上直接退出。

⚠ 三套皮肤 `road / road_ash / road_snow` 结构相同，S1 取 **`road`**
  （`type_info` 第三列恒 1，疑似皮肤下标，⚠ 无直接证据）。
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
SV = CFG["sourceVersionRoot"]

SKIN = "road"
ROAD_ATLAS_XML = "scene/_output_atlas_scene/atlas_tex/road.xml"
DOWNSCALE = 0.5          # ★ 400 px 的片在 LOD0 只占 85 世界像素，存 200 px 仍 2.3× 过采样
ATLAS_W, ATLAS_H, PAD = 1024, 1024, 2
S_BIAS, D_BIAS = 0, 1125
DEG_OF_CLASS = {"line": 2, "horizonalturn": 2, "upverticalturn": 2, "downverticalturn": 2,
                "upend": 1, "downend": 1, "uptcross": 3, "downtcross": 3, "xcross": 4}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map
    txt = open(os.path.join(SV, "src-lua/asset/config/%s/cn/res_pro/road_info.lua" % m.upper()),
               encoding="utf-8").read()
    head = txt[: txt.index("tiles")]
    li = {k: int(v) for k, v in re.findall(r"(\w+)\s*=\s*(\d+)", head)}
    side = li["width"]
    half_w, half_h = li["grid_width"], next(v for k, v in li.items()
                                            if k not in ("width", "height", "grid_width"))
    if side != 1500 * 150 // half_w:
        raise SystemExit("⛔ 网格边长 %d 与半宽 %d 不自洽" % (side, half_w))
    tiles = {int(k): int(v) for k, v in re.findall(r"\[(\d+)\]\s*=\s*(\d+)", txt)}
    trip = [tuple(int(x) for x in t) for t in
            re.findall(r"\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\}", txt[txt.index("type_info"):])]
    ids = sorted({t[0] for t in trip})

    # ── 结构签名：邻接度 → 类，再按字母序绑定精灵 ────────────────
    cells_set = {(k >> 16, k & 0xFFFF) for k in tiles}
    deg: dict = {}
    for k, v in tiles.items():
        r, c = k >> 16, k & 0xFFFF
        d4 = sum(1 for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)) if (r + dr, c + dc) in cells_set)
        # ⚠ 度 0 = **孤立的一格路头**（实测 16 例）：端头本来就允许 0 或 1 邻 ⇒ 归入 1，
        #   ⛔ 别当成噪声，也 ⛔ 别因此放宽纯度阈值（那会把真的绑定错误放过去）。
        deg.setdefault(trip[v - 1][0], collections.Counter())[max(1, d4)] += 1
    obs = []
    for i in ids:
        cnt = deg[i]
        top, num = cnt.most_common(1)[0]
        if num / sum(cnt.values()) < 0.9:
            raise SystemExit("⛔ id %d 的邻接度不纯（%s）——绑定不可信" % (i, dict(cnt)))
        obs.append(top)
    root = ET.parse(resolve_by_name(ROAD_ATLAS_XML)).getroot()
    names = sorted(n for n in (sp.get("n") for ta in root.findall("TextureAtlas")
                               for sp in ta.findall("sprite"))
                   if "/ground/%s/" % SKIN in n and "/mask/" not in n)
    exp = [DEG_OF_CLASS[n.split("/")[-2]] for n in names]
    drop = [i for i in range(len(exp)) if [d for j, d in enumerate(exp) if j != i] == obs]
    if not drop:
        raise SystemExit("⛔ 字母序绑定不成立（度序列 %s vs %s），⛔ 别硬用" % (obs, exp))
    keep = [n for j, n in enumerate(names) if j != drop[0]]
    bind = dict(zip(ids, keep))

    # ── 图集：18 片，按 0.5× 缩存 ───────────────────────────────
    sprites = {}
    for line in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        sprites[r["logical"]] = r["out"]
    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells, x, y, row_h = [], PAD, PAD, 0
    cell_of = {}
    for i in ids:
        logical = bind[i][len("asset/"):]
        p = os.path.join(OUT, sprites.get(logical, ""))
        if not sprites.get(logical) or not os.path.exists(p):
            raise SystemExit("⛔ 路片没落位：%s —— 先跑 slice_atlas.py %s" % (logical, ROAD_ATLAS_XML))
        im = Image.open(p).convert("RGBA")
        native = [im.width, im.height]
        tw, th = max(1, round(im.width * DOWNSCALE)), max(1, round(im.height * DOWNSCALE))
        im = im.resize((tw, th), Image.LANCZOS)
        if x + tw + PAD > ATLAS_W:
            x, y, row_h = PAD, y + row_h + PAD, 0
        if y + th + PAD > ATLAS_H:
            raise SystemExit("⛔ 路片图集装不下")
        atlas.paste(im, (x, y), im)
        cell_of[i] = len(cells)
        cells.append({"id": len(cells), "resId": i, "rect": [x, y, tw, th],
                      "native": native, "cls": bind[i].split("/")[-2], "source": logical})
        x += tw + PAD
        row_h = max(row_h, th)
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "road-atlas.png"))

    # ── 摆放表（按 s 升序 = 画家序）──────────────────────────────
    recs = []
    for k, v in tiles.items():
        r, c = k >> 16, k & 0xFFFF
        res_id, flip, _ = trip[v - 1]
        recs.append((r + c + S_BIAS, r - c + D_BIAS, cell_of[res_id], 1 if flip < 0 else 0))
    recs.sort()
    blob = struct.pack(">I", len(recs)) + b"".join(struct.pack(">HHBB", *t) for t in recs)
    open(os.path.join(d, "roads.bin"), "wb").write(blob)

    info = {
        "schemaVersion": 1, "mapId": m, "skin": SKIN,
        "grid": {"side": side, "halfW": half_w, "halfH": half_h,
                 "tilesPerCell": round(half_w / 150, 6),
                 "key": "(row << 16) | col", "order": "lua tiles；bytes 侧是 (col, row) 转置"},
        "sBias": S_BIAS, "dBias": D_BIAS, "recordBytes": 6, "headerBytes": 4,
        "placements": len(recs), "placementSha256": hashlib.sha256(blob).hexdigest(),
        "typeCount": len(trip), "resIds": ids,
        "atlas": {"size": [ATLAS_W, ATLAS_H], "downscale": DOWNSCALE, "cells": cells,
                  "sha256": hashlib.sha256(open(os.path.join(d, "road-atlas.png"), "rb").read()).hexdigest()},
        "binding": {"method": "邻接度结构签名 + 完整路径字母序",
                    "degrees": obs, "undetermined": [names[i].split("/", 5)[-1] for i in drop],
                    "tier": "[推断] —— client_res 在未解的 base.cw 里，⛔ 别当干净集引用"},
        "source": {"config": "asset/config/%s/cn/res_pro/road_info.lua" % m.upper(),
                   "atlas": ROAD_ATLAS_XML},
    }
    json.dump(info, open(os.path.join(d, "roads.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal **道路层**常量（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 坐标系由干净集 `road_info.lua` 直给：网格 **%d²**、一个路格**半宽 %d / 半高 %d**
 *   （逻辑格是 150/75）= **4/3 个逻辑格**。★ 独立佐证：18 张路片**每张都正好 400×200 px**
 *   = `grid_width×2 / grid_height×2`。
 * ★ 选片**在制图期就烘死了**（`tiles` 的值即 `type_info` 下标），运行时 ⛔ 不做邻接判断 ——
 *   与河同构。每片带一个**水平翻转**位。
 * ⚠ 图集格 → 精灵的绑定是 `[推断]`（邻接度结构签名 + 字母序，18 位逐位全等）：
 *   `client_res` 在未解的 `base.cw` 里。⛔ 别当干净集引用。
 * ⚠ 图集按 **%.2g×** 缩存，`native` 记原版像素（世界尺寸依据）。
 */

export interface IMapoRoadCell {
    readonly id: number;
    /** 图集像素矩形 [x, y, w, h]（**已缩**）。 */
    readonly rect: readonly [number, number, number, number];
    /** 原图像素（**未缩**，恒 400×200 = 一个路格）。 */
    readonly native: readonly [number, number];
    /** 片类：line / horizonalturn / up+downverticalturn / up+downend / up+downtcross / xcross。 */
    readonly cls: string;
}

/** 路格网格边长。 */
export const MAPO_ROAD_SIDE = %d;
/** 一个路格的半宽 / 半高（**原版 px**）。 */
export const MAPO_ROAD_HALF_W = %d;
export const MAPO_ROAD_HALF_H = %d;
export const MAPO_ROAD_S_BIAS = %d;
export const MAPO_ROAD_D_BIAS = %d;
/** 摆放表单条长度（u16 s, u16 d, u8 图集格, u8 水平翻转）。 */
export const MAPO_ROAD_RECORD_BYTES = 6;
export const MAPO_ROAD_HEADER_BYTES = 4;
export const MAPO_ROAD_ATLAS_W = %d;
export const MAPO_ROAD_ATLAS_H = %d;
export const MAPO_ROAD_CELLS: readonly IMapoRoadCell[] = %s;
''' % (m, side, half_w, half_h, DOWNSCALE, side, half_w, half_h, S_BIAS, D_BIAS,
       ATLAS_W, ATLAS_H,
       json.dumps([{"id": c["id"], "rect": c["rect"], "native": c["native"], "cls": c["cls"]}
                   for c in cells], ensure_ascii=False))
    open(os.path.join(d, "roads.data.ts"), "w", encoding="utf-8").write(ts)

    print("  网格 %d²，半宽/半高 %d/%d（= %.4g 个逻辑格）" % (side, half_w, half_h, half_w / 150))
    print("  绑定：度序列 %s；未定 %s" % (obs, [names[i].split("/")[-2] + "/" + names[i].split("/")[-1]
                                               for i in drop]))
    print("  图集 %d 片（%d²，%.2g× 缩存）；摆放 %d 条（%.0f KB）"
          % (len(cells), ATLAS_W, DOWNSCALE, len(recs), len(blob) / 1024))
    print("  片类分布 %s" % dict(collections.Counter(c["cls"] for c in cells)))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
