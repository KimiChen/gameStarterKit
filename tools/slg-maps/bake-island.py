#!/usr/bin/env python3
"""纯地表渲染 → island-ground.png（远档岛貌烘图，SlgFarLayerRenderer 的 slg-far-island 贴图）。

用法：bake-island.py <mapId> [--width 2400]
规则：整图等比缩放到目标宽（默认 2400，森之国 3600→2400 已验收）。输出 out/<mapId>/island-ground.png。
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, zjcs


def main() -> None:
    map_id = sys.argv[1]
    width = int(sys.argv[sys.argv.index("--width") + 1]) if "--width" in sys.argv else 2400
    cfg = load_config()
    mc = map_config(cfg, map_id)
    out_dir = Path(__file__).resolve().parent / "out" / map_id
    from lib.zjcs import resolve_ground_image
    src = resolve_ground_image(cfg, mc)
    img = Image.open(src).convert("RGB")
    if img.size[0] > width:
        img = img.resize((width, round(img.size[1] * width / img.size[0])), Image.LANCZOS)
    out = out_dir / "island-ground.png"
    img.save(out)
    print(f"{map_id}: {src.name} {Image.open(src).size} → {out} {img.size}")


if __name__ == "__main__":
    main()
