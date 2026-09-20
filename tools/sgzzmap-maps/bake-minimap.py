#!/usr/bin/env python3
"""缩略图：由最远档底图降采样 + 菱形蒙版。用法：bake-minimap.py <mapId>

由底图派生 ⇒ 与底图、与地块网格天然对齐（三者同一个 warp）。
"""
from __future__ import annotations

import argparse, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config  # noqa: E402


def run(map_id: str) -> None:
    cfg = config.load(map_id)
    out = config.out_dir(map_id)
    far = max(b["lod"] for b in cfg["bands"] if b["kind"] == "plate")
    src = out / f"plate-lod{far}.png"
    if not src.is_file():
        raise SystemExit(f"先跑 bake-plate.py {map_id}（缺 {src}）")
    size = int(cfg["minimap"]["size"])
    im = Image.open(src).convert("RGBA")
    # 世界包围盒是 2:1，缩略图取正方 ⇒ 高度补边，菱形居中
    mini = im.resize((size, size // 2), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.paste(mini, (0, (size - size // 2) // 2), mini)
    canvas.save(out / "minimap.png")
    canvas.split()[3].save(out / "minimap-mask.png")
    print(f"  minimap {size}×{size} ← plate-lod{far}")
    print(f"→ {out}/minimap.png, minimap-mask.png")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("map_id")
    run(ap.parse_args().map_id)
