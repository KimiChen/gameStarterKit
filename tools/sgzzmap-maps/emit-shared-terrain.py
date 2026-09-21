#!/usr/bin/env python3
"""terrain.bytes → shared TS 内容模块（varint-RLE + base64）。

用法：emit-shared-terrain.py <mapId>
产物：apps/shared/src/kits/sgzzmap/content/terrain.data.ts

⚠ 为什么是 TS 模块而不是读盘：kit 服务端代码 ⛔ 不得 import node:*
（apps/server/test/kit-import-boundary.test.ts 规则 ①，mmo 的 greybox 同因）。
shared 又是零依赖（没有 zlib / atob / Buffer），所以用「varint-RLE + base64 + 手写解码器」。
terrain.bytes 仍是**权威产物**；本模块由它派生，两者一致性由 sgzzmap-content.test.ts 逐字节钉住。
"""
from __future__ import annotations

import argparse, base64, json, struct, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lib import config  # noqa: E402

MAX_RUN = 0xFFFF   # ⚠ 与 shared 解码器的 shift 上限对齐（varint ≤ 3 字节）


def encode(cells: bytes) -> bytes:
    runs, prev, n = bytearray(), cells[0], 1
    out = bytearray()

    def flush(value: int, count: int) -> None:
        out.append(value)
        while True:
            x = count & 0x7F
            count >>= 7
            out.append(x | (0x80 if count else 0))
            if not count:
                break

    for b in cells[1:]:
        if b == prev and n < MAX_RUN:
            n += 1
        else:
            flush(prev, n)
            prev, n = b, 1
    flush(prev, n)
    return bytes(out)


def run(map_id: str) -> None:
    out = config.out_dir(map_id)
    raw = (out / "terrain.bytes").read_bytes()
    meta = json.loads((out / "terrain.meta.json").read_text(encoding="utf-8"))
    rows, cols = struct.unpack(">II", raw[:8])
    payload = encode(raw[8:])
    b64 = base64.b64encode(payload).decode("ascii")
    print(f"格 {rows}×{cols}  RLE {len(payload)} B  base64 {len(b64)} 字符")

    chunks = [b64[i:i + 110] for i in range(0, len(b64), 110)]
    # A long `a + b + ...` chain creates a deeply nested AST and overflows
    # Creator's script transformer. Array elements keep the AST depth bounded.
    body = "\n".join(f'    "{c}",' for c in chunks)
    palette = json.dumps(
        [{"id": e["id"], "name": e["name"], "cn": e["cn"], "color": e["color"], "passable": e["passable"]}
         for e in meta["palette"]], ensure_ascii=False, indent=8)
    palette = palette.replace('"id"', "id").replace('"name"', "name").replace('"cn"', "cn") \
                     .replace('"color"', "color").replace('"passable"', "passable")

    ts = f'''/**
 * sgzzmap 冻结地形内容（自动生成，⛔ 勿手改）。
 *
 * 由 `tools/sgzzmap-maps/emit-shared-terrain.py {map_id}` 从 `apps/kits/sgzzmap/data/maps/{map_id}/terrain.bytes`
 * 派生：varint-RLE + base64。terrain.bytes 仍是权威产物，一致性由
 * `apps/server/test/sgzzmap-content.test.ts` 逐字节钉住。
 *
 * ⚠ 为什么不读盘：kit 服务端代码 ⛔ 不得 import node:*（kit-import-boundary 规则 ①），
 * 与 mmo 的 greybox 内容包同因；shared 又零依赖（无 zlib / atob / Buffer），
 * 故自带解码器见 `../api/hexmap/index` 的 decodeSgzzTerrainRle。
 */
import type {{ ISgzzTerrainClass }} from "../api/hexmap/index";

export const SGZZ_TERRAIN_MAP_ID = "{map_id}";
export const SGZZ_TERRAIN_ROWS = {rows};
export const SGZZ_TERRAIN_COLS = {cols};
/** 权威 terrain.bytes 的 sha256（含 8 字节头）。 */
export const SGZZ_TERRAIN_SHA256 = "{meta["sha256"]}";
export const SGZZ_TERRAIN_PALETTE: readonly ISgzzTerrainClass[] = {palette};

/** varint-RLE 载荷（不含头），base64。 */
export const SGZZ_TERRAIN_RLE_B64 = [
{body}
].join("");
'''
    dest = config.REPO / "apps/shared/src/kits/sgzzmap/content/terrain.data.ts"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(ts, encoding="utf-8")
    print(f"→ {dest.relative_to(config.REPO)}  ({dest.stat().st_size/1024:.0f} KiB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("map_id")
    run(ap.parse_args().map_id)
