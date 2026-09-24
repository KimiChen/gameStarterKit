#!/usr/bin/env python3
"""原版 `_top_group` 的**手摆细节**（河流 / snow / desert 三族共用）。

    /tmp/maporiginal-venv/bin/python build_tops.py [--map s1]

★ 机制（docs/MAPORIGINAL-2D.md §1.6）：`_polygon_group` 铺底色多边形，配对的 `_top_group`
  是**若干个 `sprite_2d`**，各带独立 pos / scale / angle 与**互不相同的 `low_z`**。
  ⇒ 底是"面"、top 是"手摆的点缀"（岸石、草丛、雪堆、沙丘纹）。

★ 规模（静态 sprite 记录；含引用/动画的组另导出完整节点图）：
    river  102 组 / 597 sprite    desert 51 组 / 481    snow 52 组 / 821   合计 **1,899**

⚠ **贴图路径要先归一化**：34 种写成
  `asset/scene/_output_atlas_scene/atlas_mutil_assets/asset/<真路径>@@<材质名>.png`
  —— 前缀是图集打包器塞的、`@@` 后是**材质名不是文件名**。剥掉两者才查得到。
  （MAPORIGINAL-2D 的 2D 素材白名单机检早就记过这种嵌套前缀写法。）

⚠ 摆放次序按 **`low_z` 升序**（同值再按子序）：原版就是靠它决定同一组内谁压谁，
  ⛔ 别按子节点原序画。

产物：`top-atlas.png` + `top-atlas.info.json` + 每族一份 `<kind>-tops.bin` + `tops.data.ts`。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import struct
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prefab_bin  # noqa: E402
from prefab_visual import visual_fields, pack_visual
from texture_layout import build_atlas, runtime_textures, write_types
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PNG = os.path.join(OUT, "png")

FAMILIES = [("river", "map/%s/cn/river_path.json"),
            ("desert", "map/%s/cn/ground_desert_path.json"),
            ("snow", "map/%s/cn/ground_snow_path.json")]
# ⚠ **每族一张图集**：river 78 种贴图、总面积 1,546 万 px²，三族合并放不进 4096²。
#   而且每族本来就各有一个材质（一个材质只能挂一张 mainTexture），分开天然合拍。
# ★ 图集里按 0.4× 缩存，`nativeSize` 仍记**原版像素**当尺寸依据（与山族件 `nativeSize`/`storageSize` 同惯例）。
#   依据：本仓世界尺度 = 32/150 = 0.213 ⇒ 900 px 的件在 LOD0 只占 192 世界像素，
#   存 360 px 仍有 1.9× 过采样。⛔ 别按原生像素装：78 张 900×450 要 59 MB 显存。
TOP_DOWNSCALE = 0.4
SCALE_MIN, SCALE_MAX = 0.05, 12.0

_MUTIL = re.compile(r"^asset/scene/_output_atlas_scene/atlas_mutil_assets/(.+)$")


def normalize(tex: str) -> str:
    """`…/atlas_mutil_assets/asset/<真路径>@@<材质>.png` → `<真路径>.png`（去 asset/ 前缀）。"""
    m = _MUTIL.match(tex)
    if m:
        tex = m.group(1)
    if tex.startswith("asset/"):
        tex = tex[len("asset/"):]
    base, ext = os.path.splitext(tex)
    if "@@" in base:            # @@ 后是**材质名**，⛔ 不是文件名的一部分
        base = base.split("@@", 1)[0]
    return base + ext


def sprite_png(logical: str, sprites: dict) -> str:
    """归一化后的逻辑路径 → 本地 PNG。先查图集切片存证，再查 out/png 直解。"""
    if logical in sprites:
        p = os.path.join(OUT, sprites[logical])
        if os.path.exists(p):
            return p
    p = os.path.join(PNG, logical)
    if os.path.exists(p):
        return p
    raise SystemExit("⛔ top 件贴图没落位：%s\n   先跑 slice_atlas.py --all / decode_batch.py" % logical)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map
    sprites = {}
    for line in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8"):
        r = json.loads(line)
        sprites[r["logical"]] = r["out"]

    # ── 解析三族的 _top_group ───────────────────────────────────
    import prefab_scene
    from scene_export import textures, compile_node
    dynamic = {}
    fam_groups: dict = {}
    used: dict = {}
    for kind, path_tpl in FAMILIES:
        paths = json.load(open(resolve_by_name(path_tpl % m), encoding="utf-8"))
        groups = []
        dynamic[kind] = {}
        for group_index, entry in enumerate(paths):
            stem = entry[0][: -len(".group")]
            d = prefab_bin.parse(open(resolve_by_name(stem + "_top_group.prefab.bin"), "rb").read())
            if d["_bytes_left"]:
                raise SystemExit("⛔ %s 解析残留 %d B" % (stem, d["_bytes_left"]))
            items = []
            if any(k.get("class") != "sprite_2d" or k.get("children") for k in d["children"]):
                expanded = prefab_scene.load(stem + "_top_group.prefab")
                dynamic[kind][group_index] = expanded
            for order, k in enumerate(d["children"]):
                if k.get("class") != "sprite_2d":
                    continue                      # 引用/动画由完整节点图消费。
                if k.get("children"):
                    raise SystemExit("⛔ %s 的 top 件有孙节点，摆放要重想" % stem)
                tex = normalize(k["texture"])
                sx, sy = float(k["scale"][0]), float(k["scale"][1])
                if not (SCALE_MIN < abs(sx) < SCALE_MAX and SCALE_MIN < abs(sy) < SCALE_MAX):
                    raise SystemExit("⛔ %s 的 top 件 scale %s 越界" % (stem, (sx, sy)))
                used.setdefault(tex, None)
                items.append({"tex": tex, "order": order, "lowZ": int(k["low_z"]),
                              "pos": [round(float(k["position"][0]), 4),
                                      round(float(k["position"][1]), 4)],
                              "scale": [round(sx, 6), round(sy, 6)],
                              "angle": round(float(k["angle"][2]), 4),
                              **visual_fields(k)})
            # ⚠ low_z 升序（同值按子序）—— 原版靠它定同组内的压盖
            items.sort(key=lambda x: (x["lowZ"], x["order"]))
            groups.append(items)
        fam_groups[kind] = groups
        print("  %-7s %d 组 / %d 件" % (kind, len(groups), sum(len(g) for g in groups)))

    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)

    # ── 保持逻辑 cell 顺序；snow 紧凑装箱，river/desert 暂保留旧页位置 ──
    atlas_info = {}
    for kind, groups in fam_groups.items():
        fam_tex = sorted({it["tex"] for g in groups for it in g} | {tex for root in dynamic[kind].values() for tex in textures(root)})
        imgs = []
        for tex in fam_tex:
            im = Image.open(sprite_png(tex, sprites)).convert("RGBA")
            native = [im.width, im.height]
            tw = max(1, round(im.width * TOP_DOWNSCALE))
            th = max(1, round(im.height * TOP_DOWNSCALE))
            imgs.append((th, tw, tex, im.resize((tw, th), Image.LANCZOS), native))
        imgs.sort(key=lambda x: (-x[0], -x[1]))
        atlas, layout, aliases = build_atlas(kind + "-top", [(tex, im, native) for _, _, tex, im, native in imgs],
                                             legacy_size=(512, 512) if kind == "desert" else None, trim=kind != "desert")
        cells = [{"id": i, "textureId": aliases[tex], "source": tex}
                 for i, (_, _, tex, _, _) in enumerate(imgs)]
        atlas.save(os.path.join(d, "%s-top-atlas.png" % kind))
        cell_of = {c["source"]: c["id"] for c in cells}
        fill = sum(t["rect"][2] * t["rect"][3] for t in layout["textures"].values()) / (atlas.width * atlas.height)
        atlas_info[kind] = {**layout, "downscale": TOP_DOWNSCALE, "fill": round(fill, 4), "cells": cells,
                            "sha256": hashlib.sha256(
                                open(os.path.join(d, "%s-top-atlas.png" % kind), "rb").read()).hexdigest()}
        used[kind] = cell_of
        print("  %-7s top 图集 %d 种 / %s（填充 %.0f%%）" % (kind, len(cells), layout["size"], fill * 100))
    write_types(d)

    from pathlib import Path
    scenes = {kind: {index: compile_node(root, used[kind]) for index, root in entries.items()} for kind, entries in dynamic.items()}
    # ── 每族一份摆放库 ──────────────────────────────────────────
    summary = {}
    for kind, groups in fam_groups.items():
        parts = [struct.pack(">H", len(groups))]
        for g in groups:
            parts.append(struct.pack(">H", len(g)))
        cell_of = used[kind]
        for g in groups:
            for it in g:
                parts.append(pack_visual(it, cell_of[it["tex"]]))
                parts.append(struct.pack(">f", float(it["lowZ"])))
        blob = b"".join(parts)
        open(os.path.join(d, "%s-tops.bin" % kind), "wb").write(blob)
        summary[kind] = {"groups": len(groups), "sprites": sum(len(g) for g in groups),
                         "bytes": len(blob), "sha256": hashlib.sha256(blob).hexdigest()}

    info = {"schemaVersion": 3, "mapId": m, "atlases": atlas_info, "recordBytes": 60,
            "layout": "大端：u16 组数；组数×u16 每组件数；然后所有件按组序、组内按 low_z 升序："
                      "{u16 图集格, f32 x, f32 y, f32 sx, f32 sy, f32 angle, 2f size, 2f pivot, 2f skew, 2B mirror, 4B color, 4B addColor, f32 lowZ}",
            "families": summary,
            "note": "贴图路径已归一化：剥掉 _output_atlas_scene/atlas_mutil_assets 前缀与 @@材质名后缀；"
                    "图集按 %.2g× 缩存，nativeSize 记原图像素，显示尺寸和锚点独立取 prefab 字段" % TOP_DOWNSCALE}
    json.dump(info, open(os.path.join(d, "top-atlas.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    ts = '''/**
 * mapOriginal `_top_group` **手摆细节**（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 原版 `_polygon_group` 铺底色多边形、配对的 `_top_group` 是若干个 `sprite_2d`
 *   （MAPORIGINAL-2D §1.6）：底是「面」、top 是「手摆的点缀」（岸石 / 草丛 / 雪堆 / 沙丘纹）。
 * ★ **每族一张图集**：river %d 件 / desert %d 件 / snow %d 件，合计 **%d 件**。
 *   三族合并放不进 4096²（river 一族的贴图总面积就有 1,546 万 px²），而每族本来各有一个材质。
 * ⚠ 图集按 **%.2g×** 缩存，`nativeSize` 记**原版像素**（贴图采样依据，与山族件同惯例）：
 *   本仓世界尺度 = 32/150 = 0.213 ⇒ 900 px 的件在 LOD0 只占 192 世界像素，
 *   存 %d px 仍有约 1.9× 过采样。⛔ 别按原生像素装，那要 59 MB 显存。
 * ⚠ 组内次序按 **`low_z` 升序**（同值按子序）—— 原版靠它定同组内谁压谁，⛔ 别按子节点原序。
 */

import type { MapoTextureLayouts } from "./atlas-layout.types";

export interface IMapoTopCell {
    readonly id: number;
    readonly textureId: string;
}

export interface IMapoTopAtlas {
    readonly kind: string;
    readonly size: readonly [number, number];
    /** 该族的组数（⚠ 必须与该族几何库条数相等）与件数。 */
    readonly groups: number;
    readonly sprites: number;
    readonly cells: readonly IMapoTopCell[];
    readonly textures: MapoTextureLayouts;
}

/** 单件记录长度（u16 图集格 + 6 × f32）。 */
export const MAPO_TOP_RECORD_BYTES = 60;
export const MAPO_TOP_DOWNSCALE = %s;
export const MAPO_TOP_KINDS: readonly string[] = ["river", "desert", "snow"];
export interface IMapoTopConfig {
    readonly schemaVersion: 1;
    readonly mapId: string;
    readonly kind: "tops";
    readonly atlases: readonly IMapoTopAtlas[];
    readonly scenes: Readonly<Record<string, Readonly<Record<number, import("./prefabs.types").IMapoPrefabNode>>>>;
}
''' % (m, summary["river"]["sprites"], summary["desert"]["sprites"], summary["snow"]["sprites"],
       sum(v["sprites"] for v in summary.values()), TOP_DOWNSCALE, round(900 * TOP_DOWNSCALE),
       TOP_DOWNSCALE)
    config = {"schemaVersion": 1, "mapId": m, "kind": "tops", "scenes": scenes,
              "atlases": [{"kind": k, "size": atlas_info[k]["size"],
                           "groups": summary[k]["groups"], "sprites": summary[k]["sprites"],
                           "textures": runtime_textures(atlas_info[k]),
                           "cells": [{"id": c["id"], "textureId": c["textureId"]} for c in atlas_info[k]["cells"]]}
                          for k, _ in FAMILIES]}
    Path(d, "tops-config.json").write_text(json.dumps(config, ensure_ascii=False, separators=(',', ':')))
    Path(d, "top-scenes.data.ts").unlink(missing_ok=True)
    open(os.path.join(d, "tops.data.ts"), "w", encoding="utf-8").write(ts)

    print("  合计 %d 件 / %d 种贴图"
          % (sum(v["sprites"] for v in summary.values()),
             sum(len(v["cells"]) for v in atlas_info.values())))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
