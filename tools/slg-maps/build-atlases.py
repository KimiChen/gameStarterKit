#!/usr/bin/env python3
"""装饰切片图集 + 地表图集（每张图集 3 列×2 行×512² = 1536×1024，格序 = palette/kind 约定序）。

用法：build-atlases.py <mapId>
- 装饰：config atlas = {kind: {src, box}}；src 相对 zjcs yoo-assets/map-assets/Assets/。
- 地表：六类语义固定 [grass, forest, water, rock, sand, dirt]（= palette id 0-5）。
  config terrainTiles 可指定真贴图 {src, box?} 或 {"mulOf": "grass", "mul": [r,g,b]} 乘色；缺省程序化。
输出 out/<mapId>/decoration-atlas.png、terrain-atlas.png、atlas.meta.json（kind 顺序，供运行时映射）。
"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, zjcs

CELL = 512
TERRAIN_ORDER = ["grass", "forest", "water", "rock", "sand", "dirt"]
# 程序化兜底参数（森之国验收值）：基色、振幅、种子、散斑
PROC_TILES = {
    "grass":  ((108, 148,  88), 22, 21, ( 78, 118,  62)),
    "forest": (( 62, 108,  66), 26, 31, ( 36,  82,  44)),
    "water":  (( 66, 143, 163), 18, 41, (158, 196, 220)),
    "rock":   (( 96,  92,  88), 26, 51, ( 64,  60,  58)),
    "sand":   ((196, 178, 128), 16, 61, (226, 208, 152)),
    "dirt":   ((136, 106,  72), 20, 71, (102,  78,  52)),
}


def crop_to_cell(src: Path, box) -> Image.Image:
    img = Image.open(src).convert("RGBA")
    piece = img.crop(tuple(box)) if box else img.copy()
    scale = min(CELL * 0.84 / piece.width, CELL * 0.84 / piece.height)
    piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.paste(piece, ((CELL - piece.width) // 2, (CELL - piece.height) // 2), piece)
    return cell


def value_noise(size: int, freq: int, seed: int) -> list:
    r = random.Random(seed)
    grid = [[r.random() for _ in range(freq)] for _ in range(freq)]
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            fx, fy = x / size * freq, y / size * freq
            x0, y0 = int(fx) % freq, int(fy) % freq
            x1, y1 = (x0 + 1) % freq, (y0 + 1) % freq
            tx, ty = fx % 1, fy % 1
            tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            v = (grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx) * (1 - ty) + (grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx) * ty
            row.append(v)
        out.append(row)
    return out


def layered_noise(size: int, seed: int) -> list:
    a = value_noise(size, 4, seed)
    b = value_noise(size, 16, seed + 1)
    c = value_noise(size, 64, seed + 2)
    return [[a[y][x] * 0.55 + b[y][x] * 0.3 + c[y][x] * 0.15 for x in range(size)] for y in range(size)]


def make_tile(base, vary, seed, speckle=None) -> Image.Image:
    n = layered_noise(CELL, seed)
    img = Image.new("RGBA", (CELL, CELL))
    px = img.load()
    for y in range(CELL):
        for x in range(CELL):
            d = (n[y][x] - 0.5) * 2 * vary
            px[x, y] = (max(0, min(255, round(base[0] + d))),
                        max(0, min(255, round(base[1] + d))),
                        max(0, min(255, round(base[2] + d))), 255)
    if speckle:
        draw = ImageDraw.Draw(img)
        r = random.Random(seed + 7)
        for _ in range(CELL * 2):
            x, y, rad = r.randrange(CELL), r.randrange(CELL), r.randrange(2, 6)
            draw.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(*speckle, 26))
    return img.filter(ImageFilter.GaussianBlur(0.6))


def main() -> None:
    map_id = sys.argv[1]
    cfg = load_config()
    mc = map_config(cfg, map_id)
    assets = zjcs(cfg, "yoo-assets", "map-assets", "Assets")
    out_dir = Path(__file__).resolve().parent / "out" / map_id
    out_dir.mkdir(parents=True, exist_ok=True)

    atlas_cfg = mc.get("atlas")
    if not atlas_cfg:
        raise SystemExit(f"{map_id}: config 缺 atlas 表（装饰切片策展）")
    kinds = list(atlas_cfg.keys())
    if len(kinds) > 6:
        raise SystemExit(f"{map_id}: 装饰种类 {len(kinds)} 超 6 格上限")
    atlas = Image.new("RGBA", (CELL * 3, CELL * 2), (0, 0, 0, 0))
    for index, kind in enumerate(kinds):
        spec = atlas_cfg[kind]
        atlas.paste(crop_to_cell(assets / spec["src"], spec.get("box")), (index % 3 * CELL, index // 3 * CELL))
    atlas.save(out_dir / "decoration-atlas.png")
    print("decoration-atlas.png:", atlas.size, kinds)

    tiles_cfg = mc.get("terrainTiles") or {}
    cache = {}
    ground_img = None  # sample 分支懒载纯地表渲染图

    def terrain_tile(name: str) -> Image.Image:
        nonlocal ground_img
        spec = tiles_cfg.get(name)
        if spec and "sample" in spec:
            # 从本管线纯地表渲染图采样：窗格坐标为中心裁 12×12 格（渲染同源，色调必配）
            if ground_img is None:
                from lib.zjcs import resolve_ground_image
                ground_img = Image.open(resolve_ground_image(cfg, mc)).convert("RGBA")
            win = mc["render"]["window"]
            px = win.get("pxPerCell") or (ground_img.size[0] / win["cols"])
            gx, gy = spec["sample"]
            # config sample = 窗格列号（x 自左、y 自顶行号，与渲染图像素同向）
            cx, cy = gx * px, gy * px
            half = 6 * px
            piece = ground_img.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
            return piece.resize((CELL, CELL), Image.LANCZOS)
        if spec and "src" in spec:
            src = assets / spec["src"]
            img = Image.open(src).convert("RGBA")
            if spec.get("box"):
                img = img.crop(tuple(spec["box"]))
            return img.resize((CELL, CELL), Image.LANCZOS)
        if spec and "mulOf" in spec:
            img = cache[spec["mulOf"]]
            mul = spec["mul"]
            r, g, b, a = img.split()
            r = r.point(lambda v: v * mul[0]); g = g.point(lambda v: v * mul[1]); b = b.point(lambda v: v * mul[2])
            return Image.merge("RGBA", (r, g, b, a))
        base, vary, seed, speckle = PROC_TILES[name]
        return make_tile(base, vary, seed + mc.get("seedSalt", 0), speckle)

    ground = Image.new("RGBA", (CELL * 3, CELL * 2), (0, 0, 0, 0))
    for index, name in enumerate(TERRAIN_ORDER):
        tile = terrain_tile(name)
        cache[name] = tile
        ground.paste(tile, (index % 3 * CELL, index // 3 * CELL))
    ground.save(out_dir / "terrain-atlas.png")
    real = [n for n in TERRAIN_ORDER if any(k in (tiles_cfg.get(n) or {}) for k in ("src", "mulOf", "sample"))]
    print("terrain-atlas.png:", ground.size, TERRAIN_ORDER, "| real:", real)

    import json
    (out_dir / "atlas.meta.json").write_text(
        json.dumps({"decorationKinds": kinds, "terrainOrder": TERRAIN_ORDER}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")


if __name__ == "__main__":
    main()
