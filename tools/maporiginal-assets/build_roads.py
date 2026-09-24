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

★ **id → 精灵的绑定现在是 `[实测]`**（2026-09-23 解开 `base.cw` 的 `client_res` 表）：
  `client_res` 行给出 `id → scene/ground/road/<名>_complex_group.prefab`，再读该 prefab
  拿到它贴的图集精灵 —— 全链路都是数据，⛔ 不再靠字母序推断。
  ★ **`type_info` 的 id 与 `client_res` id 是 1:1**（⛔ 不加偏移）：真表里路片本体是
    **1169..1187（19 条）**，`up_end_2`「路19」占最前的 1169 且 S1 不用，
    `type_info` 正好覆盖 1170..1187 这 18 条，逐条对上 prefab，且与邻接度签名逐位吻合。
  ⚠ **本文件一度写成「id 要 +1」**，那是因为当时用「扫键名 + 往前找行首」的启发式读表、
    整体错位了一格；把 `libnative-lib.so` 的 ctable 解码器逆出来后按真结构重读，
    偏移归零。⚠ 两处错误当时正好互相抵消 ⇒ **产物一直是对的**，只是推理错。
  ⚠ 早先的字母序推断 **17/18 命中**，错的正是当时就标为「未定」的那张
    （应 `upend/6-1`，推断取了 `6-2`）—— 已由本表改正。
★ 邻接度签名**保留为交叉校验**：每次构建都重算，与 base.cw 给出的类不符即退出。

★ 皮肤由 road_layer 的 check_ground_type 决定：雪地取同名 `_雪地` client_res。
  S1 无 ash 状态源；type_info 第三列不是皮肤选择依据。
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

from PIL import Image
from texture_layout import build_atlas, pixel_hash, runtime_textures, write_types

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ctable_cw import BaseCw  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
SV = CFG["sourceVersionRoot"]

SKIN = "road"
ROAD_ATLAS_XML = "scene/_output_atlas_scene/atlas_tex/road.xml"   # 只用于切片存证
DOWNSCALE = 0.5          # ★ 400 px 的片在 LOD0 只占 85 世界像素，存 200 px 仍 2.3× 过采样
S_BIAS, D_BIAS = 0, 1125
DEG_OF_CLASS = {"line": 2, "horizonalturn": 2, "upverticalturn": 2, "downverticalturn": 2,
                "upend": 1, "downend": 1, "uptcross": 3, "downtcross": 3, "xcross": 4}
