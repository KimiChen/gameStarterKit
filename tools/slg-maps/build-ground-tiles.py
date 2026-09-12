#!/usr/bin/env python3
"""ground.png → 世界格 64×64 切块贴图（近档真地表，替代 palette 图集平铺）。

用法：build-ground-tiles.py <mapId>
块 = 世界格 64×64（恰 4×4 chunk）；块图 1024² JPG（q88）；全水块（terrain 全 id 2）不产出。
输出：out/<mapId>/ground-tiles/<bx>-<by>.jpg + ground-tiles.json（块注册表）。

坐标：世界格 (x,y) → 渲染窗格 ((x-margin)/scale, rows-(y-margin)/scale)（y 翻转：图顶=北=世界 y 大）。
窗外（海环 margin 超出渲染图范围）填海色。
"""
import functools
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, resolve_ground_image

TILE = 32          # 块边长（世界格；= 2×2 chunk；1024²→32px/格，近档不糊）
IMG = 1024         # 块图边长（px）


@functools.lru_cache(maxsize=8)
def load_block_image(path: str):
    return Image.open(path).convert("RGB")


def load_render_blocks(blocks_dir: Path):
    """render-ground --hi-res 的高分块图索引：{size, grid: {(rx,ry): path}}；无则 None。"""
    files = sorted(blocks_dir.glob("*.png"))
    if not files:
        return None
    size = Image.open(files[0]).size[0]
    grid = {}
    for f in files:
        rx, ry = f.stem.split("-")
        grid[(int(rx), int(ry))] = str(f)
    return {"size": size, "grid": grid}


