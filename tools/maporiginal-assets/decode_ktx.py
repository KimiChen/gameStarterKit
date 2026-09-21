#!/usr/bin/env python3
"""KTX v1.1（ETC2 / ASTC / R8）→ PNG。

    /tmp/maporiginal-venv/bin/python decode_ktx.py <in.ktx> <out.png>
    /tmp/maporiginal-venv/bin/python decode_ktx.py --name map/s1/... --out dir/   # 按真实路径取

依赖（⛔ 不进仓，venv 里装）：
    python3 -m venv /tmp/maporiginal-venv
    /tmp/maporiginal-venv/bin/pip install texture2ddecoder pillow

⚠ Creator 3.8 的图片导入白名单不含 `.ktx`，且 `docs/3D-ASSETS.md` §5 ⛔ 禁 KTX/ETC/ASTC 入库
  ⇒ 入库的一律是这里转出的 PNG，平台压缩交 Creator 构建期做。
⚠ ETC2/ASTC 是有损压缩，解出来是「已经压过一次」的像素；再走 Creator 的 astc 会二次损失。
"""
from __future__ import annotations

import argparse
import os
import struct
import sys

KTX_ID = bytes([0xAB, 0x4B, 0x54, 0x58, 0x20, 0x31, 0x31, 0xBB, 0x0D, 0x0A, 0x1A, 0x0A])

# glInternalFormat -> ("etc2"|"etc2a1"|"etc2a8"|"astc"|"r8", 块宽, 块高)
FORMATS = {
    0x9274: ("etc2", 4, 4), 0x9275: ("etc2", 4, 4),
    0x9276: ("etc2a1", 4, 4), 0x9277: ("etc2a1", 4, 4),
    0x9278: ("etc2a8", 4, 4), 0x9279: ("etc2a8", 4, 4),
    0x8229: ("r8", 1, 1),
}
_ASTC_DIMS = [(4, 4), (5, 4), (5, 5), (6, 5), (6, 6), (8, 5), (8, 6), (8, 8),
              (10, 5), (10, 6), (10, 8), (10, 10), (12, 10), (12, 12)]
for _i, (_bw, _bh) in enumerate(_ASTC_DIMS):
    FORMATS[0x93B0 + _i] = ("astc", _bw, _bh)   # LDR
    FORMATS[0x93D0 + _i] = ("astc", _bw, _bh)   # sRGB


def parse_ktx(blob: bytes) -> dict:
    if blob[:12] != KTX_ID:
        raise ValueError("不是 KTX v1.1（魔数不符）")
    endian = struct.unpack_from("<I", blob, 12)[0]
    if endian != 0x04030201:
        raise ValueError("大端 KTX 未支持")
    (gl_type, gl_type_size, gl_format, gl_internal, gl_base,
     w, h, d, arr, faces, mips, kvlen) = struct.unpack_from("<12I", blob, 16)
    off = 64 + kvlen
    size = struct.unpack_from("<I", blob, off)[0]
    return {"internal": gl_internal, "w": w, "h": h, "mips": max(1, mips),
            "data": blob[off + 4: off + 4 + size], "size": size}


def decode(blob: bytes):
    """-> (PIL.Image, 格式名)"""
    import texture2ddecoder as T
    from PIL import Image

    k = parse_ktx(blob)
    fmt = FORMATS.get(k["internal"])
    if fmt is None:
        raise ValueError("未支持的 glInternalFormat 0x%04x" % k["internal"])
    kind, bw, bh = fmt
    w, h = k["w"], k["h"]
    if kind == "r8":
        img = Image.frombytes("L", (w, h), k["data"][: w * h])
        return img.convert("RGBA"), "R8"
    if kind == "astc":
        raw = T.decode_astc(k["data"], w, h, bw, bh)
        name = "ASTC %dx%d" % (bw, bh)
    else:
        raw = getattr(T, "decode_" + kind)(k["data"], w, h)
        name = {"etc2": "ETC2 RGB", "etc2a1": "ETC2 A1", "etc2a8": "ETC2 RGBA"}[kind]
    return Image.frombytes("RGBA", (w, h), raw, "raw", "BGRA"), name


def resolve_by_name(name: str) -> str:
    """真实资源路径 -> elp-unpacked 里的磁盘路径（需先跑 build_name_map.py）。"""
    import json
    here = os.path.dirname(os.path.abspath(__file__))
    cfg = json.load(open(os.path.join(here, "assets.config.json")))
    nm = os.path.join(here, cfg["outDir"], "name_map.json")
    if not os.path.exists(nm):
        raise SystemExit("⛔ 先跑 build_name_map.py 生成 out/name_map.json")
    row = json.load(open(nm)).get(name[6:] if name.startswith("asset/") else name)
    if row is None:
        raise SystemExit("⛔ name_map 里没有这条路径：%s" % name)
    d = os.path.join(cfg["elpRoot"], "files", row["container"])
    for fe in os.scandir(d):
        if fe.name.startswith("%03d_" % row["idx"]):
            return fe.path
    raise SystemExit("⛔ 磁盘上找不到条目 %s/%03d" % (row["container"], row["idx"]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src", nargs="?", help="输入 .ktx 磁盘路径")
    ap.add_argument("dst", nargs="?", help="输出 .png")
    ap.add_argument("--name", help="按真实资源路径取（需 out/name_map.json）")
    ap.add_argument("--out", help="输出目录（配 --name 用）")
    ap.add_argument("--info", action="store_true", help="只打印头信息")
    a = ap.parse_args()

    src = resolve_by_name(a.name) if a.name else a.src
    if not src:
        ap.error("要么给 src，要么给 --name")
    blob = open(src, "rb").read()
    if a.info:
        k = parse_ktx(blob)
        fmt = FORMATS.get(k["internal"])
        print("%dx%d  0x%04x %s  payload %d B  mips %d"
              % (k["w"], k["h"], k["internal"], fmt or "未支持", k["size"], k["mips"]))
        return 0
    img, fmt = decode(blob)
    dst = a.dst
    if not dst:
        base = (a.name or os.path.basename(src)).rsplit(".", 1)[0]
        dst = os.path.join(a.out or ".", base.replace("/", "_") + ".png")
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    img.save(dst)
    print("%s  %dx%d  %s  -> %s" % (src.split("/")[-1], img.width, img.height, fmt, dst))
    return 0


if __name__ == "__main__":
    sys.exit(main())
