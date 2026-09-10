#!/usr/bin/env python3
"""A1+A2 fallback：森之国摆件切片 + 程序化地表 → 两张 1536×1024 图集（3 列×2 行，512² 每格）。

摆件：从 zjcs-1.2.6 AppearanceAssets/Map 的多 sprite 部件图里人工策展子矩形（坐标为策展像素框）；
地表：PIL 程序化生成六类可平铺地块（草地/林地/水面/岩石/沙滩/裸土），棋盘格噪声 + 边缘混合。
输出：/tmp/slg-extract/out/decoration-atlas.png 与 terrain-atlas.png（人工目检后再入仓）。
"""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

MAP = "/Volumes/KimData/apksource/sourceVersion/zjcs-1.2.6/yoo-assets/map-assets/Assets/AppearanceAssets/Map"
OUT = "/tmp/slg-extract/out"
CELL = 512

# ── 摆件策展：(来源文件, 子矩形 x0,y0,x1,y1) ─────────────────────────────
CROPS = {
    "vine": ("map_mingYunShuTeng/map_mingYunShuTeng.png", (18, 235, 200, 700)),        # 命运树藤主藤
    "chest": ("map_baoXiang_01/map_baoXiang_01.png", (0, 126, 136, 184)),              # 宝箱第 3 帧
    "portal": ("map_dingDianChuanSongMen_E_1/map_dingDianChuanSongMen_E_1.png", (8, 60, 210, 630)),  # 定点传送门左扉
    "stele": ("map_fangJianBei_B_2/map_fangJianBei_B_2.png", (70, 262, 830, 788)),      # 房间碑祭坛全景
    "crystal": ("map_shuangYanShanMai_G/map_shuangYanShanMai_G.png", (640, 100, 900, 420)),  # 双眼山脉蓝晶簇
    "sword": ("map_guJianCheng_D_1/map_guJianCheng_D_1.png", (0, 0, 540, 420)),      # 青云观殿顶俯视
}

def crop_to_cell(src: str, box: tuple[int, int, int, int]) -> Image.Image:
    img = Image.open(f"{MAP}/{src}").convert("RGBA")
    piece = img.crop(box)
    # 等比缩放进 512 格（留 8% 边距）
    scale = min(CELL * 0.84 / piece.width, CELL * 0.84 / piece.height)
    piece = piece.resize((max(1, round(piece.width * scale)), max(1, round(piece.height * scale))), Image.LANCZOS)
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    cell.paste(piece, ((CELL - piece.width) // 2, (CELL - piece.height) // 2), piece)
    return cell

atlas = Image.new("RGBA", (CELL * 3, CELL * 2), (0, 0, 0, 0))
for index, (name, (src, box)) in enumerate(CROPS.items()):
    atlas.paste(crop_to_cell(src, box), (index % 3 * CELL, index // 3 * CELL))
atlas.save(f"{OUT}/decoration-atlas.png")
print("decoration-atlas.png:", atlas.size, list(CROPS.keys()))

# ── 程序化地表（可平铺：噪声用环形采样保证四边连续） ──────────────────────
rng = random.Random(11)

def value_noise(size: int, freq: int, seed: int) -> list[list[float]]:
    r = random.Random(seed)
    grid = [[r.random() for _ in range(freq)] for _ in range(freq)]
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            # 环形坐标 → 四边连续可平铺
            fx, fy = x / size * freq, y / size * freq
            x0, y0 = int(fx) % freq, int(fy) % freq
            x1, y1 = (x0 + 1) % freq, (y0 + 1) % freq
            tx, ty = fx % 1, fy % 1
            tx, ty = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
            v = (grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx) * (1 - ty) + (grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx) * ty
            row.append(v)
        out.append(row)
    return out

def layered_noise(size: int, seed: int) -> list[list[float]]:
    a = value_noise(size, 4, seed)
    b = value_noise(size, 16, seed + 1)
    c = value_noise(size, 64, seed + 2)
    return [[a[y][x] * 0.55 + b[y][x] * 0.3 + c[y][x] * 0.15 for x in range(size)] for y in range(size)]

def make_tile(base: tuple[int, int, int], vary: int, seed: int, speckle: tuple[int, int, int] | None = None) -> Image.Image:
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

TILES = {
    "grass":  ((108, 148,  88), 22, 21, ( 78, 118,  62)),   # 草地
    "forest": (( 62, 108,  66), 26, 31, ( 36,  82,  44)),   # 林地
    "water":  (( 64, 118, 152), 18, 41, (158, 196, 220)),   # 水面
    "rock":   (( 96,  92,  88), 26, 51, ( 64,  60,  58)),   # 岩石
    "sand":   ((196, 178, 128), 16, 61, (226, 208, 152)),   # 沙滩
    "dirt":   ((136, 106,  72), 20, 71, (102,  78,  52)),   # 裸土
}

ground = Image.new("RGBA", (CELL * 3, CELL * 2), (0, 0, 0, 0))
for index, (name, (base, vary, seed, speckle)) in enumerate(TILES.items()):
    ground.paste(make_tile(base, vary, seed, speckle), (index % 3 * CELL, index // 3 * CELL))
ground.save(f"{OUT}/terrain-atlas.png")
print("terrain-atlas.png:", ground.size, list(TILES.keys()))
