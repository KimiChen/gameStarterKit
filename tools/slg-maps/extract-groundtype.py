#!/usr/bin/env python3
"""MapRootEntityLite 逐格 GroundType 直读 → terrain.json（替代渲染图颜色反分类）。

用法：extract-groundtype.py <mapId> [--compare]
数据源：zjcs-1.2.6 yoo-assets/map-assets/Assets/Config/EC/MapRootEntityLite/<classId>.g.bytes
  结构：root(8 字段) + 11B 自定义 framing + array16(H)×array16(W) 逐格 [area, groundType] + AreaInfos + maxstep。
  坐标：lite 格 = mapinfowrap 实体格（零偏移）；lite→渲染世界格偏移 = config entityToRender；y 不翻转。
palette 六类映射：None→0 草 / Tree→1 林 / Block+Water→2 水 / Hill→3 岩 / Shallow→4 沙 / Wall+HyalineBlock→5 土。
--compare：打印与现入库（反分类版）的六类面积分布对照，不落盘。
"""
import argparse
import json
import sys
from pathlib import Path

from msgpack.fallback import Unpacker

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, load_map_grid, map_config

GT_TO_PALETTE = {0: 0, 4: 1, 2: 2, 3: 2, 5: 3, 6: 4, 1: 5, 8: 5}


def decompose(cells: list, cols: int, rows: int) -> list:
    """贪心最大矩形分解（逐格认领：先右扩再下扩，面积最大化抗海岸线噪声）。与 classify-terrain 同款。"""
    claimed = [[False] * cols for _ in range(rows)]
    rects = []
    for gy in range(rows):
        for gx in range(cols):
            if claimed[gy][gx]:
                continue
            t = cells[gy][gx]
            x1 = gx
            while x1 < cols and not claimed[gy][x1] and cells[gy][x1] == t:
                x1 += 1
            y1 = gy + 1
            while y1 < rows and all(not claimed[y1][x] and cells[y1][x] == t for x in range(gx, x1)):
                y1 += 1
            for yy in range(gy, y1):
                for xx in range(gx, x1):
                    claimed[yy][xx] = True
            rects.append((gx, gy, x1, y1, t))
    return rects


def smooth(grid: list, cols: int, rows: int) -> list:
    """3×3 众数平滑（单格噪点并入多数派）；水域保守（≥7 邻居才翻转），保窄水道与小湖。"""
    out = [row[:] for row in grid]
    for y in range(rows):
        for x in range(cols):
            counts = {}
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < cols and 0 <= yy < rows:
                        v = grid[yy][xx]
                        counts[v] = counts.get(v, 0) + 1
            top, n = max(counts.items(), key=lambda kv: kv[1])
            cur = grid[y][x]
            if cur == 2:
                out[y][x] = top if n >= 7 and top != 2 else 2
            else:
                out[y][x] = 2 if counts.get(2, 0) >= 7 else top
    return out



def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--compare", action="store_true")
    args = ap.parse_args()
    cfg = load_config()
    mc = map_config(cfg, args.map_id)
    grid, areas, maxstep = load_map_grid(cfg, mc["classId"])
    gh, gw = len(grid), len(grid[0])
    print(f"{args.map_id}: lite {gw}×{gh} 格，区域 {len(areas)}，maxFindPathStep {maxstep}")

    win = mc["render"]["window"]
    scale = mc["scale"]
    e2r = mc["entityToRender"]
    width, height = mc["worldSize"]
    margin_x = (width - win["cols"] * scale) // 2
    margin_y = (height - win["rows"] * scale) // 2

    # lite 格 (lx,ly) → 渲染世界格 (lx+e2r) → 渲染窗格 (-win.x0/-win.y0 偏移) → 本 kit 世界格 ×scale + margin
    # 世界格矩形：x = (lx + e2r[0] - win.x0) * scale + margin_x；y 同向不翻转（lite y=0 为南=世界 y 小）
    def cell_rect(lx, ly):
        return ((lx + e2r[0] - win["x0"]) * scale + margin_x,
                (ly + e2r[1] - win["y0"]) * scale + margin_y)

    cells = [[GT_TO_PALETTE.get(grid[ly][lx][1], 0) for lx in range(gw)] for ly in range(gh)]
    cells = smooth(cells, gw, gh)
    rects = decompose(cells, gw, gh)
    print("raw rects (smoothed):", len(rects))

    regions = [{"x": 0, "y": 0, "width": width, "height": height, "terrain": 2}]
    skipped = 0
    for x0, y0, x1, y1, t in rects:
        wx, wy = cell_rect(x0, y0)
        wx1, wy1 = cell_rect(x1, y1)
        # 图外（Block 已映射为水；lite 边界外由全图水兜底）
        if wx1 <= 0 or wy1 <= 0 or wx >= width or wy >= height:
            skipped += 1
            continue
        regions.append({"x": max(0, wx), "y": max(0, wy),
                        "width": min(wx1, width) - max(0, wx), "height": min(wy1, height) - max(0, wy),
                        "terrain": t})
    if skipped:
        print(f"  图外裁掉 {skipped} 条")

    # 六类面积分布（世界格²）
    dist = [0] * 6
    for r in regions[1:]:
        dist[r["terrain"]] += r["width"] * r["height"]
    dist[2] += width * height - sum(dist)  # 全图水兜底减已被覆盖
    names = ["grass", "forest", "water", "rock", "sand", "dirt"]
    print("  分布:", {names[i]: dist[i] for i in range(6) if dist[i]})

    if args.compare:
        old_path = Path(__file__).resolve().parent.parent.parent / "apps" / "kits" / "slg" / "data" / "maps" / args.map_id / "terrain.json"
        old = json.loads(old_path.read_text())
        old_dist = [0] * 6
        for r in old["regions"][1:]:
            old_dist[r["terrain"]] += r["width"] * r["height"]
        old_dist[2] += old["width"] * old["height"] - sum(old_dist)
        print("  反分类:", {names[i]: old_dist[i] for i in range(6) if old_dist[i]})
        print("  矩形数: 反分类", len(old["regions"]), "→ 直读", len(regions))
        return

    island_rect = [margin_x - 6, margin_y - 6, margin_x + win["cols"] * scale - 6, margin_y + win["rows"] * scale - 6]
    terrain = {
        "id": mc["id"], "name": mc["name"], "width": width, "height": height,
        "palette": mc["palette"],
        "islandRect": {"minX": island_rect[0], "minY": island_rect[1], "maxX": island_rect[2], "maxY": island_rect[3]},
        "regions": regions,
    }
    text = json.dumps(terrain, ensure_ascii=False, indent=2) + "\n"
    out_path = Path(__file__).resolve().parent / "out" / args.map_id / "terrain.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    print("regions:", len(regions), "→", out_path)


if __name__ == "__main__":
    main()
