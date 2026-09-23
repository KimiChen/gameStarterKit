#!/usr/bin/env python3
"""选中高亮件：从 `scene/_output_atlas_scene/atlas_tex/grid-1.ktx` 裁出 choose2.png。

用法: /tmp/maporiginal-venv/bin/python build_choose.py

溯源链（与原套件同一条）：`base.cw` client_res id 11009「行军选择_GRID_STATE_MY」
→ `scene/grid/choose_00_group.prefab` → 子 sprite `choose2`（240×112、pivot 中心、
绿 (49,255,39) + add_color）→ 贴图 `scene/grid/png/choose2.png`
→ 实物在 `scene/_output_atlas_scene/atlas_tex/grid-1.ktx`（2044×1652）的
atlas XML 帧 (1260,1526,240,112)。⚠ 无重采样、无缩放。
产物：`out/pack/s1/choose.png` + `out/sources.jsonl` 追加一条溯源（emit_ledger §B 用）。
"""
from __future__ import annotations

import hashlib
import json
import os

from decode_ktx import decode, resolve_by_name

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

ATLAS = "asset/scene/_output_atlas_scene/atlas_tex/grid-1.ktx"
# atlas XML（elp-unpacked …/16259_48ba0039b580cdea.xml）里 choose2.png 的帧：
#   <sprite h="112" n="asset/scene/grid/png/choose2.png" w="240" x="1260" y="1526" />
FRAME = (1260, 1526, 240, 112)


def main() -> int:
    src = resolve_by_name(ATLAS)
    blob = open(src, "rb").read()
    img, fmt = decode(blob)
    x, y, w, h = FRAME
    tile = img.crop((x, y, x + w, y + h))
    os.makedirs(os.path.join(OUT, "pack", "s1"), exist_ok=True)
    dst = os.path.join(OUT, "pack", "s1", "choose.png")
    tile.save(dst)

    # 溯源（emit_ledger §B 的 sources.jsonl 追加一条；⛔ 不重复）
    base = os.path.basename(src)              # 054_4de95185de972579.ktx
    idx_str, namehash = base.split("_", 1)
    entry = {
        "logical": ATLAS[6:] + "#choose2",
        "kind": "select",
        "src_abs": src,
        "sha256": hashlib.sha256(blob).hexdigest(),
        "src_bytes": len(blob),
        "src_format": fmt,
        "size": [2044, 1652],
        "container": os.path.basename(os.path.dirname(src)),
        "idx": int(idx_str),
        "namehash": os.path.splitext(namehash)[0],
        "out": "png/choose2.png",
        "convert": "KTX(%s) -> PNG RGBA，按 atlas XML 帧 (1260,1526,240,112) 裁切，⛔ 无重采样无缩放" % fmt,
    }
    sl = os.path.join(OUT, "sources.jsonl")
    lines = []
    if os.path.exists(sl):
        lines = [x for x in open(sl, encoding="utf-8").read().splitlines()
                 if x.strip() and json.loads(x)["logical"] != entry["logical"]]
    lines.append(json.dumps(entry, ensure_ascii=False))
    with open(sl, "w", encoding="utf-8") as fo:
        fo.write("\n".join(lines) + "\n")
    print("→ %s（%d B）+ sources.jsonl#%s" % (dst, os.path.getsize(dst), entry["logical"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
