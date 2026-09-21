#!/usr/bin/env python3
"""按 select.json 批量把原版 KTX 解成 PNG，并写逐文件存证。

    /tmp/maporiginal-venv/bin/python decode_batch.py           # 解码 + 存证
    /tmp/maporiginal-venv/bin/python decode_batch.py --list    # 只列清单

产物落 out/png/<资源路径>.png（⛔ 已 gitignore），存证落 out/sources.jsonl。
⛔ 只解 select.json 点名的那批——全量 9,018 张 KTX 没必要也占地方。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from decode_ktx import decode, resolve_by_name, parse_ktx, FORMATS  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
SEL = json.load(open(os.path.join(HERE, "select.json")))


def selected(name_map: dict) -> list:
    """-> [(资源路径, kind)]，按路径排序、去重。"""
    picked = {}
    for g in SEL["groups"]:
        kind = g["kind"]
        for p in g.get("paths", []):
            if p in name_map:
                picked[p] = kind
        for pref in g.get("prefixes", []):
            for k in name_map:
                if not k.startswith(pref):
                    continue
                if g.get("suffix") and not k.endswith(g["suffix"]):
                    continue
                if g.get("maxBytes") and name_map[k]["size"] > g["maxBytes"]:
                    continue
                if g.get("only") and not any(o in k for o in g["only"]):
                    continue
                picked[k] = kind
    return sorted(picked.items())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()

    nm = json.load(open(os.path.join(OUT, "name_map.json")))
    items = selected(nm)
    print("清单 %d 条" % len(items))
    if a.list:
        for k, kind in items:
            print("  %-8s %-62s %9d B %s" % (kind, k, nm[k]["size"], nm[k]["ext"]))
        return 0

    png_dir = os.path.join(OUT, "png")
    rows = []
    ok = skip = 0
    for k, kind in items:
        src = resolve_by_name(k)
        blob = open(src, "rb").read()
        sha = hashlib.sha256(blob).hexdigest()
        dst_rel = k.rsplit(".", 1)[0] + ".png"
        dst = os.path.join(png_dir, dst_rel)
        try:
            if k.endswith(".ktx"):
                img, fmt = decode(blob)
                meta = parse_ktx(blob)
                w, h = meta["w"], meta["h"]
            else:
                skip += 1
                continue
        except ValueError as e:
            print("  ⚠ 跳过 %s：%s" % (k, e))
            skip += 1
            continue
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        img.save(dst)
        ok += 1
        rows.append({
            "logical": k, "kind": kind, "src_abs": src, "sha256": sha,
            "src_bytes": len(blob), "src_format": fmt, "size": [w, h],
            "container": nm[k]["container"], "idx": nm[k]["idx"],
            "namehash": nm[k]["hash"], "out": os.path.relpath(dst, OUT),
            "convert": "KTX(%s) -> PNG RGBA，texture2ddecoder + Pillow，⛔ 无重采样无缩放" % fmt,
        })
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "sources.jsonl"), "w", encoding="utf-8") as fo:
        for r in rows:
            fo.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("解码 %d 张，跳过 %d；存证 -> out/sources.jsonl" % (ok, skip))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
