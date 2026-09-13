#!/usr/bin/env python3
"""用 tiles.json + tileset 图集在 **kit 世界格系** 重绘全图（与客户端 buildSlgTilemapMeshes 同一套
锚点/尺寸/ pivot 数学），并校验 Ground 层对陆地的覆盖率。

用法：verify-redraw.py <mapId> [输出.png]
退出码非 0 = 内陆覆盖率跌破基线（COVERAGE_FLOOR）0.5pp 以上——回归闸，防管线改动把地表挖空。
注：海岸过渡带与裂谷/云台等地貌在原版本来就不铺 Ground（由 edge 瓦片+水面/崖件承担），
基线按当前忠实提取的实测值钉死，只允许上浮不允许跌破。
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config

GRID = 48  # SLG_GRID_PIXELS
# 内陆覆盖率基线（2026-09-13 实测钉死）；跌破 0.5pp 即红。
COVERAGE_FLOOR = {"senzhiguo": 0.993, "shanzhiguo": 0.979, "zezhiguo": 0.990, "yuzhiguo": 0.961, "jingbeidao": 0.998}
COVERAGE_TOLERANCE = 0.005


def main() -> None:
    map_id = sys.argv[1]
    out_path = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/redraw-{map_id}-world.png"
    cfg = load_config()
    mc = map_config(cfg, map_id)
    here = Path(__file__).resolve().parent

    data = json.loads((here / "out" / map_id / "tiles.json").read_text())
    terrain = json.loads((here / "out" / map_id / "terrain.json").read_text())
    pages = {i: Image.open(here / "out" / map_id / name) for i, name in enumerate(data["atlas"])}
    cols, cell, scale = data["atlasCols"], data["cellPx"], data["scale"]
    width, height = terrain["width"], terrain["height"]
    sea_color = tuple(mc.get("seaColor") or [66, 143, 163])

    # 海 palette id = 与 seaColor 最近者（按图取色，与 classify-terrain 同帧）
    sea_id = min(terrain["palette"],
                 key=lambda p: sum((a - b) ** 2 for a, b in zip(p["color"], sea_color)))["id"]
    # 陆地格集合（regions 矩形展开，去重）
    land = set()
    for r in terrain["regions"]:
        if r["terrain"] == sea_id:
            continue
        for ry in range(r["y"], r["y"] + r["height"]):
            for rx in range(r["x"], r["x"] + r["width"]):
                land.add((rx, ry))

    # 客户端同数学：锚点 = 格 + m_TileAnchor×scale（Unity 语义），w/ppu×(GRID×scale)，pivot 自底向底
    grid = GRID * scale
    covered = set()
    quads = []  # (seq, x_px_left, y_px_bottom, w_px, h_px, tile_idx)
    for layer in data["layers"]:
        anchor_dx = layer.get("ax", 0) * scale
        anchor_dy = layer.get("ay", 0) * scale
        for wx, wy, idx in layer["cells"]:
            meta = data["tiles"][idx]
            w_px = meta["w"] / meta["ppu"] * grid
            h_px = meta["h"] / meta["ppu"] * grid
            left = (wx + anchor_dx) * GRID - w_px * meta["pivotX"]
            bottom = (wy + anchor_dy) * GRID - h_px * meta["pivotY"]
            quads.append((layer["seq"], left, bottom, w_px, h_px, idx))
            if layer["name"].lower().startswith(("ground", "highland")):
                # 覆盖足迹：footprint 覆盖的kit格（round 到格界）
                gx0 = round(left / GRID)
                gy0 = round(bottom / GRID)
                gx1 = round((left + w_px) / GRID)
                gy1 = round((bottom + h_px) / GRID)
                for gy in range(max(0, gy0), min(height, gy1)):
                    for gx in range(max(0, gx0), min(width, gx1)):
                        covered.add((gx, gy))
    quads.sort(key=lambda q: q[0])

    hit = sum(1 for c in land if c in covered)
    coverage = hit / max(1, len(land))
    # 海岸过渡带豁免：陆格 scale 邻域内含海格者属岸线混合区（原版即由 edge 瓦片+水面承担），
    # 覆盖闸只量内陆（侵蚀一圈），避免把原版的岸线表现误报成洞。
    fringe = set()
    for (x, y) in land:
        for dy in range(-scale, scale + 1):
            for dx in range(-scale, scale + 1):
                if (x + dx, y + dy) not in land:
                    fringe.add((x, y)); break
            if (x, y) in fringe: break
    interior = land - fringe
    interior_hit = sum(1 for c in interior if c in covered)
    interior_coverage = interior_hit / max(1, len(interior))

    # 缩略重绘（k px/世界格，目检用；海色底 = 客户端 sea 层视觉近似）
    k = max(1, round(2400 / width))
    W, H = width * k, height * k
    canvas = Image.new("RGB", (W, H), sea_color)
    for seq, left, bottom, w_px, h_px, idx in quads:
        meta = data["tiles"][idx]
        page = pages[meta["atlas"]]
        c = meta["cell"]
        # 内容子矩形（等比放大装满后非正方瓦片两侧留白，只采内容）
        cx0 = (c % cols) * cell + round(meta.get("u0", 0) * cell)
        cy0 = (c // cols) * cell + round(meta.get("v0", 0) * cell)
        cx1 = (c % cols) * cell + round(meta.get("u1", 1) * cell)
        cy1 = (c // cols) * cell + round(meta.get("v1", 1) * cell)
        tile = page.crop((cx0, cy0, cx1, cy1))
        tw, th = max(1, round(w_px / GRID * k)), max(1, round(h_px / GRID * k))
        tile = tile.resize((tw, th), Image.LANCZOS)
        x = round(left / GRID * k)
        y = H - round((bottom + h_px) / GRID * k)  # 世界 y 上 → 图 y 下
        canvas.paste(tile, (x, y), tile)
    canvas.save(out_path)
    floor = COVERAGE_FLOOR.get(map_id, 1.0)
    print(f"{map_id}: 陆地格 {len(land)}，Ground 覆盖 {hit}（{coverage:.1%}），"
          f"内陆覆盖 {interior_hit}/{len(interior)}（{interior_coverage:.1%}，基线 {floor:.1%}），重绘 → {out_path}")
    if interior_coverage < floor - COVERAGE_TOLERANCE:
        print(f"⛔ 内陆覆盖率 {interior_coverage:.1%} 跌破基线 {floor:.1%}——客户端近档陆地会有空洞")
        sys.exit(1)


if __name__ == "__main__":
    main()
