#!/usr/bin/env python3
"""原版**河流几何层**：`river.bytes` → 多边形摆放表 + 几何库 + 填充色图。

    /tmp/maporiginal-venv/bin/python build_rivers.py [--map s1]

★ 机制（docs/MAPORIGINAL-2D.md §4.1，本轮全部实测复现）：
  ① `river.bytes` 头 `01f8 01f8` = **504×504**、**列主序** `byte(c*row + r + 5)`；
     字节值 v ≠ 0 时是 `river_path.json` 的**下标**（1..102，值域上界恰等于表长）。
  ② 一个「河格」= **3×3 逻辑格** = 900×450 px（`grid_width = TILE_WIDTH*6`）。
     ★ 起点偏移**实测定死 = −6**（logic row = 3·i − 6）：命中率随偏移单峰，−6 处 0.8638；
     反向校验决定性 —— 河格覆盖了 **235,290 / 235,292 个 `res==47` 格（100.0%）**。
  ③ 选片**在制图期就烘死在字节值里**，运行时⛔ 不做任何邻接判断。
  ④ 每条路径 `scene/ground/river{,_yellowriver,_longriver}/<形状>_<n>[_x][_y][_xy].group`
     对应两个预制体：`_polygon_group`（水面多边形）与 `_top_group`（手摆细节，本批⛔ 不做）。

★ 多边形是**现成三角化**的：`polygon_2d` 带 `vertices` / `indices`，102 条零失败解析。
⚠ `uvs` 全零 ⇒ 原版的 UV 是运行时按世界坐标算的（与 §1.4 地表底同一套）。
  但三张填充图**都是 2×2 的单一平色**（river 78,88,94 / yellowriver 148,154,155 /
  longriver 99,108,113）⇒ 水面就是**平色填充**，⛔ 本层不需要 REPEAT、不需要世界投影 UV。
⚠ 原版三条水系的颜色差来自 `river_color_mask.ktx` 的材质蒙版（§4.1），本仓⛔ 不复刻蒙版：
  改为「**原版相对明度 × 本仓调色板色相**」—— 贴图给相对明度、顶点色给色相，
  两者都有出处，⛔ 不是拍脑袋调色。

产物：
  river-geo.bin   几何库（102 条，局部坐标，原版 px）
  river-fill.png  三张原版 2×2 填充色拼成的 6×2 图（⛔ 不是我们画的）
  rivers.bin      摆放表（按 s 升序 = 画家序）
  rivers.info.json
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

RIVER_SIDE = 504                 # river.bytes 的边长（河格）
RIVER_TILES = 3                  # 一个河格 = 3×3 逻辑格
RIVER_ORIGIN = -6                # ★ 实测：logic row = 3·i + RIVER_ORIGIN
S_BIAS, D_BIAS = 16, 1500        # s/d 可为负（margin 块），偏置成非负
SYSTEMS = ["river", "river_yellowriver", "river_longriver"]
# 本仓河流色相（= terrain 调色板的 river 色），⚠ 亮度由原版填充图给
TINT = (70, 120, 160)


def load_grid(logical: str, side: int) -> np.ndarray:
    """⚠ 列主序：`byte(c*row + r + 5)` ⇒ 读成 (col, row) 再转置。"""
    blob = open(resolve_by_name(logical), "rb").read()
    rows, cols = struct.unpack_from(">HH", blob, 0)
    if (rows, cols) != (side, side):
        raise SystemExit("⛔ %s 头 %dx%d ≠ %d²" % (logical, rows, cols, side))
    return np.frombuffer(blob, np.uint8, offset=4, count=side * side).reshape(side, side).T


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map

    rv = load_grid("map/%s/cn/river.bytes" % m, RIVER_SIDE)
    paths = json.load(open(resolve_by_name("map/%s/cn/river_path.json" % m), encoding="utf-8"))
    hi = int(rv.max())
    if hi != len(paths):
        raise SystemExit("⛔ river.bytes 最大值 %d ≠ 路径表 %d 条（下标语义不成立）" % (hi, len(paths)))

    # ── 几何库：逐条解 _polygon_group ─────────────────────────────
    geos, tops = [], []
    for idx, entry in enumerate(paths):
        stem = entry[0][: -len(".group")]
        d = prefab_bin.parse(open(resolve_by_name(stem + "_polygon_group.prefab.bin"), "rb").read())
        if d["_bytes_left"]:
            raise SystemExit("⛔ %s 解析残留 %d B" % (stem, d["_bytes_left"]))
        kids = [k for k in d["children"] if k.get("class") == "polygon_2d"]
        if len(kids) != 1:
            raise SystemExit("⛔ %s 不是「一个 node_2d 挂一个 polygon_2d」" % stem)
        p = kids[0]
        # ★ 实测 102/102 的根节点与多边形节点 transform 全是单位阵 ⇒ 顶点可直接用。
        #   ⛔ 别省这条断言：一旦有非单位 transform，顶点就要先折算，否则整片错位。
        for node, who in ((d, "根节点"), (p, "多边形节点")):
            if (abs(node["position"][0]) > 1e-6 or abs(node["position"][1]) > 1e-6
                    or abs(node["scale"][0] - 1) > 1e-6 or abs(node["scale"][1] - 1) > 1e-6
                    or abs(node["angle"][2]) > 1e-6):
                raise SystemExit("⛔ %s 的%s transform 非单位阵，顶点需要先折算" % (stem, who))
        tex = p["texture"]
        sysname = tex.split("/")[3]
        if sysname not in SYSTEMS:
            raise SystemExit("⛔ %s 的贴图 %s 不属三条水系" % (stem, tex))
        verts = [(float(x), float(y)) for x, y, *_ in p["vertices"]]
        ind = [int(i) for i in p["indices"]]
        if len(ind) % 3 or (ind and max(ind) >= len(verts)):
            raise SystemExit("⛔ %s 的索引不合法" % stem)
        geos.append({"id": idx + 1, "path": entry[0], "system": SYSTEMS.index(sysname),
                     "texture": tex[len("asset/"):], "verts": verts, "indices": ind,
                     "size": [round(float(x), 3) for x in p["size"]]})
        # ⚠ 手摆细节（_top_group）本批⛔ 不做，只统计以备下一批
        try:
            t = prefab_bin.parse(open(resolve_by_name(stem + "_top_group.prefab.bin"), "rb").read())
            tops.append(sum(1 for k in t["children"] if k.get("class") == "sprite_2d"))
        except SystemExit:
            tops.append(0)

    # ── 填充色图：三张原版 2×2 拼成 6×2 ───────────────────────────
    fill = Image.new("RGBA", (2 * len(SYSTEMS), 2))
    fills = []
    for i, s in enumerate(SYSTEMS):
        src_rel = "scene/ground/%s/png/26.png" % s
        im = Image.open(resolve_by_name(src_rel)).convert("RGBA")
        if im.size != (2, 2):
            raise SystemExit("⛔ %s 不是 2×2（平色前提不成立）" % src_rel)
        arr = np.asarray(im.convert("RGB")).reshape(-1, 3)
        px = [tuple(int(v) for v in arr[0])]
        if len({tuple(int(v) for v in row) for row in arr}) != 1:
            raise SystemExit("⛔ %s 不是单一平色" % src_rel)
        fill.paste(im, (i * 2, 0))
        fills.append({"system": i, "name": s, "rgb": list(px[0]), "source": src_rel})

    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    fill.save(os.path.join(d, "river-fill.png"))

    # ── 几何库落盘 ───────────────────────────────────────────────
    parts = [struct.pack(">H", len(geos))]
    offsets = []
    for g in geos:
        offsets.append(sum(len(x) for x in parts))
        parts.append(struct.pack(">BHH", g["system"], len(g["verts"]), len(g["indices"])))
        for x, y in g["verts"]:
            parts.append(struct.pack(">ff", x, y))
        for i in g["indices"]:
            parts.append(struct.pack(">H", i))
    geo_blob = b"".join(parts)
    open(os.path.join(d, "river-geo.bin"), "wb").write(geo_blob)

    # ── 摆放表 ───────────────────────────────────────────────────
    ii, jj = np.nonzero(rv != 0)
    vals = rv[ii, jj]
    rr = RIVER_TILES * ii.astype(np.int64) + RIVER_ORIGIN
    cc = RIVER_TILES * jj.astype(np.int64) + RIVER_ORIGIN
    recs = sorted(zip((rr + cc + S_BIAS).tolist(), (rr - cc + D_BIAS).tolist(), vals.tolist()))
    body = b"".join(struct.pack(">HHBB", s, dd, v, 0) for s, dd, v in recs)
    blob = struct.pack(">I", len(recs)) + body
    open(os.path.join(d, "rivers.bin"), "wb").write(blob)

    # ── 对位校验：每个 res==47 格都要被某个河格覆盖 ────────────────
    res = np.frombuffer(open(resolve_by_name("map/%s/cn/res.bytes" % m), "rb").read(),
                        np.uint8, offset=4, count=1500 * 1500).reshape(1500, 1500)
    is_river = res == 47
    cov = np.zeros_like(is_river)
    ok = (rr >= 0) & (rr < 1500 - RIVER_TILES + 1) & (cc >= 0) & (cc < 1500 - RIVER_TILES + 1)
    for dr in range(RIVER_TILES):
        for dc in range(RIVER_TILES):
            cov[rr[ok] + dr, cc[ok] + dc] = True
    covered = int((cov & is_river).sum())
    rate = covered / int(is_river.sum())
    if rate < 0.999:
        raise SystemExit("⛔ 对位校验不过：只覆盖了 %.4f 的 res==47 格" % rate)

    info = {
        "schemaVersion": 1, "mapId": m,
        "grid": {"side": RIVER_SIDE, "tilesPerCell": RIVER_TILES, "origin": RIVER_ORIGIN,
                 "order": "列主序 byte(c*row + r + 5)"},
        "placements": len(recs), "sBias": S_BIAS, "dBias": D_BIAS, "recordBytes": 6,
        "placementLayout": "大端：u16 s(=R+C+sBias), u16 d(=R−C+dBias), u8 geo(1..102), u8 保留；按 s 升序",
        "placementSha256": hashlib.sha256(blob).hexdigest(),
        "geoCount": len(geos), "geoBytes": len(geo_blob),
        "geoSha256": hashlib.sha256(geo_blob).hexdigest(),
        "geoLayout": "大端：u16 条数；每条 u8 system, u16 nVerts, u16 nIdx, "
                     "nVerts×{f32 x, f32 y}（原版 px，局部坐标）, nIdx×u16",
        "verts": sum(len(g["verts"]) for g in geos),
        "tris": sum(len(g["indices"]) // 3 for g in geos),
        "systems": fills, "tint": list(TINT),
        "tintNote": "顶点色 = 本仓调色板 river 色相；亮度由 river-fill.png 的原版平色给。"
                    "⛔ 原版的 river_color_mask.ktx 蒙版本仓不复刻。",
        "alignCheck": {"res==47 格": int(is_river.sum()), "被覆盖": covered,
                       "覆盖率": round(rate, 6)},
        "topGroupSprites": {"合计": sum(tops), "每条 min/max": [min(tops), max(tops)]},
        "source": {"grid": "map/%s/cn/river.bytes" % m,
                   "paths": "map/%s/cn/river_path.json" % m,
                   "geometry": "scene/ground/river*/<形状>_polygon_group.prefab.bin"},
    }
    json.dump(info, open(os.path.join(d, "rivers.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump([{k: v for k, v in g.items() if k not in ("verts", "indices")} for g in geos],
              open(os.path.join(d, "river-geo.index.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal 河流层常量（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 机制见 docs/MAPORIGINAL-2D.md §4.1：`river.bytes` 是「河格 → `river_path.json` 下标」的
 *   单字节图，**选片在制图期就烘死在字节值里**，运行时 ⛔ 不做任何邻接判断。
 * ★ 一个「河格」= **3×3 逻辑格**；起点偏移 **−6**（logic row = 3·i − 6）是实测定死的：
 *   河格覆盖了 %d / %d 个 `res==47` 格（%.1f%%）。
 * ★ 水面是**平色多边形**：三张原版填充图都是 2×2 的单一平色，
 *   ⛔ 本层不需要 REPEAT、不需要世界投影 UV（地表底那层才需要，见 §1.4）。
 * ⚠ 原版三条水系的颜色差来自 `river_color_mask.ktx` 的材质蒙版，本仓 ⛔ 不复刻：
 *   改为「原版相对明度（`river-fill.png`）× 本仓色相（`MAPO_RIVER_TINT`）」。
 */

export interface IMapoRiverSystem {
    readonly system: number;
    readonly name: string;
    /** 原版填充图的平色（本仓只取其相对明度）。 */
    readonly rgb: readonly [number, number, number];
}

/** 河格边长（河格数）。 */
export const MAPO_RIVER_SIDE = %d;
/** 一个河格 = 几个逻辑格。 */
export const MAPO_RIVER_TILES = %d;
/** logic row = MAPO_RIVER_TILES × i + MAPO_RIVER_ORIGIN。 */
export const MAPO_RIVER_ORIGIN = %d;
export const MAPO_RIVER_S_BIAS = %d;
export const MAPO_RIVER_D_BIAS = %d;
/** 摆放表单条长度（u16 s, u16 d, u8 geo, u8 保留）。 */
export const MAPO_RIVER_RECORD_BYTES = 6;
export const MAPO_RIVER_HEADER_BYTES = 4;
/** 几何库条数（= `river_path.json` 的长度）。 */
export const MAPO_RIVER_GEO_COUNT = %d;
/** 三条水系；次序即 `river-fill.png` 里三个 2×2 色块的次序。 */
export const MAPO_RIVER_SYSTEMS: readonly IMapoRiverSystem[] = %s;
/** 本仓的河流色相（= terrain 调色板的 river 色）。⚠ 亮度由 `river-fill.png` 给。 */
export const MAPO_RIVER_TINT: readonly [number, number, number] = %s;
''' % (m, covered, int(is_river.sum()), 100.0 * rate,
       RIVER_SIDE, RIVER_TILES, RIVER_ORIGIN, S_BIAS, D_BIAS, len(geos),
       json.dumps([{"system": f["system"], "name": f["name"], "rgb": f["rgb"]} for f in fills],
                  ensure_ascii=False),
       json.dumps(list(TINT)))
    open(os.path.join(d, "river.data.ts"), "w", encoding="utf-8").write(ts)
    print("  几何 %d 条 / %d 顶点 / %d 三角（%.0f KB）"
          % (len(geos), info["verts"], info["tris"], len(geo_blob) / 1024))
    print("  水系 %s" % "、".join("%s:%d" % (f["name"], sum(1 for g in geos if g["system"] == f["system"]))
                                  for f in fills))
    print("  摆放 %d 格（%.0f KB）  对位覆盖 %d/%d = %.4f"
          % (len(recs), len(blob) / 1024, covered, int(is_river.sum()), rate))
    print("  _top_group 手摆件 %d 个（每条 %d..%d）—— ⚠ 本批不做"
          % (sum(tops), min(tops), max(tops)))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
