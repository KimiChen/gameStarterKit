#!/usr/bin/env python3
"""把美术交付的单片地表图打成运行时图集。

用法：pack-atlas.py <mapId> [--from <交付目录>]

输入：<交付目录>/lod{0,1,2}/<name>.png，各 9 张、每张 256×128 RGBA，
      name 取自地形调色板的英文名（plain/forest/.../offmap），id 即调色板下标。
输出：out/<mapId>/atlas-lod{0,1,2}.{png,meta.json}

⚠ 布局是**契约**，与 shared 的 SGZZ_ATLAS_* 常量一一对应，由
  apps/server/test/sgzzmap-content.test.ts 逐格钉住 —— 改这里必须同改那边，否则 UV 会整体错格。

⚠ 为什么要出血带：菱形的四个顶点正好落在图集格**四条边的中点**上，双线性采样会跨到隔壁格。
  所以格与格之间留 GUTTER 像素，并把每格的边缘像素复制进去（edge clamp），
  ⛔ 不靠 UV 内缩解决 —— 内缩会把画面往里压，菱形边缘就少一圈。

⚠ 图集尺寸取 2 的幂（1024×512）：NPOT 贴图在 WebGL1 上不能开 mipmap / repeat，
  ⛔ 不要为了省那点空间改成 792×408。
"""
from __future__ import annotations

import argparse, json, sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config  # noqa: E402

CELL_W, CELL_H = 256, 128
GUTTER = 4
COLS = 3
SHEET_W, SHEET_H = 1024, 512
LODS = (0, 1, 2)

# id 即下标，与 terrain.meta.json 的 palette 同序
NAMES = ["plain", "forest", "hill", "mountain", "water", "sea", "wetland", "desert", "offmap"]


def cell_origin(index: int) -> tuple[int, int]:
    """第 index 格的左上角（含出血带偏移）。id = 行×COLS + 列。"""
    row, col = divmod(index, COLS)
    return GUTTER + col * (CELL_W + GUTTER * 2), GUTTER + row * (CELL_H + GUTTER * 2)


def paste_with_bleed(sheet: Image.Image, tile: Image.Image, x: int, y: int) -> None:
    """贴一格，并把四边与四角的边缘像素复制进出血带。"""
    sheet.paste(tile, (x, y))
    left = tile.crop((0, 0, 1, CELL_H)).resize((GUTTER, CELL_H), Image.NEAREST)
    right = tile.crop((CELL_W - 1, 0, CELL_W, CELL_H)).resize((GUTTER, CELL_H), Image.NEAREST)
    top = tile.crop((0, 0, CELL_W, 1)).resize((CELL_W, GUTTER), Image.NEAREST)
    bottom = tile.crop((0, CELL_H - 1, CELL_W, CELL_H)).resize((CELL_W, GUTTER), Image.NEAREST)
    sheet.paste(left, (x - GUTTER, y))
    sheet.paste(right, (x + CELL_W, y))
    sheet.paste(top, (x, y - GUTTER))
    sheet.paste(bottom, (x, y + CELL_H))
    for cx, cy, sx, sy in [(0, 0, x - GUTTER, y - GUTTER), (CELL_W - 1, 0, x + CELL_W, y - GUTTER),
                           (0, CELL_H - 1, x - GUTTER, y + CELL_H),
                           (CELL_W - 1, CELL_H - 1, x + CELL_W, y + CELL_H)]:
        corner = tile.crop((cx, cy, cx + 1, cy + 1)).resize((GUTTER, GUTTER), Image.NEAREST)
        sheet.paste(corner, (sx, sy))


def pack(map_id: str, src_root: Path) -> None:
    cfg = config.load(map_id)
    out = config.out_dir(map_id)
    palette = json.loads((out / "terrain.meta.json").read_text())["palette"]
    if [p["name"] for p in palette] != NAMES:
        raise SystemExit(f"调色板与 NAMES 不一致：{[p['name'] for p in palette]}")

    for lod in LODS:
        src = src_root / f"lod{lod}"
        sheet = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
        cells = []
        for index, name in enumerate(NAMES):
            path = src / f"{name}.png"
            if not path.exists():
                raise SystemExit(f"缺片：{path}")
            tile = Image.open(path).convert("RGBA")
            if tile.size != (CELL_W, CELL_H):
                raise SystemExit(f"{path} 尺寸 {tile.size}，应为 {(CELL_W, CELL_H)}")
            x, y = cell_origin(index)
            paste_with_bleed(sheet, tile, x, y)
            cells.append({"id": index, "name": name, "cn": palette[index]["cn"],
                          "cell": [x, y, CELL_W, CELL_H], "source": str(path.relative_to(src_root.parent))})
        sheet.save(out / f"atlas-lod{lod}.png")
        (out / f"atlas-lod{lod}.meta.json").write_text(json.dumps({
            "schemaVersion": 2, "mapId": map_id, "lod": lod,
            "cell": [CELL_W, CELL_H], "gutter": GUTTER, "gridCols": COLS,
            "size": [SHEET_W, SHEET_H], "uv": "diamond-midpoints", "cells": cells,
        }, ensure_ascii=False, indent=1) + "\n")
        print(f"atlas-lod{lod}.png  {SHEET_W}×{SHEET_H}  {len(cells)} 格（出血 {GUTTER}px）")
    print(f"⚠ 源：{src_root}；⚠ 布局须与 shared 的 SGZZ_ATLAS_* 一致（机检在 sgzzmap-content.test.ts）")
    _ = cfg


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--from", dest="src", default=None, help="交付目录（含 lod0/lod1/lod2），默认 <sourceRoot>/_交付/tiles")
    args = ap.parse_args()
    cfg = config.load(args.map_id)
    # ⚠ config.source_path 只认文件；交付目录要直接从 sourceRoot 拼
    src = Path(args.src) if args.src else Path(cfg["_sourceRoot"]) / "_交付" / "tiles"
    if not src.exists():
        raise SystemExit(f"交付目录不存在：{src}")
    pack(args.map_id, src)


if __name__ == "__main__":
    main()
