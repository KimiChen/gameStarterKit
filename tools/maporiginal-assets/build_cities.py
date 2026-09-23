#!/usr/bin/env python3
"""原版**城址件**（249 座城的城墙 + 民居 sprite 群）。

    /tmp/maporiginal-venv/bin/python build_cities.py [--map s1]

★ 机制（docs/MAPORIGINAL-2D.md §5）：城不在 `res.bytes` 里，是**建筑层**画上去的。
  件由 `base.cw` 两级配置定：`city[1].client_res_id` → `city_res.editor_brush_res_path`
  → `asset/scene/build/<子目录>/<名>.group`，磁盘上是配对的 `<名>_group.prefab.bin`。
  ⚠ 目录名大小写在配置里是 `Gate/` / `Wharf/`、VFS 里是**小写** ⇒ 必须**大小写不敏感**地查。

★ 件的内部结构与 `_top_group` **完全同构**（§1.6）：`node_2d` 根 + 一串 `sprite_2d`，
  各带独立 pos / scale / angle / `low_z`，按 **`low_z` 升序**决定压盖。⛔ 别按子节点原序画。

★ 规模（实测）：**15 个件覆盖全部 249 座**（东/南/西/北 × 小城/都城 8 个 + 关卡 3 + 码头 3
  + 洛阳专用 1），合计 1,850 个 sprite、158 张贴图。

⚠ 件是**按城序号引用**的，⛔ 一个件被多座城共用（如北方小城 84 座）⇒ 落盘只存
  「15 个件的摆放库 + 249 座的 (件号, 锚点格)」，⛔ 别把件展开 249 份。

⚠ 12 座渡口（`PIER_*`）在 `city_shape` 里带非零 `even_res_center` / `odd_res_center`
  美术偏移（§11-1）—— **本管线已套上**，⛔ 别在渲染侧再套一次。

产物：`city-atlas.png` + `cities.bin` + `cities.info.json`。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prefab_bin  # noqa: E402
from prefab_visual import visual_fields, pack_visual
from build_tops import normalize  # noqa: E402
from ctable_cw import BaseCw, Ref  # noqa: E402
from decode_ktx import _name_map, resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

PAD = 2
# ★ 与 top 件同惯例：图集按 0.4× 缩存，`native` 记原版像素当世界尺寸依据。
DOWNSCALE = 0.4
ATLAS_SIZES = (512, 1024, 2048, 4096)
SCALE_MIN, SCALE_MAX = 0.05, 12.0


def sprite_index() -> dict:
    """`sprites.jsonl` → **归一化后**的小写逻辑名 → 本地 PNG。

    ⚠ 存证里的键**未归一化**：图集 XML 的 `n=` 常写成
    `…/atlas_mutil_assets/asset/<真路径>@@<材质名>.png`，而 prefab 里写的是 `<真路径>.png`
    ⇒ 必须两边都过 `normalize()` 再比，⛔ 直接拿 prefab 的路径去查会 50/158 落空。
    ⚠ 再叠一层**大小写不敏感**：配置写 `Gate/` / `Wharf/`，图集里写 `gate/` / `wharf/`。
    """
    rev: dict = {}
    for line in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        rev.setdefault(normalize(r["logical"]).lower(), os.path.join(OUT, r["out"]))
    return rev


def piece_path(brush: str) -> str:
    """`asset/scene/build/Gate/gate_01.group` → 磁盘上的 `<…>_group.prefab.bin`（大小写不敏感）。"""
    if not (brush.startswith("asset/") and brush.endswith(".group")):
        raise SystemExit("⛔ editor_brush_res_path 形态不认识：%s" % brush)
    want = brush[len("asset/"):-len(".group")] + "_group.prefab.bin"
    mapping, _ = _name_map()
    if want in mapping:
        return want
    low = {k.lower(): k for k in mapping}
    real = low.get(want.lower())
    if real is None:
        raise SystemExit("⛔ 城址件没落位：%s" % want)
    return real


def parse_piece(logical: str) -> list:
    d = prefab_bin.parse(open(resolve_by_name(logical), "rb").read())
    if d["_bytes_left"]:
        raise SystemExit("⛔ %s 解析残留 %d B" % (logical, d["_bytes_left"]))
    items = []
    for order, k in enumerate(d["children"]):
        if k.get("class") != "sprite_2d":
            raise SystemExit("⛔ %s 有非 sprite_2d 子节点 %r，摆放要重想"
                             % (logical, k.get("class")))
        if k.get("children"):
            raise SystemExit("⛔ %s 有孙节点，摆放要重想" % logical)
        sx, sy = float(k["scale"][0]), float(k["scale"][1])
        if not (SCALE_MIN < abs(sx) < SCALE_MAX and SCALE_MIN < abs(sy) < SCALE_MAX):
            raise SystemExit("⛔ %s 的 scale %s 越界" % (logical, (sx, sy)))
        items.append({"tex": normalize(k["texture"]), "order": order, "lowZ": int(k["low_z"]),
                      "pos": [round(float(k["position"][0]), 4), round(float(k["position"][1]), 4)],
                      "scale": [round(sx, 6), round(sy, 6)],
                      "angle": round(float(k["angle"][2]), 4), **visual_fields(k)})
    items.sort(key=lambda x: (x["lowZ"], x["order"]))     # ⚠ low_z 升序定压盖
    return items


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map
    sprites = sprite_index()

    labels = json.load(open(os.path.join(OUT, "pack", m, "labels.json"), encoding="utf-8"))
    cities = labels["cities"]
    cw = BaseCw()
    tbl = cw.tables()
    cres = cw.rows(tbl["city_res"])
    shapes = cw.rows(tbl["city_shape"])

    # ── 15 个件：解析 + 编号 ────────────────────────────────────
    res_ids = sorted({c["clientResId"] for c in cities})
    pieces, order_of = [], {}
    for rid in res_ids:
        logical = piece_path(cres[rid]["editor_brush_res_path"])
        order_of[rid] = len(pieces)
        pieces.append({"resId": rid, "name": cres[rid]["name"],
                       "source": logical, "items": parse_piece(logical)})
        print("  #%-2d res%-4d %-12s %-44s %d 件"
              % (order_of[rid], rid, cres[rid]["name"], logical.replace("scene/build/", ""),
                 len(pieces[-1]["items"])))

    # ── 美术锚点偏移：只有 12 座渡口非零（§11-1） ──────────────────
    def center(row: dict, key: str) -> tuple:
        v = row.get(key)
        if not isinstance(v, Ref):
            return (0, 0)
        t = cw.table(v.idx)
        arr = list(t[0]) if t else []
        return (int(arr[0]), int(arr[1])) if len(arr) == 2 else (0, 0)

    by_alias = {r.get("allias"): r for r in shapes.values()}
    offsets = 0
    placed = []
    for c in cities:
        row = by_alias.get(c["shape"])
        if row is None:
            raise SystemExit("⛔ 形状 %r 不在 city_shape 里" % c["shape"])
        # ⚠ **奇偶行各一套**：原版菱形网格奇数行错半格，偏移也分两套。
        dr, dc = center(row, "odd_res_center" if c["row"] & 1 else "even_res_center")
        offsets += bool(dr or dc)
        placed.append({"id": c["id"], "name": c["name"], "piece": order_of[c["clientResId"]],
                       "row": c["row"] + dr, "col": c["col"] + dc,
                       "anchorRow": c["row"], "anchorCol": c["col"]})
    print("  摆位 %d 座，其中 %d 座套了美术锚点偏移（渡口）" % (len(placed), offsets))

    # ── 一张图集（158 张贴图） ───────────────────────────────────
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    texs = sorted({it["tex"] for p in pieces for it in p["items"]})
    imgs = []
    for tex in texs:
        src = sprites.get(tex.lower()) or os.path.join(OUT, "png", tex)
        if not os.path.exists(src):
            raise SystemExit("⛔ 城址件贴图没落位：%s\n"
                             "   它在 atlas_tex/s17_main_city.xml 或 remain_tex.xml 里，"
                             "先跑 slice_atlas.py 切那两张" % tex)
        im = Image.open(src).convert("RGBA")
        tw, th = max(1, round(im.width * DOWNSCALE)), max(1, round(im.height * DOWNSCALE))
        imgs.append((th, tw, tex, im.resize((tw, th), Image.LANCZOS), [im.width, im.height]))
    imgs.sort(key=lambda x: (-x[0], -x[1]))
    packed = None
    for side in ATLAS_SIZES:
        atlas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        cells, x, y, row_h, ok = [], PAD, PAD, 0, True
        for h, w, tex, im, native in imgs:
            if x + w + PAD > side:
                x, y, row_h = PAD, y + row_h + PAD, 0
            if y + h + PAD > side:
                ok = False
                break
            atlas.paste(im, (x, y))
            cells.append({"id": len(cells), "rect": [x, y, w, h], "native": native, "source": tex})
            x += w + PAD
            row_h = max(row_h, h)
        if ok:
            packed = (side, atlas, cells)
            break
    if packed is None:
        raise SystemExit("⛔ 城址图集连 %d² 都装不下（%d 种贴图）" % (ATLAS_SIZES[-1], len(imgs)))
    side, atlas, cells = packed
    atlas.save(os.path.join(d, "city-atlas.png"))
    cell_of = {c["source"]: c["id"] for c in cells}
    fill = sum(c["rect"][2] * c["rect"][3] for c in cells) / (side * side)
    print("  图集 %d 种 / %d²（填充 %.0f%%）" % (len(cells), side, fill * 100))

    # ── 摆放库 ────────────────────────────────────────────────
    parts = [struct.pack(">HH", len(pieces), len(placed))]
    for p in pieces:
        parts.append(struct.pack(">H", len(p["items"])))
    for p in pieces:
        for it in p["items"]:
            parts.append(pack_visual(it, cell_of[it["tex"]]))
    for q in placed:
        parts.append(struct.pack(">HHH", q["piece"], q["row"], q["col"]))
    blob = b"".join(parts)
    open(os.path.join(d, "cities.bin"), "wb").write(blob)

    info = {
        "schemaVersion": 2, "mapId": m,
        "atlas": {"size": [side, side], "pad": PAD, "downscale": DOWNSCALE,
                  "fill": round(fill, 4), "cells": cells,
                  "sha256": hashlib.sha256(
                      open(os.path.join(d, "city-atlas.png"), "rb").read()).hexdigest()},
        "pieces": [{"order": i, "resId": p["resId"], "name": p["name"], "source": p["source"],
                    "sprites": len(p["items"])} for i, p in enumerate(pieces)],
        "placements": len(placed), "anchorOffsets": offsets,
        "recordBytes": {"sprite": 56, "placement": 6},
        "layout": "大端：u16 件数、u16 摆位数；件数×u16 每件精灵数；"
                  "所有精灵按件序、件内按 low_z 升序 {u16 图集格, f32 x, f32 y, f32 sx, f32 sy, f32 angle, 2f size, 2f pivot, 2f skew, 2B mirror, 4B color, 4B addColor}；"
                  "然后摆位 {u16 件号, u16 row, u16 col}",
        "sha256": hashlib.sha256(blob).hexdigest(),
        "note": "件由 base.cw 的 city[1].client_res_id → city_res.editor_brush_res_path 定；"
                "row/col 已套 city_shape 的 even/odd_res_center 美术偏移（%d 座渡口非零），"
                "⛔ 渲染侧别再套一次" % offsets,
    }
    json.dump(info, open(os.path.join(d, "cities.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    ts = '''/**
 * mapOriginal **城址件**（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 城不在 `res.bytes` 里，是建筑层画上去的（MAPORIGINAL-2D §5）。件由 `base.cw` 两级配置定：
 *   `city[1].client_res_id` → `city_res.editor_brush_res_path` → `<名>_group.prefab.bin`。
 * ★ **%d 个件覆盖全部 %d 座**（东/南/西/北 × 小城/都城 8 + 关卡 3 + 码头 3 + 洛阳专用 1），
 *   合计 %d 个 sprite。⇒ 落盘只存「件库 + 摆位」，⛔ 件不展开 %d 份。
 * ⚠ 件内次序按 **`low_z` 升序**（打包期已排好），⛔ 别按子节点原序。
 * ⚠ 件的世界尺寸 = **prefab.size × prefab.scale**，⛔ 不是图集像素（图集按 %s× 缩存）。
 * ⚠ 摆位的 row/col **已套** `city_shape` 的 `even/odd_res_center` 美术偏移
 *   （%d 座渡口非零，§11-1），⛔ 渲染侧别再套一次。
 */

export interface IMapoCityCell {
  readonly id: number;
  /** 图集像素矩形 [x, y, w, h]（**已缩**）。 */
  readonly rect: readonly [number, number, number, number];
  /** 原图像素（**未缩**）。native 只记采样尺寸，显示使用 prefab.size × scale。 */
  readonly native: readonly [number, number];
}

export interface IMapoCityPiece {
  readonly order: number;
  /** 原版 `city_res` 的 id。 */
  readonly resId: number;
  readonly name: string;
  readonly sprites: number;
}

/** 单条记录长度：件内精灵 u16 + 5 × f32；摆位 3 × u16。 */
export const MAPO_CITY_SPRITE_BYTES = %d;
export const MAPO_CITY_PLACEMENT_BYTES = %d;
export const MAPO_CITY_DOWNSCALE = %s;
export const MAPO_CITY_ATLAS_SIZE: readonly [number, number] = %s;
export const MAPO_CITY_PLACEMENTS = %d;
export const MAPO_CITY_PIECES: readonly IMapoCityPiece[] = %s;
export const MAPO_CITY_CELLS: readonly IMapoCityCell[] = %s;
''' % (m, len(pieces), len(placed), sum(len(p["items"]) for p in pieces), len(placed),
       DOWNSCALE, offsets,
       info["recordBytes"]["sprite"], info["recordBytes"]["placement"], DOWNSCALE,
       json.dumps(list(info["atlas"]["size"])), len(placed),
       json.dumps([{"order": i, "resId": p["resId"], "name": p["name"],
                    "sprites": len(p["items"])} for i, p in enumerate(pieces)],
                  ensure_ascii=False),
       json.dumps([{"id": c["id"], "rect": c["rect"], "native": c["native"]} for c in cells],
                  ensure_ascii=False))
    open(os.path.join(d, "cities.data.ts"), "w", encoding="utf-8").write(ts)

    print("→ %s（件 %d / 精灵 %d / 摆位 %d，%.0f KB）"
          % (d, len(pieces), sum(len(p["items"]) for p in pieces), len(placed), len(blob) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
