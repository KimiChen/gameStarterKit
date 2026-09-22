#!/usr/bin/env python3
"""terrain.bytes → shared TS 内容模块（varint-RLE + base64）。

    /tmp/maporiginal-venv/bin/python emit_shared_terrain.py [--map s1] [--out <ts 路径>]

⚠ 为什么是 TS 模块而不是读盘：kit 服务端代码 ⛔ 不得 import `node:*`
（`apps/server/test/kit-import-boundary.test.ts` 规则 ①）。shared 又是零依赖
（没有 zlib / atob / Buffer），所以用「varint-RLE + base64 + 手写解码器」。
编码格式与 `tools/sgzzmap-maps/emit-shared-terrain.py` **逐字节同构**，解码器可照抄。

⚠ base64 串必须切成数组元素而不是 `a + b + ...` 长链 —— 长链会把 AST 嵌套到
Creator 脚本转译器溢出（sgzzmap 踩过）。
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
MAX_RUN = 0xFFFF   # ⚠ 与 shared 解码器的 shift 上限对齐（varint ≤ 3 字节）


def encode(cells: bytes) -> bytes:
    out = bytearray()

    def flush(value: int, count: int) -> None:
        out.append(value)
        while True:
            x = count & 0x7F
            count >>= 7
            out.append(x | (0x80 if count else 0))
            if not count:
                break

    prev, n = cells[0], 1
    for b in cells[1:]:
        if b == prev and n < MAX_RUN:
            n += 1
        else:
            flush(prev, n)
            prev, n = b, 1
    flush(prev, n)
    return bytes(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    ap.add_argument("--layer", default="pass", choices=["pass", "display"],
                    help="pass=3 类通行层（进 shared）；display=原版值显示层（⚠ 3.9 MB，⛔ 别进 shared）")
    ap.add_argument("--out")
    a = ap.parse_args()

    d = os.path.join(OUT, "pack", a.map)
    fn = "terrain.pass.bytes" if a.layer == "pass" else "terrain.bytes"
    raw = open(os.path.join(d, fn), "rb").read()
    info = json.load(open(os.path.join(d, "terrain.info.json"), encoding="utf-8"))
    rows, cols = struct.unpack(">II", raw[:8])
    payload = encode(raw[8:])
    b64 = base64.b64encode(payload).decode("ascii")
    print("格 %dx%d  原始 %d B  RLE %d B（%.1f%%）  base64 %d 字符（%.0f KB）"
          % (rows, cols, len(raw) - 8, len(payload), 100.0 * len(payload) / (len(raw) - 8),
             len(b64), len(b64) / 1024))

    chunks = [b64[i:i + 110] for i in range(0, len(b64), 110)]
    body = "\n".join('    "%s",' % c for c in chunks)
    pal_src = info["passPalette"] if a.layer == "pass" else info["palette"]
    palette = json.dumps([{k: v for k, v in e.items() if k != "tiles"} for e in pal_src],
                         ensure_ascii=False, indent=2)
    sha = info["passSha256"] if a.layer == "pass" else info["sha256"]
    ts = '''/**
 * mapOriginal 地形内容（%s）—— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_shared_terrain.py` 从 `terrain.bytes` 派生
 * （varint-RLE + base64）。权威产物仍是 `apps/kits/mapOriginal/data/maps/%s/terrain.bytes`，
 * 两者一致性由 `apps/server/test/mapOriginal-content.test.ts` 逐字节 + sha256 钉住。
 *
 * ⚠ 走 TS 字面量而不是读盘：kit 服务端 ⛔ 不得 import `node:*`；shared 又零依赖
 *   （无 zlib / atob / Buffer），解码器 `mapoDecodeBase64` / `mapoDecodeRle` 自带。
 * ⚠ **本模块是 3 类通行层，不是原版值显示层**：显示层一阶熵 2.95 bit/格，
 *   varint-RLE 会胀到 125.6%%（3.9 MB TS），⛔ 塞不进 shared；它走 Cocos 资源。
 */
import type { IMapoTerrainClass } from "../api/hexmap/index";

export const MAPO_TERRAIN_MAP_ID = "%s";
export const MAPO_TERRAIN_ROWS = %d;
export const MAPO_TERRAIN_COLS = %d;
export const MAPO_TERRAIN_SHA256 = "%s";

export const MAPO_TERRAIN_PALETTE: readonly IMapoTerrainClass[] = %s;

/** varint-RLE + base64 的地形数据；⛔ 数组元素而非 `a + b` 长链（长链会撑爆 Creator 转译器）。 */
export const MAPO_TERRAIN_RLE_B64 = [
%s
].join("");
''' % (a.map, a.map, a.map, rows, cols, sha, palette, body)

    dst = a.out or os.path.join(d, "terrain.%s.data.ts" % a.layer)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(ts)
    print("→ %s（%.0f KB, %d 行）" % (dst, os.path.getsize(dst) / 1024, ts.count("\n") + 1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
