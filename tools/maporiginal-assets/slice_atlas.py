#!/usr/bin/env python3
"""把原版图集页按 <TextureAtlas> XML 切回带原始路径的单图。

    /tmp/maporiginal-venv/bin/python slice_atlas.py --all          # select.json 里 kind=atlas 的全切
    /tmp/maporiginal-venv/bin/python slice_atlas.py <图集xml资源路径>

XML 形态：<root><TextureAtlas width height imagePath="<页文件名>">
            <sprite n="asset/…/x.png" x y w h [r="y"] [oW oH oX oY] /> …
⚠ `r="y"` 是页内**旋转 90°**存放（w/h 是旋转后的占位），切出来要转回去。
⚠ `oW/oH/oX/oY` 是去白边前的原始尺寸与偏移，还原成原图尺寸才对得上引用它的 UI。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from decode_ktx import decode, resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])


def page_image(xml_logical: str, image_path: str):
    """图集页与 xml 同目录；优先用已解码的 out/png，没有就现解。

    ⚠ XML 里的 `imagePath` 写的是**源**扩展名（.png/.tga），而包里是构建期转出的 `.ktx`
    —— 与 README §1 坑③同源。所以要按扩展名回退再找一遍，⛔ 别只认字面名。
    """
    from PIL import Image
    d = xml_logical.rsplit("/", 1)[0]
    base = (d + "/" + image_path).rsplit(".", 1)[0]
    cached = os.path.join(OUT, "png", base + ".png")
    if os.path.exists(cached):
        return Image.open(cached), base + ".png"
    last = None
    for ext in ("ktx", "png", "win.ktx", "astc", "jpg"):
        page = base + "." + ext
        try:
            path = resolve_by_name(page)
        except SystemExit as e:                      # name_map 里没有这条
            last = e
            continue
        if page.endswith(".png") or page.endswith(".jpg"):
            return Image.open(path), page
        img, _fmt = decode(open(path, "rb").read())
        return img, page
    raise SystemExit(last or f"⛔ 找不到图集页 {base}.*")


def slice_one(xml_logical: str, rows: list) -> int:
    """一个 xml 可能带**多页** `<TextureAtlas>`，⚠ 必须全切。

    ⚠ 这里踩过一次：早先写的是 `root.find("TextureAtlas")` 只取**第一页**，
    `remain_tex.xml` 有 17 页 ⇒ 1,284 张里只切出 100 来张，后 16 页整片丢失
    （2D 山体件 `scene/ground/mountain_new/grass_fall_new/png/m1..m10` 就在里面，
    于是一度误判「原版 2D 山/林素材不在包里」）。⛔ 别再改回 find()。
    """
    n = 0
    blob = open(resolve_by_name(xml_logical), "rb").read()
    root = ET.fromstring(blob.decode("utf-8", "replace"))
    for ta in root.findall("TextureAtlas"):
        n += slice_page(xml_logical, ta, rows)
    return n


def slice_page(xml_logical: str, ta, rows: list) -> int:
    from PIL import Image
    page, page_logical = page_image(xml_logical, ta.get("imagePath"))
    n = 0
    for sp in ta.findall("sprite"):
        name = sp.get("n")
        if not name:
            continue
        x, y = int(sp.get("x", 0)), int(sp.get("y", 0))
        w, h = int(sp.get("w", 0)), int(sp.get("h", 0))
        if w <= 0 or h <= 0:
            continue
        cut = page.crop((x, y, x + w, y + h))
        if sp.get("r") == "y":                      # 页内旋转 90° 存放
            cut = cut.transpose(Image.Transpose.ROTATE_90)
        ow, oh = int(sp.get("oW", cut.width)), int(sp.get("oH", cut.height))
        ox, oy = int(sp.get("oX", 0)), int(sp.get("oY", 0))
        if (ow, oh) != (cut.width, cut.height):     # 还原去白边前的原始尺寸
            full = Image.new("RGBA", (ow, oh), (0, 0, 0, 0))
            full.paste(cut, (ox, oy))
            cut = full
        rel = (name[6:] if name.startswith("asset/") else name).rsplit(".", 1)[0] + ".png"
        dst = os.path.join(OUT, "png", rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        cut.save(dst)
        rows.append({
            "logical": rel[:-4] + ".png", "kind": "sprite",
            "from_atlas": page_logical, "atlas_xml": xml_logical,
            "rect": [x, y, w, h], "rotated": sp.get("r") == "y",
            "orig": [ow, oh, ox, oy],
            "out": os.path.relpath(dst, OUT),
            "convert": "从图集页 %s 按 XML 矩形切出（含解旋转与去白边还原）" % page_logical,
        })
        n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("xml", nargs="*", help="图集 xml 的资源路径")
    ap.add_argument("--all", action="store_true", help="切 select.json 里 kind=atlas / ui 的全部 xml")
    a = ap.parse_args()

    targets = list(a.xml)
    if a.all:
        sys.path.insert(0, HERE)
        from decode_batch import selected
        nm = json.load(open(os.path.join(OUT, "name_map.json")))
        targets += [k for k, kind in selected(nm) if k.endswith(".xml")]
    if not targets:
        ap.error("给 xml 路径，或 --all")

    rows, total = [], 0
    for x in sorted(set(targets)):
        try:
            c = slice_one(x, rows)
        except Exception as e:                       # noqa: BLE001
            print("  ⚠ %s：%s" % (x, e))
            continue
        total += c
        print("  %-62s %4d 张" % (x, c))
    path = os.path.join(OUT, "sprites.jsonl")
    with open(path, "w", encoding="utf-8") as fo:
        for r in rows:
            fo.write(json.dumps(r, ensure_ascii=False) + "\n")
    print("切出 %d 张单图 -> out/png/，存证 -> out/sprites.jsonl" % total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
