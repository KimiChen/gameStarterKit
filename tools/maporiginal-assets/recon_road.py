#!/usr/bin/env python3
"""`road_info.bytes` 结构勘察（M3-B1 的前置）。⚠ **只勘察、不出产物**。

    /tmp/maporiginal-venv/bin/python recon_road.py [--map s1]

★ **结构已解开**（2026-09-23 本轮，⛔ 推翻「半文本未解」的旧说法 —— 可打印字节只占 15.6%，
  它是**二进制**）：

    [u8 组数 = 37]
    [37 × {u8 a（70..87，= ASCII 'F'..'W'）, u8 b（0/1）}]      ← 75 B 前缀
    [u16 BE rows = 1125][u16 BE cols = 1125]                    ← 与其它层同款网格头
    [42,018 × {u16 BE row, u16 BE col, u8 组号 1..37}]

  75 + 4 + 42018×5 = **210,169 B，与文件长度精确相等**。
  判据：组号**非降序**且恰好 1..37、与前缀里的组数一致；row ≤ 1124 / col ≤ 1114 都 < 1125；
  42,018 个格**互不重复**。

⚠ **仍未定的是坐标系**：1125² 不是逻辑格网格（地图是 1500²，1500/1125 = 4/3 非整数）。
  实测两种换算（1:1 与 ×4/3，各试 ±1 偏移）落在 `res==1` 平地的比例都是 **~37.5%**，
  而全图平地本来就占 43.87% ⇒ **没有信号**，⛔ 两种换算都没被证实。
  ⇒ 道路层（M3-B1）**卡在这里**，⛔ 不要凭 4/3 硬做。

⚠ 另一条要回头改的推断：MAPORIGINAL-2D §4.2 由「图集片按邻接方向分成 9 类」推出
  「机制与河同构（制图期烘死）」。但**数据不支持**：每条记录只带一个**组号**（1..37），
  ⛔ 没有片号 —— 片的选择只能是**运行时按邻接算**（line / 各种 turn / end / tcross / xcross
  正是自动拼接的经典分类）。这与河流的「制图期烘死」是**两套机制**。
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from decode_ktx import resolve_by_name  # noqa: E402

PREFIX_BYTES = 75
GRID_BYTES = 4
RECORD_BYTES = 5


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    b = open(resolve_by_name("map/%s/cn/road_info.bytes" % a.map), "rb").read()

    groups = b[0]
    if 1 + 2 * groups != PREFIX_BYTES:
        raise SystemExit("⛔ 前缀长度不符：1 + 2×%d ≠ %d" % (groups, PREFIX_BYTES))
    head = [(b[1 + 2 * k], b[2 + 2 * k]) for k in range(groups)]
    rows = int.from_bytes(b[PREFIX_BYTES:PREFIX_BYTES + 2], "big")
    cols = int.from_bytes(b[PREFIX_BYTES + 2:PREFIX_BYTES + 4], "big")
    off = PREFIX_BYTES + GRID_BYTES
    if (len(b) - off) % RECORD_BYTES:
        raise SystemExit("⛔ 记录区不是 %d 的整数倍" % RECORD_BYTES)
    n = (len(b) - off) // RECORD_BYTES
    rec = np.frombuffer(b, np.uint8, offset=off, count=n * RECORD_BYTES).reshape(n, RECORD_BYTES).astype(int)
    r, c, g = rec[:, 0] * 256 + rec[:, 1], rec[:, 2] * 256 + rec[:, 3], rec[:, 4]

    print("前缀：%d 组，(a, b) = %s …" % (groups, head[:6]))
    print("      a 值域 %d..%d（= ASCII '%s'..'%s'）、b 值域 %s"
          % (min(x for x, _ in head), max(x for x, _ in head),
             chr(min(x for x, _ in head)), chr(max(x for x, _ in head)),
             sorted({y for _, y in head})))
    print("网格头：%d × %d" % (rows, cols))
    print("记录：%d 条，row %d..%d，col %d..%d，组号 %d..%d（非降序 %s）"
          % (n, r.min(), r.max(), c.min(), c.max(), g.min(), g.max(), bool((np.diff(g) >= 0).all())))
    print("      互不重复 %s；组数与前缀一致 %s"
          % (len(set(zip(r.tolist(), c.tolist()))) == n, len(set(g.tolist())) == groups))
    print("      逐组条数 %s …" % [v for _, v in sorted(collections.Counter(g.tolist()).items())][:8])
    print("字节账：%d + %d + %d×%d = %d（文件 %d，%s）"
          % (PREFIX_BYTES, GRID_BYTES, n, RECORD_BYTES,
             PREFIX_BYTES + GRID_BYTES + n * RECORD_BYTES, len(b),
             "吻合" if PREFIX_BYTES + GRID_BYTES + n * RECORD_BYTES == len(b) else "⛔ 不吻合"))

    # ⚠ 坐标系判定：两种换算都没信号
    res = np.frombuffer(open(resolve_by_name("map/%s/cn/res.bytes" % a.map), "rb").read(),
                        np.uint8, offset=4, count=1500 * 1500).reshape(1500, 1500)
    base = float((res == 1).mean())
    print("坐标系判定（全图平地占比 %.4f 作基线）：" % base)
    for name, sc in (("1:1", 1.0), ("×4/3", 1500 / 1125)):
        best = 0.0
        for o in (-1, 0, 1):
            rr = (r * sc).astype(int) + o
            cc = (c * sc).astype(int) + o
            ok = (rr >= 0) & (rr < 1500) & (cc >= 0) & (cc < 1500)
            best = max(best, float((res[rr[ok], cc[ok]] == 1).mean()))
        print("  %-5s 落在平地 %.4f（基线 %.4f）⇒ %s" % (name, best, base,
                                                       "⛔ 无信号" if best < base + 0.05 else "有信号"))
    print("⇒ **坐标系未定**，M3-B1 卡在这里，⛔ 不要凭 4/3 硬做。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