def main() -> None:
    map_id = sys.argv[1]
    cfg = load_config()
    mc = map_config(cfg, map_id)
    win = mc["render"]["window"]
    terrain = json.loads((Path(__file__).resolve().parent / "out" / map_id / "terrain.json").read_text())
    width, height = terrain["width"], terrain["height"]
    scale = mc["scale"]
    margin_x = (width - win["cols"] * scale) // 2
    margin_y = (height - win["rows"] * scale) // 2
    sea = tuple(mc.get("seaColor") or [66, 143, 163])
    # 图源：render-blocks（--hi-res 高分块图）优先；否则整图 ground.png
    blocks_dir = Path(__file__).resolve().parent / "out" / map_id / "render-blocks"
    rb = load_render_blocks(blocks_dir)
    ground = None
    if rb is None:
        ground = Image.open(resolve_ground_image(cfg, mc)).convert("RGB")
        px = win.get("pxPerCell") or (ground.size[0] / win["cols"])
    else:
        px = 168.0  # 高分块图固定原版地砖分辨率
        print(f"  高分源: render-blocks {len(rb['grid'])} 块 ×{rb['size']}²")

    regs = terrain["regions"]

    def terrain_at(x, y):
        t = regs[0]["terrain"]
        for r in regs[1:]:
            if r["x"] <= x < r["x"] + r["width"] and r["y"] <= y < r["y"] + r["height"]:
                t = r["terrain"]
        return t

    def has_land(bx, by):
        """陆地块判定：块内有非水格才产文件（全海块不产——海面由 sea-tile 平铺承担，零重复文件）。"""
        x0, y0 = bx * TILE, by * TILE
        for gy in range(y0, min(y0 + TILE, height), 4):
            for gx in range(x0, min(x0 + TILE, width), 4):
                if terrain_at(gx, gy) != 2:
                    return True
        return False

    def sea_ratio(img: Image.Image) -> float:
        """海色像素占比（64² 采样；>阈值即近纯海块——直读 terrain 与渲染局部错位时以产物为准）。"""
        px = list(img.resize((64, 64)).getdata())
        n = sum(1 for r, g, b in px if abs(r - sea[0]) + abs(g - sea[1]) + abs(b - sea[2]) < 60)
        return n / len(px)

    def crop_block(bx, by):
        """世界格块 → 渲染图源对应像素区（窗外填海色；高分模式从 render-blocks 拼切）。"""
        gx0 = (bx * TILE - margin_x) / scale
        gx1 = ((bx + 1) * TILE - margin_x) / scale
        gy_south = (by * TILE - margin_y) / scale
        gy_north = ((by + 1) * TILE - margin_y) / scale
        row0 = win["rows"] - gy_north
        row1 = win["rows"] - gy_south
        # 窗系像素（相对渲染窗原点 win.x0/win.y0）
        sx0, sx1 = (gx0) * px, (gx1) * px
        sy0, sy1 = row0 * px, row1 * px
        canvas = Image.new("RGB", (IMG, IMG), sea)
        if rb is None:
            cx0, cy0 = max(0, sx0), max(0, sy0)
            cx1, cy1 = min(ground.size[0], sx1), min(ground.size[1], sy1)
            if cx1 > cx0 and cy1 > cy0:
                piece = ground.crop((round(cx0), round(cy0), round(cx1), round(cy1)))
                dx0 = round((cx0 - sx0) / (sx1 - sx0) * IMG)
                dy0 = round((cy0 - sy0) / (sy1 - sy0) * IMG)
                dx1 = round((cx1 - sx0) / (sx1 - sx0) * IMG)
                dy1 = round((cy1 - sy0) / (sy1 - sy0) * IMG)
                canvas.paste(piece.resize((max(1, dx1 - dx0), max(1, dy1 - dy0)), Image.LANCZOS), (dx0, dy0))
            return canvas
        # 高分：逐 render-block 裁贴（块图 x 从图左数、y 从图底数；块图内容 = 窗格 [x0+rx*32, x0+(rx+1)*32)）
        B = rb["size"]
        H_full = win["rows"] * px

        def block_at(sx, sy):
            rx = int(sx // B)
            ry = int((H_full - sy) // B)  # y 从图底数
            return rx, ry

        rx0, _ = block_at(sx0, 0)
        rx1, _ = block_at(max(sx0, sx1 - 1), 0)
        _, ry0 = block_at(0, sy0)   # sy0 图顶 → ry 大
        _, ry1 = block_at(0, max(sy0, sy1 - 1))
        for ry in range(min(ry0, ry1), max(ry0, ry1) + 1):
            for rx in range(rx0, rx1 + 1):
                f = rb["grid"].get((rx, ry))
                if not f:
                    continue
                img = load_block_image(f)
                # 块图覆盖的窗系像素区：x [rx*B, rx*B+B)，y [H_full-(ry+1)*B, H_full-ry*B)
                bx0, bx1 = rx * B, rx * B + B
                by0, by1 = H_full - (ry + 1) * B, H_full - ry * B
                cx0, cy0 = max(sx0, bx0), max(sy0, by0)
                cx1, cy1 = min(sx1, bx1), min(sy1, by1)
                if cx1 <= cx0 or cy1 <= cy0:
                    continue
                piece = img.crop((round(cx0 - bx0), round(cy0 - by0), round(cx1 - bx0), round(cy1 - by0)))
                dx0 = round((cx0 - sx0) / (sx1 - sx0) * IMG)
                dy0 = round((cy0 - sy0) / (sy1 - sy0) * IMG)
                dx1 = round((cx1 - sx0) / (sx1 - sx0) * IMG)
                dy1 = round((cy1 - sy0) / (sy1 - sy0) * IMG)
                canvas.paste(piece.resize((max(1, dx1 - dx0), max(1, dy1 - dy0)), Image.LANCZOS), (dx0, dy0))
        return canvas

    out_dir = Path(__file__).resolve().parent / "out" / map_id / "ground-tiles"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("*.jpg"):
        old.unlink()
    blocks = []
    dropped_sea = 0
    for by in range((height + TILE - 1) // TILE):
        for bx in range((width + TILE - 1) // TILE):
            if not has_land(bx, by):
                continue  # 全海块不产文件：运行时 fallback 用 sea-tile 平铺（拒绝重复文件）
            tile = crop_block(bx, by)
            if sea_ratio(tile) > 0.85:
                dropped_sea += 1
                continue  # 近纯海块（直读 terrain 与渲染局部错位的伪陆块）——同样归 sea-tile
            tile.save(out_dir / f"{bx}-{by}.jpg", quality=88)
            blocks.append([bx, by])
    if dropped_sea:
        print(f"  近纯海块剔除 {dropped_sea}（海色占比 >85%）")
    # 远档 sea 层贴图：滑窗找「与海色最接近且方差最小」的 512² 纯海区（角部可能挨陆地）
    def sea_tile():
        if rb is not None:
            # 高分：从 render-blocks 找海色占比最高的块裁 512²
            best = None
            for f in rb["grid"].values():
                img = load_block_image(f)
                r = sea_ratio(img)
                if best is None or r > best[0]:
                    best = (r, f)
            return load_block_image(best[1]).crop((0, 0, 512, 512))
        best = None
        for y in range(0, ground.size[1] - 512, 256):
            for x in range(0, ground.size[0] - 512, 256):
                piece = ground.crop((x, y, x + 512, y + 512)).resize((64, 64))
                px = list(piece.getdata())
                n = len(px)
                mean = tuple(sum(c[i] for c in px) / n for i in range(3))
                var = sum(sum((c[i] - mean[i]) ** 2 for i in range(3)) for c in px) / n
                dist = sum((mean[i] - sea[i]) ** 2 for i in range(3))
                score = (dist, var)
                if best is None or score < best[0]:
                    best = (score, x, y)
        _, bx, by = best
        return ground.crop((bx, by, bx + 512, by + 512))
    sea_tile().save(Path(__file__).resolve().parent / "out" / map_id / "sea-tile.png")
    (Path(__file__).resolve().parent / "out" / map_id / "ground-tiles.json").write_text(
        json.dumps({"tile": TILE, "image": IMG, "blocks": blocks}, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{map_id}: {len(blocks)} 块（{width}×{height} 世界格，{TILE} 格/块）→ {out_dir}")


if __name__ == "__main__":
    main()
