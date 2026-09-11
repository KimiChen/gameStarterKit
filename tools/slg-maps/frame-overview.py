#!/usr/bin/env python3
"""MapNN_web.jpg → world-overview.png（山河绘卷：海青底装裱 2048²，居中，内容宽 2032）。

用法：frame-overview.py <mapId>
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib.zjcs import load_config, map_config, zjcs

SIZE = 2048
CONTENT = 2032  # 留 8px 边


def main() -> None:
    map_id = sys.argv[1]
    cfg = load_config()
    mc = map_config(cfg, map_id)
    src = zjcs(cfg, "yoo-assets", "map-assets", "renders", f"Map{mc['classId']}_web.jpg")
    img = Image.open(src).convert("RGB")
    img = img.resize((CONTENT, round(img.size[1] * CONTENT / img.size[0])), Image.LANCZOS)
    canvas = Image.new("RGB", (SIZE, SIZE), tuple(mc["seaColor"]) if mc.get("seaColor") else (66, 143, 163))
    canvas.paste(img, ((SIZE - img.size[0]) // 2, (SIZE - img.size[1]) // 2))
    out_dir = Path(__file__).resolve().parent / "out" / map_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / "world-overview.png"
    canvas.save(out)
    mini = canvas.resize((256, 256), Image.LANCZOS)
    mini.save(out_dir / "world-overview-mini.png")
    print(f"{map_id}: {src.name} → {out} + world-overview-mini.png")


if __name__ == "__main__":
    main()