# ★ `type_info` 的 id 与 `client_res` id **相同**（⛔ 不加偏移，见模块注释）
TYPE_ID_TO_CLIENT_RES = 0


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

    # ── ① 绑定：base.cw 的 client_res（实证）────────────────────
    cw = BaseCw()
    # ★ 走真解码器：表目录 → client_res → 展平成 id → 行
    rows = cw.rows(cw.tables()["client_res"])
    pieces = {}
    for rid, row in rows.items():
        src = row.get("src_name")
        if (isinstance(rid, int) and isinstance(src, str)
                and src.startswith("scene/ground/road/")
                and src.endswith("_complex_group.prefab") and "_complex_path" not in src):
            pieces[rid] = src[len("scene/ground/road/"):-len("_complex_group.prefab")]
    import asset_source as source
    import prefab_bin
    from build_tops import normalize
    by_name = {row.get("name"): row for row in rows.values()}
    bind, snow_bind = {}, {}
    for tid in ids:
        for variant, row in (("base", rows[tid]), ("snow", by_name[rows[tid]["name"] + "_雪地"])):
            src = row["src_name"]
            prefab = prefab_bin.parse(source.resolve(src).read_bytes())
            def textures(node):
                if node.get("texture"): yield normalize(node["texture"])
                for child in node.get("children", []): yield from textures(child)
            cand = {tex for tex in textures(prefab) if "/mask/" not in tex}
            if len(cand) != 1: raise ValueError((src, cand))
            (bind if variant == "base" else snow_bind)[tid] = (cand.pop(), src, row["id"])

    # ── ② 交叉校验：路网邻接度必须与 base.cw 给出的类吻合 ────────
    cells_set = {(k >> 16, k & 0xFFFF) for k in tiles}
    deg: dict = {}
    for k, v in tiles.items():
        r, c = k >> 16, k & 0xFFFF
        d4 = sum(1 for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)) if (r + dr, c + dc) in cells_set)
        # ⚠ 度 0 = **孤立的一格路头**（实测 16 例）：端头本来就允许 0 或 1 邻 ⇒ 归入 1。
        deg.setdefault(trip[v - 1][0], collections.Counter())[max(1, d4)] += 1
    obs = []
    for i in ids:
        cnt = deg[i]
        top, num = cnt.most_common(1)[0]
        if num / sum(cnt.values()) < 0.9:
            raise SystemExit("⛔ id %d 的邻接度不纯（%s）" % (i, dict(cnt)))
        cls = bind[i][0].split("/")[-2]
        if DEG_OF_CLASS[cls] != top:
            raise SystemExit("⛔ 交叉校验不过：id %d 绑到 %s（应 %d 度），实测 %d 度"
                             % (i, cls, DEG_OF_CLASS[cls], top))
        obs.append(top)

    # ── 图集：18 片，按 0.5× 缩存 ───────────────────────────────
    sprites = {}
    for line in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        sprites[r["logical"]] = r["out"]
    cells, images, originals = [], [], {}
    cell_of = {}
    for variant, i in [(variant, tid) for variant in ("base", "snow") for tid in ids]:
        binding = bind if variant == "base" else snow_bind
        logical = binding[i][0]
        p = os.path.join(OUT, sprites.get(logical, ""))
        if not sprites.get(logical) or not os.path.exists(p):
            raise SystemExit("⛔ 路片没落位：%s —— 先跑 slice_atlas.py %s" % (logical, ROAD_ATLAS_XML))
        im = Image.open(p).convert("RGBA")
        native = [im.width, im.height]
        originals[variant, i] = pixel_hash(im)
        tw, th = max(1, round(im.width * DOWNSCALE)), max(1, round(im.height * DOWNSCALE))
        im = im.resize((tw, th), Image.LANCZOS)
        images.append((logical, im, native))
        if variant == "base": cell_of[i] = len(cells)
        cells.append({"id": len(cells), "typeId": i, "clientResId": binding[i][2], "variant": variant,
                      "snowId": ids.index(i) + len(ids), "prefab": binding[i][1], "cls": logical.split("/")[-2], "source": logical})

    for tid in ids:
        if originals["base", tid] != originals["snow", tid]:
            raise ValueError(f"道路原始切片不再等价: {tid}; 需审核变体素材")
    atlas, layout, aliases = build_atlas("road", images)
    for c in cells:
        c["textureId"] = aliases[c["source"]]
    for base in cells[:len(ids)]:
        if base["textureId"] != cells[base["snowId"]]["textureId"]:
            raise ValueError(f"道路存储切片不再等价: {base['id']}")
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "road-atlas.png"))
    write_types(d)

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
        "schemaVersion": 3, "mapId": m, "skins": ["road", "road_snow"],
        "grid": {"side": side, "halfW": half_w, "halfH": half_h,
                 "tilesPerCell": round(half_w / 150, 6),
                 "key": "(row << 16) | col", "order": "lua tiles；bytes 侧是 (col, row) 转置"},
        "sBias": S_BIAS, "dBias": D_BIAS, "recordBytes": 6, "headerBytes": 4,
        "placements": len(recs), "placementSha256": hashlib.sha256(blob).hexdigest(),
        "typeCount": len(trip), "resIds": ids,
        "atlas": {**layout, "downscale": DOWNSCALE, "cells": cells,
                  "sha256": hashlib.sha256(open(os.path.join(d, "road-atlas.png"), "rb").read()).hexdigest()},
        "binding": {"method": "base.cw 的 client_res 表（id → prefab → 贴图）；"
                              "邻接度结构签名作交叉校验",
                    "typeIdToClientResId": TYPE_ID_TO_CLIENT_RES,
                    "degrees": obs,
                    "tier": "[实测] —— 2026-09-23 逆出 base.cw 的 ctable 解码器，直读 client_res"},
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
 * ★ [实测] client_res → prefab → texture；[disasm] 地貌带选 `_雪地` 同名资源。
 * ⚠ 图集按 **%.2g×** 缩存，`nativeSize` 记原版像素（世界尺寸依据）。
 */

import type { MapoTextureLayouts } from "./atlas-layout.types";

export interface IMapoRoadCell {
    readonly id: number;
    readonly snowId: number;
    readonly clientResId: number;
    readonly textureId: string;
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
export const MAPO_ROAD_TEXTURES: MapoTextureLayouts = %s;
''' % (m, side, half_w, half_h, DOWNSCALE, side, half_w, half_h, S_BIAS, D_BIAS,
       *layout["size"],
       json.dumps([{"id": c["id"], "snowId": c["snowId"], "clientResId": c["clientResId"], "textureId": c["textureId"], "cls": c["cls"]}
                   for c in cells], ensure_ascii=False), json.dumps(runtime_textures(layout), ensure_ascii=False))
    open(os.path.join(d, "roads.data.ts"), "w", encoding="utf-8").write(ts)

    print("  网格 %d²，半宽/半高 %d/%d（= %.4g 个逻辑格）" % (side, half_w, half_h, half_w / 150))
    print("  绑定：base.cw client_res（type_info id +%d）；邻接度交叉校验 %s"
          % (TYPE_ID_TO_CLIENT_RES, obs))
    print("  图集 %d 片（%s，%.2g× 缩存）；摆放 %d 条（%.0f KB）"
          % (len(cells), layout["size"], DOWNSCALE, len(recs), len(blob) / 1024))
    print("  片类分布 %s" % dict(collections.Counter(c["cls"] for c in cells)))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
