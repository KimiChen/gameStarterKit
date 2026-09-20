#!/usr/bin/env python3
"""原图 → 去水印的工作副本 + 来源存证。

用法：prepare-source.py <mapId> [--all | --file <素材文件名>]
原图是仓外只读素材；本脚本只读它们，产物一律落 out/<mapId>/sources/。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys

from PIL import Image

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from lib import config, imaging  # noqa: E402


def run(map_id: str, files: list[str]) -> None:
    cfg = config.load(map_id)
    dest = config.out_dir(map_id) / "sources"
    dest.mkdir(parents=True, exist_ok=True)
    provenance = {}
    for filename in files:
        src = config.source_path(cfg, filename)
        raw = src.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        im = Image.open(src).convert("RGB")
        before = im.size
        im = imaging.strip_watermark(im, cfg["watermark"])
        stem = filename.rsplit(".", 1)[0]
        out = dest / f"{stem}.png"
        im.save(out)
        provenance[filename] = {"sha256": digest, "size": list(before), "prepared": list(im.size)}
        print(f"  {filename}: {before[0]}×{before[1]} → {im.size[0]}×{im.size[1]}  sha256 {digest[:16]}…")
    (dest / "provenance.json").write_text(
        json.dumps({"schemaVersion": 1, "mapId": map_id, "watermark": cfg["watermark"],
                    "sources": provenance}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"→ {dest}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("map_id")
    ap.add_argument("--file", action="append", default=[])
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    cfg = config.load(args.map_id)
    if args.all or not args.file:
        wanted = [cfg["worldAuthority"]] + [b["source"] for b in cfg["bands"]]
        seen, files = set(), []
        for f in wanted:
            if f not in seen:
                seen.add(f); files.append(f)
    else:
        files = args.file
    run(args.map_id, files)
