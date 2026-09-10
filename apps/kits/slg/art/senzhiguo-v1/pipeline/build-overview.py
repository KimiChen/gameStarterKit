#!/usr/bin/env python3
"""森之国绘卷：从 terrain.json 区域矩形 + forest-layout.json 地标渲染 1024×1024 风格化总览图。"""
import json
import random
from PIL import Image, ImageDraw, ImageFilter

KIT = "/Volumes/KimData/work/worldMap/zlb_gameStarterKit/apps/kits/slg"
OUT = "/tmp/slg-extract/out/world-overview.png"
SIZE = 1024

terrain = json.load(open(f"{KIT}/data/terrain.json"))
layout = json.load(open(f"{KIT}/data/forest-layout.json"))
MAP = terrain["width"]
scale = SIZE / MAP

img = Image.new("RGBA", (SIZE, SIZE), (28, 40, 34, 255))
draw = ImageDraw.Draw(img)

palette = {entry["id"]: entry["color"] for entry in terrain["palette"]}
def yflip(y):  # 世界 y 北向增大；图像 y 向下
    return SIZE - y * scale

# 区域矩形（按登记顺序，默认草地先铺全图）
draw.rectangle((0, 0, SIZE, SIZE), fill=(*palette[0], 255))
for r in terrain["regions"]:
    color = palette[r["terrain"]]
    draw.rectangle((r["x"] * scale, yflip(r["y"] + r["height"]), (r["x"] + r["width"]) * scale, yflip(r["y"])),
                   fill=(*color, 235))

# 装饰点位稀疏撒点（真实布局的剪影）
rng = random.Random(7)
dots = {"vine": (36, 64, 34), "chest": (212, 178, 92), "portal": (168, 148, 96),
        "stele": (200, 188, 160), "crystal": (96, 200, 224), "sword": (120, 168, 148)}
for d in layout["decorations"]:
    if rng.random() > 0.4:
        continue
    x, y = d["x"] * scale, yflip(d["y"])
    c = dots.get(d["kind"], (60, 80, 60))
    rad = 1.2
    draw.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(*c, 200))

# 地标：金点 + 光晕
for lm in layout["landmarks"]:
    x, y = lm["x"] * scale, yflip(lm["y"])
    draw.ellipse((x - 10, y - 10, x + 10, y + 10), outline=(232, 196, 104, 255), width=3)
    draw.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(255, 230, 150, 255))

# 边框与轻微做旧
draw.rectangle((4, 4, SIZE - 4, SIZE - 4), outline=(90, 110, 84, 255), width=6)
img = img.filter(ImageFilter.GaussianBlur(0.4))
img.save(OUT)
print("world-overview.png:", img.size, "| landmarks:", len(layout["landmarks"]), "| regions:", len(terrain["regions"]))
