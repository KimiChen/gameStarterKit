#!/usr/bin/env python3
"""按原版实现提取 Tilemap 数据集：Ground 层 + TileChunkData 全层 → tiles.json + tileset 图集。

原游戏的实现：地表/装饰 = 逐格引用贴图（同纹理全图复用），不存渲染大图。本脚本把
TileChunkData（chunks bundle）与 bare Tilemap（Ground 层）的「格→瓦片」稀疏表与
瓦片 sprite 原图提取出来，去重打包成 tileset 图集（256²/格），与 tiles.json 引用表。

用法：extract-tileset.py <mapId>
产出：out/<mapId>/tiles.json、tiles-index.json、tileset-<页>.png（页 = 256² 图集）
坐标：瓦片格（渲染世界格）→ 本 kit 世界格（entityToRender + scale + margin，与 terrain/layout 同帧）。
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, zjcs

sys.path.insert(0, "/Volumes/KimData/apksource/sourceVersion/zjcs-1.2.6/scripts")
import render_map_full as R  # noqa: E402

CELL = 256           # tileset 图集格边长（px）
ATLAS_COLS = 16      # 每页 16×16=256 格（4096² 单页装全部瓦片，客户端单 mesh 单材质）
SKIP_LAYERS = {"Ground_WaterMask", "Ground_Manual"}  # 水遮罩（由 sea-tile 承担）/ 纯白遮罩


def main() -> None:
    map_id = sys.argv[1]
    cfg = load_config()
    mc = map_config(cfg, map_id)
    mid = mc["classId"]
    have = json.load(open(R.MAP_BUNDLES))
    dev = R.parse_manifest(R.DEV_MAN)
    tag = f"mapground_{mid}"
    cand2 = [n for n in (info["name"] for info in have.values())
             if n.endswith("_bare.bundle") and n.startswith(f"defaultpackage_assets_partition_{tag}")]
    bare_f = None
    for c in [f"{tag}_bare.bundle"] + cand2:
        bare_f = R.bundle_files(c, have, dev)
        if bare_f:
            break
    if bare_f is None:
        raise SystemExit(f"{tag}: 无 bare bundle")
    env = R.Env(bare_f)
    chunks_env = None
    cfiles = []
    for suffix in ("_chunks.bundle", "_chunks_n.bundle"):
        f = R.bundle_files(f"{tag}{suffix}", have, dev)
        if f:
            cfiles += f
    chunks = []
    if cfiles:
        chunks_env = R.Env(cfiles)
        chunks = R.collect_tile_chunks(chunks_env)

    win = mc["render"]["window"]
    scale = mc["scale"]
    e2r = mc["entityToRender"]
    width, height = mc["worldSize"]
    margin_x = (width - win["cols"] * scale) // 2
    margin_y = (height - win["rows"] * scale) // 2

    def world_of(gx, gy):
        """渲染世界格（Tilemap/TileChunkData 坐标系）→ 本 kit 世界格。
        与 terrain 同帧：渲染窗格索引 × scale + margin（瓦片坐标已是渲染系，不走 entityToRender）。"""
        return round((gx - win["x0"]) * scale + margin_x), round((gy - win["y0"]) * scale + margin_y)

    # ── sprite 去重注册：key = (宿主文件, sprite PPtr) ─────────────────────
    tiles_meta = []          # [{atlas, cell, w, h, ppu, pivotX, pivotY}]
    tile_index = {}          # key -> tiles_meta 下标

    def register_sprite(host_file, file_id, path_id, src_env):
        key = (host_file, path_id)
        if key in tile_index:
            return tile_index[key]
        img, ppu, pivot = src_env.sprite_image(host_file, file_id, path_id)
        if img is None:
            return -1
        idx = len(tiles_meta)
        tile_index[key] = idx
        tiles_meta.append({"img": img, "w": img.size[0], "h": img.size[1], "ppu": ppu,
                           "pivotX": pivot[0], "pivotY": pivot[1]})
        return idx

    layers = []  # [{name, seq, ax, ay, cells: [[wx, wy, tileIdx], ...]}]

    # 全部 bare Tilemap 的 m_TileAnchor（宿主 anchor：Unity 把 sprite pivot 钉在 (格+anchor) 处；
    # TileChunkData 运行时灌进同名宿主 Tilemap，anchor 随宿主——PartitionLoader.cs:605）。
    anchor_by_name = {}
    for _fname, _objs in env.by_file.items():
        for _pid, _o in _objs.items():
            if _o.type.name != "Tilemap":
                continue
            _t = _o.read_typetree()
            _go = env.gos.get((_fname, _t["m_GameObject"]["m_PathID"]), {})
            _n = _go.get("m_Name", "")
            _a = _t.get("m_TileAnchor") or {}
            anchor_by_name.setdefault(_n, (float(_a.get("x", 0.0)), float(_a.get("y", 0.0))))

    # ── Ground 层（bare Tilemap；含 Under/Above）─────────────────────────
    for name, fname, t in R.collect_tilemaps(env):
        if name in SKIP_LAYERS:
            continue
        seq = {"Ground": 0, "Ground_Under": 1, "Ground_Above": 90}.get(name)
        if seq is None:
            continue
        ax, ay = anchor_by_name.get(name, (0.0, 0.0))
        sprite_arr = t["m_TileSpriteArray"]
        cells = []
        for tile in t["m_Tiles"]:
            pos, td = tile[0], tile[1]
            si = td.get("m_TileSpriteIndex", 0)
            if si >= len(sprite_arr):
                continue
            pp = sprite_arr[si]["m_Data"]
            idx = register_sprite(fname, pp.get("m_FileID", 0), pp.get("m_PathID", 0), env)
            if idx < 0:
                continue
            wx, wy = world_of(pos["x"], pos["y"])
            cells.append([wx, wy, idx])
        # 同名层合并（bare 可能有多个同名 Tilemap；anchor 不一致时不合并，防错位）
        target = next((l for l in layers if l["name"] == name and l["ax"] == ax and l["ay"] == ay), None)
        if target is None:
            layers.append({"name": name, "seq": seq, "ax": ax, "ay": ay, "cells": cells})
        else:
            target["cells"] += cells
        print(f"  层 {name}: +{len(cells)} 格 (anchor {ax},{ay})")

    # ── TileChunkData 全层（格→TileIndex；Tiles[] → sprite PPtr）─────────
    chunk_sprite_cache = {}
    for d in chunks:
        for seq, lname, pairs in d["tms"]:
            if lname in SKIP_LAYERS:
                continue
            # 层 seq：沿用 TILE_LAYER_SEQ（Rug 0/1、Highland 2、Shadow 3、UnderObject 4、Object 5），+10 避开 Ground 序
            lay_seq = 10 + seq
            ax, ay = anchor_by_name.get(lname, (0.0, 0.0))
            target = next((l for l in layers if l["name"] == lname and l["ax"] == ax and l["ay"] == ay), None)
            if target is None:
                target = {"name": lname, "seq": lay_seq, "ax": ax, "ay": ay, "cells": []}
                layers.append(target)
            bx, by, _, bw, bh, _ = d["bnd"]
            for idx_cell, ti in pairs:
                if ti >= len(d["tiles"]):
                    continue
                key = (d["host"], ti)
                if key not in chunk_sprite_cache:
                    fid, tpid = d["tiles"][ti]
                    sp = None
                    tobj = chunks_env.resolve(d["host"], fid, tpid)
                    if tobj is not None:
                        try:
                            traw = tobj.get_raw_data()
                            tname, sfid, spid = R.tile_sprite_ptr(chunks_env, traw, 28)
                            hfile_hits = [fn for fn, objs in chunks_env.by_file.items() if tpid in objs]
                            sp = (hfile_hits[0] if hfile_hits else None, sfid, spid)
                        except Exception:
                            sp = None
                    chunk_sprite_cache[key] = sp
                sp = chunk_sprite_cache[key]
                if sp is None or sp[0] is None:
                    continue
                idx = register_sprite(sp[0], sp[1], sp[2], chunks_env)
                if idx < 0:
                    continue
                gx = bx + idx_cell % bw
                gy = by + idx_cell // bw
                wx, wy = world_of(gx, gy)
                target["cells"].append([wx, wy, idx])
    for l in layers:
        if l["seq"] >= 10:
            print(f"  层 {l['name']}: {len(l['cells'])} 格")

    # ── tileset 图集打包（256²/格，等比放大装满；内容子矩形随 meta 下发）────────────────────
    def to_cell(img):
        """等比放大到贴满图集格（至少一边顶格），居中摆放；返回 (格图, 内容子矩形 0..1)。"""
        s = min(CELL / img.size[0], CELL / img.size[1])
        piece = img.resize((max(1, round(img.size[0] * s)), max(1, round(img.size[1] * s))), Image.LANCZOS)
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        ox, oy = (CELL - piece.size[0]) // 2, (CELL - piece.size[1]) // 2
        cell.paste(piece, (ox, oy), piece)
        rect = (ox / CELL, oy / CELL, (ox + piece.size[0]) / CELL, (oy + piece.size[1]) / CELL)
        return cell, rect

    out_dir = Path(__file__).resolve().parent / "out" / map_id
    out_dir.mkdir(parents=True, exist_ok=True)
    pages = []
    tiles_out = []
    for idx, meta in enumerate(tiles_meta):
        page = idx // (ATLAS_COLS * ATLAS_COLS)
        slot = idx % (ATLAS_COLS * ATLAS_COLS)
        while len(pages) <= page:
            pages.append(Image.new("RGBA", (CELL * ATLAS_COLS, CELL * ATLAS_COLS), (0, 0, 0, 0)))
        cell_img, rect = to_cell(meta["img"])
        pages[page].paste(cell_img, (slot % ATLAS_COLS * CELL, slot // ATLAS_COLS * CELL))
        tiles_out.append({"atlas": page, "cell": slot, "w": meta["w"], "h": meta["h"],
                          "ppu": meta["ppu"], "pivotX": meta["pivotX"], "pivotY": meta["pivotY"],
                          "u0": round(rect[0], 4), "v0": round(rect[1], 4),
                          "u1": round(rect[2], 4), "v1": round(rect[3], 4)})
    atlas_files = []
    for i, page in enumerate(pages):
        name = f"tileset-{i}.png"
        page.save(out_dir / name)
        atlas_files.append(name)

    # 层按 seq 排序；格按 (y 降序, x 升序) 排序（与原版同层内绘制顺序一致）
    layers.sort(key=lambda l: l["seq"])
    for l in layers:
        l["cells"].sort(key=lambda c: (-c[1], c[0]))

    tiles_json = {"id": map_id, "tile": 16, "scale": scale, "atlasCols": ATLAS_COLS, "cellPx": CELL,
                  "atlas": atlas_files, "layers": layers, "tiles": tiles_out}
    (out_dir / "tiles.json").write_text(json.dumps(tiles_json, ensure_ascii=False, separators=(",", ":")),
                                        encoding="utf-8")
    (out_dir / "tiles-index.json").write_text(json.dumps(
        {"layers": [(l["name"], l["seq"], len(l["cells"])) for l in layers],
         "tiles": len(tiles_out), "pages": len(atlas_files)}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    total_cells = sum(len(l["cells"]) for l in layers)
    print(f"{map_id}: {len(layers)} 层 {total_cells} 格引用，{len(tiles_out)} 唯一瓦片 → {len(atlas_files)} 页 tileset")


if __name__ == "__main__":
    main()
