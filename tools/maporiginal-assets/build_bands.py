#!/usr/bin/env python3
"""原版 **cell 级地貌带层** `logic_background.bytes` → `bands.bytes` + shared TS（N1）。

    /tmp/maporiginal-venv/bin/python build_bands.py [--map s1]

★ 机制（证据链闭合）：
  ① `[干净集]` `const.lua:252`：`def_enum("GROUND_TYPE", "ground", "snow", "desert")`
     ⇒ `GROUND_TYPE_NAMES = [1]ground [2]snow [3]desert`（名字被 KS[11] 残成 `AROU[D_TYPX`）。
  ② `[干净集]` `map_layer_config.lua`：层名 `logic_ground` = `logic_background.bytes`，
     逻辑类 `logic_ground_layer_logic`（cell 级：get_grid_size = TILE_WIDTH×2，即 300×150 一格）。
  ③ `[disasm]` `map_mgr.lua` 的 `check_ground_type(row, col)` =
     `GROUND_TYPE_NAMES[logic_ground:get_grid_type(row,col)] or "ground"`。
  ⇒ **每格的地貌带是单值**：2 → 雪件、3 → 沙件、其余 → 基础件（⛔ 含 7/8/9/11/13/16/17/18，
     原版查不到名字就落回 "ground" —— 本 kit 照抄这条回退）。
  ⇒ 雪/沙**块**带 489 块双挂（§1.3）引发的「重叠谁优先」在 cell 级**根本不存在**：
     那 489 块里实测 41,295 格雪 / 3,292 格沙 / 813 格草地，逐格各有唯一定论。
     ⛔ 别退回去用「格在雪块/沙块内」当判据 —— 块级会把雪块里 38,066 个草地格误换雪件。

★ 交叉校验（用 build_blocks.py 的真映射 `BLOCK_TILES=10 / ORIGIN=-10`，⛔ 不另写一份）：
  值 2 的格必须 100% 落在 snow 块内、值 3 必须 100% 落在 desert 块内（实测全中，行主序）。
  列主序对照只有 55.2% / 19.0% —— 顺便再次坐实**行主序**。

产物：`bands.bytes`（原版字节**原样**，4B 大端 u16 头 + 行主序 u8，kit 数据目录存证用）
+ `bands.info.json` + `bands.data.ts`（shared：varint-RLE + base64，与通行层同构）。
⚠ RLE 实测压到 7.3%（213 KB TS）⇒ 走 shared 模块，⛔ 不占 Cocos BufferAsset
  （与 terrain.bytes 熵 2.95 bit/格、RLE 反胀的处境相反）。
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_blocks import BLOCK_TILES, GRID_SIDE, ORIGIN  # noqa: E402  ★ 复用块→格映射
from decode_ktx import resolve_by_name  # noqa: E402
from emit_shared_terrain import encode  # noqa: E402  ★ 与通行层同一套 varint-RLE

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

MAP_SIDE = 1500


def grid(logical: str) -> np.ndarray:
    b = open(resolve_by_name(logical), "rb").read()
    rows, cols = struct.unpack_from(">HH", b, 0)
    return np.frombuffer(b, np.uint8, offset=4, count=rows * cols).reshape(rows, cols)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map

    raw = open(resolve_by_name("map/%s/cn/logic_background.bytes" % m), "rb").read()
    rows, cols = struct.unpack_from(">HH", raw, 0)
    if (rows, cols) != (MAP_SIDE, MAP_SIDE):
        raise SystemExit("⛔ logic_background 头 %dx%d ≠ %d²" % (rows, cols, MAP_SIDE))
    if len(raw) != 4 + rows * cols:
        raise SystemExit("⛔ logic_background 长度 %d ≠ 4+%d" % (len(raw), rows * cols))
    cells = np.frombuffer(raw, np.uint8, offset=4).reshape(rows, cols)

    # ── 交叉校验：cell 级带 ⊆ 对应块带（build_blocks 的真映射） ─────────────
    snow_blocks = grid("map/%s/cn/ground_snow.bytes" % m) != 0
    desert_blocks = grid("map/%s/cn/ground_desert.bytes" % m) != 0
    if snow_blocks.shape != (GRID_SIDE, GRID_SIDE):
        raise SystemExit("⛔ ground_snow 网格 %s ≠ %d²" % (snow_blocks.shape, GRID_SIDE))
    bi = (np.arange(MAP_SIDE) - ORIGIN) // BLOCK_TILES        # 块 i 覆盖 [10i-10, 10i)
    snow_cov = snow_blocks[bi[:, None], bi[None, :]]
    desert_cov = desert_blocks[bi[:, None], bi[None, :]]
    in_snow = int(((cells == 2) & snow_cov).sum())
    in_desert = int(((cells == 3) & desert_cov).sum())
    n_snow, n_desert = int((cells == 2).sum()), int((cells == 3).sum())
    if in_snow != n_snow or in_desert != n_desert:
        raise SystemExit("⛔ 带归属与块层不符：值2 命中率 %d/%d、值3 %d/%d（应全中）"
                         % (in_snow, n_snow, in_desert, n_desert))
    both = int(((cells == 2) & desert_cov).sum()) + int(((cells == 3) & snow_cov).sum())
    both_blocks = int((snow_blocks & desert_blocks).sum())

    # ── 落盘 ────────────────────────────────────────────────────────────
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "bands.bytes"), "wb").write(raw)
    sha = hashlib.sha256(raw).hexdigest()

    payload = encode(raw[4:])
    b64 = base64.b64encode(payload).decode("ascii")
    vals, cnts = np.unique(cells, return_counts=True)
    info = {
        "schemaVersion": 1, "mapId": m,
        "grid": {"rows": rows, "cols": cols, "headerBytes": 4,
                 "order": "行主序（与 res.bytes / ground_*.bytes 同，⛔ 与 river 列主序不同）"},
        "byteLength": len(raw), "sha256": sha,
        "values": {int(v): int(c) for v, c in zip(vals.tolist(), cnts.tolist())},
        "semantics": "GROUND_TYPE_NAMES（const.lua def_enum，[干净集]）：2=雪 3=沙，其余回退基础季"
                     "（check_ground_type 的 `or \"ground\"`，[disasm] map_mgr）。"
                     "⛔ autumn 不接（M0-B3）。",
        "bandCells": {"snow": n_snow, "desert": n_desert},
        "crossCheck": {"值2落在雪块": in_snow, "值3落在沙块": in_desert,
                       "双带块": both_blocks,
                       "双带块内逐格分布": {int(v): int(c) for v, c in zip(
                           *np.unique(cells[snow_cov & desert_cov], return_counts=True))},
                       "雪值落在沙块+沙值落在雪块": both,
                       "mapping": "复用 build_blocks.py 的 BLOCK_TILES=%d / ORIGIN=%d / GRID_SIDE=%d"
                                  % (BLOCK_TILES, ORIGIN, GRID_SIDE)},
        "rleBytes": len(payload),
    }
    json.dump(info, open(os.path.join(d, "bands.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    chunks = [b64[i:i + 110] for i in range(0, len(b64), 110)]
    body = "\n".join('    "%s",' % c for c in chunks)
    ts = '''/**
 * mapOriginal **cell 级地貌带**（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 原版 `check_ground_type(row, col)` = `GROUND_TYPE_NAMES[logic_background 格值] or "ground"`
 *   （枚举定义是**干净集** `const.lua:252`：1=ground 2=snow 3=desert；查表在 map_mgr，disasm）。
 *   ⇒ 选件带归属是**逐格单值**，⛔ 不是「格在雪块/沙块内」：雪/沙块带 489 块双挂（§1.3），
 *   块级判据会把雪块里 38,066 个草地格误换雪件；cell 级那 489 块里逐格各有唯一定论。
 * ★ 打包期已交叉校验：值 2 格 100%% 落在 snow 块内、值 3 格 100%% 落在 desert 块内
 *   （复用 build_blocks.py 的块→格映射 BLOCK_TILES=10 / ORIGIN=-10）。
 * ⚠ 回退照抄原版：格值不是 2/3（含 7/8/9/11/13/16/17/18）一律按基础季件，⛔ 不许发明第四带。
 * ⚠ `autumn_*` 不接（M0-B3 已拍板山体换回基础季）。
 * ⚠ 与通行层同一套 varint-RLE + base64；权威产物是 kit 数据目录的 `bands.bytes`
 *   （原版字节原样，4B 大端 u16 头），一致性由 `mapOriginal-content.test.ts` 钉住。
 */

/** 原版 GROUND_TYPE 枚举值（const.lua def_enum 序）。 */
export const MAPO_BAND_GROUND = 1;
export const MAPO_BAND_SNOW = 2;
export const MAPO_BAND_DESERT = 3;

export const MAPO_BAND_MAP_ID = "%s";
export const MAPO_BAND_ROWS = %d;
export const MAPO_BAND_COLS = %d;
/** ⚠ 原版头是 **4B** 大端 u16 rows/cols，⛔ 与 terrain.bytes 的 8B u32 头不同。 */
export const MAPO_BAND_HEADER_BYTES = 4;
export const MAPO_BAND_SHA256 = "%s";

/** varint-RLE + base64 的带数据；⛔ 数组元素而非 `a + b` 长链（长链会撑爆 Creator 转译器）。 */
export const MAPO_BAND_RLE_B64 = [
%s
].join("");
''' % (m, m, rows, cols, sha, body)
    open(os.path.join(d, "bands.data.ts"), "w", encoding="utf-8").write(ts)

    print("  带格数：雪 %d / 沙 %d（其余回退基础季 %d）"
          % (n_snow, n_desert, rows * cols - n_snow - n_desert))
    print("  交叉校验：值2 ⊆ 雪块 %d/%d、值3 ⊆ 沙块 %d/%d；双带块 %d（其内 雪 %d / 沙 %d / 草 %d）"
          % (in_snow, n_snow, in_desert, n_desert, both_blocks,
             info["crossCheck"]["双带块内逐格分布"].get(2, 0),
             info["crossCheck"]["双带块内逐格分布"].get(3, 0),
             info["crossCheck"]["双带块内逐格分布"].get(1, 0)))
    print("→ bands.bytes %d B  sha %s" % (len(raw), sha[:16]))
    print("→ bands.data.ts  RLE %d B（%.1f%%）/ base64 %.0f KB"
          % (len(payload), 100.0 * len(payload) / (rows * cols), len(b64) / 1024))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
