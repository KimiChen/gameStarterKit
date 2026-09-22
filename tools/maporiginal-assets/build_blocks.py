#!/usr/bin/env python3
"""原版 **snow / desert 的 block 级地貌带**（M2-B2）。

    /tmp/maporiginal-venv/bin/python build_blocks.py [--map s1]

★ 机制（docs/MAPORIGINAL-2D.md §1.1 / §1.3 / §1.6）：
  ① 三个地表数据层是**平级**的：`ground2` / `ground_desert` / `ground_snow`，
     但 ShowLayers2d 里**只有一条** `ground` —— desert/snow 没有自己的显示层，
     被 ground 的 view **一起画**（`GroundBlockGrid:create_view` 里
     `for _, ground_type in ipairs{"ground","desert","snow"}`）。
  ② 三层是「**叠**」不是「替」：`POLYGON_LAYER_ORDER = {ground=100, desert=200, snow=300}`，
     同一块可以同时挂草地底 + 沙漠贴片 + 雪贴片（实测 489 块两者兼有）。
  ③ 网格与地表底同构：**152×152 块**、一块 = 10×10 逻辑格、原点偏移 **−10**。
     ⚠ **行主序**（`string.byte(gridInfo, col*r + c + 5)`）—— ⛔ 与 river 的列主序不同！
     实测判据：行主序下 desert 块中心有 **88.58%** 落在 `logic_background == 3` 上，
     列主序只有 4.29%（snow ↔ 2 同理）。
  ④ 字节值 v ≠ 0 时是 `ground_<kind>_path.json` 的**下标**（desert 1..51、snow 1..52，
     与表长 1:1），⇒ 选片同样**在制图期就烘死了**，运行时 ⛔ 不做邻接判断。
  ⑤ 片是 `<路径>_polygon_group` 的 `polygon_2d`：desert 铺 `ground_down/underground3.png`、
     snow 铺 `underground2.png`（§1.6 实测 177/177 零例外）。

⚠ **UV 规则是有依据的推断**：`polygon_2d` 的 `uvs` 全零 ⇒ 原版在运行时按世界坐标算
  （与 §1.4 地表底同一套），但**具体式子不在证据集里**（在引擎 C++ 侧）。
  本仓采用**与地表底完全相同的块级投影**（同周期、同相位、锚在块中心）——
  这是唯一能让「块边界落在整周期上」（§1.4 明写的设计意图）且与底纹对齐的取法。
  ⛔ 别改成按多边形自身包围盒投影：边缘片的 size 比整块小，相邻块的花纹相位会跳。

⚠ `_top_group` 的手摆细节（desert 5–17、snow 12–23 个 sprite）**本批不做**，与河流同批留后。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prefab_bin  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PNG = os.path.join(OUT, "png")

GRID_SIDE = 152
BLOCK_TILES = 10
ORIGIN = -10
S_BIAS, D_BIAS = 32, 1536
ORIG_TILE_HALF_W, ORIG_TILE_HALF_H = 150, 75
KINDS = {"desert": "ground_down/underground3.png", "snow": "ground_down/underground2.png"}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)

    block_w = ORIG_TILE_HALF_W * 2 * BLOCK_TILES
    block_h = ORIG_TILE_HALF_H * 2 * BLOCK_TILES
    summary = {}
    for kind, tex_rel in KINDS.items():
        paths = json.load(open(resolve_by_name("map/%s/cn/ground_%s_path.json" % (m, kind)),
                               encoding="utf-8"))
        raw = open(resolve_by_name("map/%s/cn/ground_%s.bytes" % (m, kind)), "rb").read()
        rows, cols = struct.unpack_from(">HH", raw, 0)
        if (rows, cols) != (GRID_SIDE, GRID_SIDE):
            raise SystemExit("⛔ ground_%s 头 %dx%d ≠ %d²" % (kind, rows, cols, GRID_SIDE))
        # ⚠ 行主序（⛔ 不是 river 的列主序）
        grid = np.frombuffer(raw, np.uint8, offset=4, count=GRID_SIDE * GRID_SIDE) \
            .reshape(GRID_SIDE, GRID_SIDE)
        hi = int(grid.max())
        if hi != len(paths):
            raise SystemExit("⛔ ground_%s 最大值 %d ≠ 路径表 %d 条" % (kind, hi, len(paths)))

        # ── 贴图 ────────────────────────────────────────────────
        src = os.path.join(PNG, tex_rel)
        if not os.path.exists(src):
            raise SystemExit("⛔ %s 的底纹没落位：%s" % (kind, src))
        im = Image.open(src).convert("RGBA")
        tw, th = im.size
        if (tw & (tw - 1)) or (th & (th - 1)):
            raise SystemExit("⛔ %s 是 %dx%d，非 POT 在 WebGL1 下不能 GL_REPEAT" % (tex_rel, tw, th))
        im.save(os.path.join(d, "%s-base.png" % kind))
        u = tw * (block_w // tw)
        v = th * (block_h // th)

        # ── 几何库 ──────────────────────────────────────────────
        geos = []
        for idx, entry in enumerate(paths):
            stem = entry[0][: -len(".group")]
            p = prefab_bin.parse(open(resolve_by_name(stem + "_polygon_group.prefab.bin"), "rb").read())
            if p["_bytes_left"]:
                raise SystemExit("⛔ %s 解析残留 %d B" % (stem, p["_bytes_left"]))
            kids = [k for k in p["children"] if k.get("class") == "polygon_2d"]
            if len(kids) != 1:
                raise SystemExit("⛔ %s 不是「一个 node_2d 挂一个 polygon_2d」" % stem)
            poly = kids[0]
            for node, who in ((p, "根节点"), (poly, "多边形节点")):
                if (abs(node["position"][0]) > 1e-6 or abs(node["position"][1]) > 1e-6
                        or abs(node["scale"][0] - 1) > 1e-6 or abs(node["scale"][1] - 1) > 1e-6
                        or abs(node["angle"][2]) > 1e-6):
                    raise SystemExit("⛔ %s 的%s transform 非单位阵" % (stem, who))
            if not poly["texture"].endswith(tex_rel.rsplit("/", 1)[-1]):
                raise SystemExit("⛔ %s 铺的是 %s，不是 %s" % (stem, poly["texture"], tex_rel))
            verts = [(float(x), float(y)) for x, y, *_ in poly["vertices"]]
            ind = [int(i) for i in poly["indices"]]
            if len(ind) % 3 or (ind and max(ind) >= len(verts)):
                raise SystemExit("⛔ %s 的索引不合法" % stem)
            geos.append({"id": idx + 1, "path": entry[0], "verts": verts, "indices": ind})

        parts = [struct.pack(">H", len(geos))]
        for g in geos:
            parts.append(struct.pack(">BHH", 0, len(g["verts"]), len(g["indices"])))
            for x, y in g["verts"]:
                parts.append(struct.pack(">ff", x, y))
            for i in g["indices"]:
                parts.append(struct.pack(">H", i))
        geo_blob = b"".join(parts)
        open(os.path.join(d, "%s-geo.bin" % kind), "wb").write(geo_blob)

        # ── 摆放表 ──────────────────────────────────────────────
        ii, jj = np.nonzero(grid != 0)
        rr = BLOCK_TILES * ii.astype(np.int64) + ORIGIN
        cc = BLOCK_TILES * jj.astype(np.int64) + ORIGIN
        recs = sorted(zip((rr + cc + S_BIAS).tolist(), (rr - cc + D_BIAS).tolist(),
                          grid[ii, jj].tolist()))
        body = b"".join(struct.pack(">HHBB", s, dd, val, 0) for s, dd, val in recs)
        blob = struct.pack(">I", len(recs)) + body
        open(os.path.join(d, "%s.bin" % kind), "wb").write(blob)

        summary[kind] = {
            "texture": {"source": tex_rel, "size": [tw, th],
                        "sha256": hashlib.sha256(open(os.path.join(d, "%s-base.png" % kind),
                                                      "rb").read()).hexdigest()},
            "repeat": {"timesU": u // tw, "timesV": v // th},
            "geoCount": len(geos), "geoBytes": len(geo_blob),
            "geoSha256": hashlib.sha256(geo_blob).hexdigest(),
            "verts": sum(len(g["verts"]) for g in geos),
            "tris": sum(len(g["indices"]) // 3 for g in geos),
            "placements": len(recs), "placementSha256": hashlib.sha256(blob).hexdigest(),
            "paths": [g["path"] for g in geos],
        }
        print("  %-7s 路径 %d 条 / %d 顶点 / %d 三角；块 %d 个；底纹 %s %dx%d repeat %d×%d"
              % (kind, len(geos), summary[kind]["verts"], summary[kind]["tris"], len(recs),
                 tex_rel, tw, th, u // tw, v // th))

    # 两者兼有的块（§1.3 的「叠不是替」硬证）
    gd = np.frombuffer(open(resolve_by_name("map/%s/cn/ground_desert.bytes" % m), "rb").read(),
                       np.uint8, offset=4, count=GRID_SIDE ** 2).reshape(GRID_SIDE, GRID_SIDE)
    gs = np.frombuffer(open(resolve_by_name("map/%s/cn/ground_snow.bytes" % m), "rb").read(),
                       np.uint8, offset=4, count=GRID_SIDE ** 2).reshape(GRID_SIDE, GRID_SIDE)
    both = int(((gd != 0) & (gs != 0)).sum())

    info = {
        "schemaVersion": 1, "mapId": m,
        "grid": {"side": GRID_SIDE, "blockTiles": BLOCK_TILES, "origin": ORIGIN,
                 "order": "行主序 byte(col*r + c + 5)（⛔ 与 river 的列主序不同）"},
        "sBias": S_BIAS, "dBias": D_BIAS, "recordBytes": 6, "headerBytes": 4,
        "layerOrder": {"ground": 100, "desert": 200, "snow": 300},
        "bothBlocks": both,
        "uvRule": "与地表底完全相同的块级世界投影（同周期、同相位、锚在块中心）。"
                  "⚠ 原版 polygon_2d 的 uvs 全零、真式子在引擎侧不可见 —— 这是**有依据的推断**，"
                  "取它是因为只有它能让块边界落在整周期上（§1.4 明写的设计意图）。",
        "kinds": summary,
    }
    json.dump(info, open(os.path.join(d, "blocks.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal **snow / desert 块级地貌带**常量（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 三个地表层是「**叠**」不是「替」（MAPORIGINAL-2D §1.3）：
 *   `POLYGON_LAYER_ORDER = {ground: 100, desert: 200, snow: 300}`，
 *   同一块可以同时挂草地底 + 沙漠贴片 + 雪贴片（实测 **%d 块**两者兼有）。
 * ★ 网格与地表底同构（152² 块 / 一块 10×10 格 / 原点 −10），
 *   ⚠ 但是**行主序** —— ⛔ 与 `river.bytes` 的列主序不同。实测判据：行主序下
 *   desert 块中心 88.58%% 落在 `logic_background == 3` 上，列主序只有 4.29%%。
 * ★ 字节值就是路径表下标（desert 1..%d、snow 1..%d），选片**制图期烘死**，运行时零判断。
 * ⚠ UV 用**与地表底相同的块级投影**：原版 `polygon_2d` 的 uvs 全零、真式子在引擎侧，
 *   这是有依据的推断（只有它能让块边界落在整周期上）。⛔ 别按多边形自身包围盒投影。
 */

export interface IMapoBlockLayer {
    readonly kind: string;
    /** `POLYGON_LAYER_ORDER`：越大越靠上。 */
    readonly order: number;
    /** 路径表条数 = 字节值上界。 */
    readonly geoCount: number;
    /** 底纹横向 / 纵向各铺几次。 */
    readonly repeat: readonly [number, number];
    readonly textureSize: readonly [number, number];
}

export const MAPO_BLOCK_S_BIAS = %d;
export const MAPO_BLOCK_D_BIAS = %d;
export const MAPO_BLOCK_RECORD_BYTES = 6;
export const MAPO_BLOCK_HEADER_BYTES = 4;
export const MAPO_BLOCK_LAYERS: readonly IMapoBlockLayer[] = %s;
''' % (m, both, summary["desert"]["geoCount"], summary["snow"]["geoCount"], S_BIAS, D_BIAS,
       json.dumps([{"kind": k, "order": info["layerOrder"][k], "geoCount": s["geoCount"],
                    "repeat": [s["repeat"]["timesU"], s["repeat"]["timesV"]],
                    "textureSize": s["texture"]["size"]}
                   for k, s in summary.items()], ensure_ascii=False))
    open(os.path.join(d, "blocks.data.ts"), "w", encoding="utf-8").write(ts)
    print("  两者兼有的块 %d（§1.3「叠不是替」的硬证）" % both)
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
