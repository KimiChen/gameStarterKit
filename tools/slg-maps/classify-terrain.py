#!/usr/bin/env python3
"""纯地表渲染图 → 逐格反分类 → 六类 → 平滑 → 贪心矩形分解 → terrain.json。

用法：classify-terrain.py <mapId> [--out 路径] [--preview 路径]
原理：渲染图逐格取中心 40% 区域均值 → 最近质心（config centroids，六类语义 草/林/水/岩/沙/土）。
坐标：渲染窗格 (gx,gy) → 本 kit 世界格 (worldOrigin + 格×scale)；窗外全是海（regions[0] 全图水）。
islandRect = worldOrigin ± 6（岛区矩形，远档烘图覆盖范围；森之国 legacy 值已验证吻合）。
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, resolve_ground_image

WATER = 2  # palette 中水面 id（六类语义固定第三位）


def classify_cells(img: Image.Image, cols: int, rows: int, centroids: list) -> list:
    pw, ph = img.size
    px_per_cell = pw / cols
    print(f"render {pw}x{ph}, {px_per_cell:.1f}px/格")
    cells = []
    for gy in range(rows):
        row = []
        for gx in range(cols):
            cx = (gx + 0.5) * px_per_cell
            cy = (gy + 0.5) * (ph / rows)
            half = px_per_cell * 0.2
            patch = img.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
            data = list(patch.getdata())
            n = len(data)
            mean = tuple(sum(c[i] for c in data) / n for i in range(3))
            best = min(range(len(centroids)), key=lambda k: sum((mean[i] - centroids[k][i]) ** 2 for i in range(3)))
            row.append(best)
        cells.append(row)
    return cells


def smooth(grid: list, cols: int, rows: int) -> list:
    """3×3 众数平滑（去单格噪点）；水域保守（≥7 邻居才翻转），保住窄水道与小湖。"""
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
            if cur == WATER:
                out[y][x] = top if n >= 7 and top != WATER else WATER
            else:
                out[y][x] = WATER if counts.get(WATER, 0) >= 7 else top
    return out


def decompose(cells: list, cols: int, rows: int) -> list:
    """贪心最大矩形分解（逐格认领：先右扩再下扩，面积最大化抗海岸线噪声）。"""
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--out", default=None)
    ap.add_argument("--preview", default=None)
    ap.add_argument("--max-rects", type=int, default=4095, help="分类矩形上限（契约 regions 上限 4096 减全图水 1 条）")
    args = ap.parse_args()
    cfg = load_config()
    mc = map_config(cfg, args.map_id)
    render = mc.get("render")
    if not render or not mc.get("centroids"):
        raise SystemExit(f"{args.map_id}: 先跑 render-ground.py 渲染纯地表并在 config 回填 render/centroids")
    win = render["window"]
    cols, rows = win["cols"], win["rows"]
    scale = mc["scale"]
    # 世界尺寸：config 显式给（森之国 legacy 1500²）；否则 = 渲染窗格×scale + 2×margin（海环）
    if mc.get("worldSize"):
        width, height = mc["worldSize"]
        ox, oy = render["worldOrigin"]
    else:
        margin = mc.get("margin")
        if margin is None:
            raise SystemExit(f"{args.map_id}: config 缺 margin")
        ox = oy = margin
        width, height = cols * scale + 2 * margin, rows * scale + 2 * margin
        print(f"派生世界尺寸 {width}×{height}（窗 {cols}×{rows}×{scale} + 海环 {margin}×2），回填 config worldSize")
        mc["worldSize"] = [width, height]
        render["worldOrigin"] = [ox, oy]
        CONFIG_TEXT = json.dumps(cfg, ensure_ascii=False, indent=2)
        from lib.zjcs import CONFIG_PATH
        CONFIG_PATH.write_text(CONFIG_TEXT + "\n", encoding="utf-8")

    img = Image.open(resolve_ground_image(cfg, mc)).convert("RGB")
    cells = smooth(classify_cells(img, cols, rows, mc["centroids"]), cols, rows)
    rects = decompose(cells, cols, rows)
    print("raw rects:", len(rects))

    rects.sort(key=lambda r: (r[3] - r[1]) * (r[2] - r[0]))
    dropped = 0
    while len(rects) > args.max_rects:
        rects.pop(0)  # 丢弃最小碎片（视觉噪声级）
        dropped += 1
    if dropped:
        print(f"⚠ 超上限丢弃最小碎片 {dropped} 条（必要时调 --max-rects 或降精度）")
    print("capped rects:", len(rects))

    regions = [{"x": 0, "y": 0, "width": width, "height": height, "terrain": WATER}]
    for x0, y0, x1, y1, t in rects:
        # y 翻转：渲染图顶=北=世界 y 大；格行 gy（自顶）→ 世界格 oy+(rows-y1)*scale。
        # 2026-09-12 修正：此前 oy+gy*scale 与 layout/烘图系南北镜像（鲸背岛装饰落水 43% 暴露）。
        regions.append({"x": ox + x0 * scale, "y": oy + (rows - y1) * scale,
                        "width": (x1 - x0) * scale, "height": (y1 - y0) * scale, "terrain": t})

    island_rect = [ox - 6, oy - 6, ox + cols * scale - 6, oy + rows * scale - 6]
    terrain = {
        "id": mc["id"],
        "name": mc["name"], "width": width, "height": height,
        "palette": mc["palette"] if mc.get("palette") else [
            {"id": i, "color": list(c)} for i, c in enumerate(mc["centroids"])],
        "islandRect": {"minX": island_rect[0], "minY": island_rect[1], "maxX": island_rect[2], "maxY": island_rect[3]},
        "regions": regions,
    }
    text = json.dumps(terrain, ensure_ascii=False, indent=2) + "\n"
    out_path = Path(args.out) if args.out else Path(__file__).resolve().parent / "out" / args.map_id / "terrain.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    print("regions:", len(regions), "| islandRect:", island_rect, "→", out_path)

    preview = Path(args.preview) if args.preview else out_path.parent / "terrain-classified.png"
    prev = Image.new("RGB", (cols * 4, rows * 4), (0, 0, 0))
    for gy in range(rows):
        for gx in range(cols):
            c = tuple(mc["centroids"][cells[gy][gx]])
            for dy in range(4):
                for dx in range(4):
                    prev.putpixel((gx * 4 + dx, gy * 4 + dy), c)
    prev.save(preview)
    print("preview:", preview)


if __name__ == "__main__":
    main()
