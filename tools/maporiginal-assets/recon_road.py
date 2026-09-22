#!/usr/bin/env python3
"""道路层数据链勘察（M3-B1 的前置）。⚠ **只勘察、不出产物**。

    /tmp/maporiginal-venv/bin/python recon_road.py [--map s1]

★ **坐标系已定（干净集直给）**：`asset/config/S1/cn/res_pro/road_info.lua` 的 `layer_info`

    { width = 1125, height = 1125, grid_width = 200, aridJheighi = 100 }

  ⚠ `aridJheighi` 是 **KS[11] 定点损坏**的键名，用 MAPORIGINAL-2D §1.5 那组已知差量
  （差位 idx 0/4/10、XOR `0x06 / 0x15 / 0x1D`）还原正是 **`grid_height`** ——
  该差量组文档原记「四中四」，这是**第五例命中**。
  ⇒ 一个路格 = **半宽 200 / 半高 100**（逻辑格是 150 / 75）= **4/3 个逻辑格**；
    1500 × 3/4 = **1125** 与 `width/height` 精确自洽。

★ **两份数据是同一份**：`road_info.lua` 的 `tiles` 与 `road_info.bytes` 的记录都是 **42,018** 条，
  逐条 key/value 完全吻合 —— 但 ⚠ **bytes 的第一个 u16 是 col、第二个才是 row**（转置！
  按 (row,col) 读只有 115/42018 对上，按 (col,row) 读 **42018/42018**）。
  lua 侧的键是客户端格键 `(row << 16) | col`。

★ `road_info.bytes` 结构（⛔ 推翻「半文本未解」的旧说法 —— 可打印只占 15.6%，是二进制）：

    [u8 组数 = 37]
    [37 × {u8 a（70..87 = ASCII 'F'..'W'）, u8 b（0/1）}]   ← 75 B 前缀
    [u16 BE rows = 1125][u16 BE cols = 1125]                 ← 与其它层同款网格头
    [42,018 × {u16 BE col, u16 BE row, u8 类型 1..37}]

  75 + 4 + 42018×5 = **210,169 B**，与文件长度精确相等。

★ **片是制图期烘死的**（⚠ 本脚本上一版曾据「记录只带组号」推断成「运行时按邻接拼」，
  **那是错的**：那个 u8 不是组号，是 `type_info` 的下标）。`type_info` 37 条，
  每条 `{client_res id ∈ 1170..1187, 水平翻转 ±1, 1}`。

★ **id → 精灵的绑定靠结构签名**（`client_res` 表在未解的 `base.cw` 里，查不到名字）：
  逐类型算路网**邻接度**，纯度基本 1.00，按主邻接度分桶恰好是
  **12 个 2 度 + 2 个 3 度 + 1 个 4 度 + 3 个 1 度**；而 `road.xml` 一套皮肤正是
  line 4 + horizonalturn 4 + up/downverticalturn 4 = 12 个双连、tcross 2、xcross 1、end 4。
  更进一步：id 1170..1187 的**度序列**与精灵按**完整路径字母序**排列的度序列**逐位吻合**
  （19 片去掉一片 upend 后 18 位全等）。⚠ 唯一未定的是 `upend/6-1` 还是 `6-2`
  （两者度相同且相邻，签名分不开）。

⚠ 因此 M3-B1 **已解除阻塞**，可以开工；⛔ 但别把上面这条「字母序」当干净集 ——
  它是 `[推断]`（18 位度序列全等，巧合概率极低，但仍是推断）。
"""
from __future__ import annotations

import argparse
import collections
import os
import re
import sys
import xml.etree.ElementTree as ET

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import json  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
SV = CFG["sourceVersionRoot"]
PREFIX_BYTES, GRID_BYTES, RECORD_BYTES = 75, 4, 5
KS11_DELTA = {0: 0x06, 4: 0x15, 10: 0x1D}     # MAPORIGINAL-2D §1.5 的定点修复差量
ROAD_ATLAS = "scene/_output_atlas_scene/atlas_tex/road.xml"


def ks11_fix(s: str) -> str:
    return "".join(chr(ord(c) ^ KS11_DELTA.get(i, 0)) for i, c in enumerate(s))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    season = a.map.upper()

    # ── ① 坐标系：干净集配置 ───────────────────────────────────
    lua = os.path.join(SV, "src-lua/asset/config/%s/cn/res_pro/road_info.lua" % season)
    txt = open(lua, encoding="utf-8").read()
    head = txt[: txt.index("tiles")]
    info = {k: int(v) for k, v in re.findall(r"(\w+)\s*=\s*(\d+)", head)}
    garbled = [k for k in info if k not in ("width", "height", "grid_width")]
    print("① layer_info = %s" % info)
    for k in garbled:
        print("   ⚠ 乱码键 %r → KS[11] 定点修复 → %r（第五例命中）" % (k, ks11_fix(k)))
    gh = next(info[k] for k in garbled)
    print("   ⇒ 一个路格 = 半宽 %d / 半高 %d，逻辑格是 150 / 75 ⇒ **%s 个逻辑格**"
          % (info["grid_width"], gh, "%.4g" % (info["grid_width"] / 150)))
    print("   ⇒ 1500 × %d/%d = %.1f，与 width/height = %d %s"
          % (150, info["grid_width"], 1500 * 150 / info["grid_width"], info["width"],
             "自洽 ✓" if abs(1500 * 150 / info["grid_width"] - info["width"]) < 1e-9 else "⛔ 不自洽"))

    # ── ② 两份数据互证 ────────────────────────────────────────
    tiles = {int(k): int(v) for k, v in re.findall(r"\[(\d+)\]\s*=\s*(\d+)", txt)}
    b = open(resolve_by_name("map/%s/cn/road_info.bytes" % a.map), "rb").read()
    n = (len(b) - PREFIX_BYTES - GRID_BYTES) // RECORD_BYTES
    rec = np.frombuffer(b, np.uint8, offset=PREFIX_BYTES + GRID_BYTES,
                        count=n * RECORD_BYTES).reshape(n, RECORD_BYTES).astype(int)
    A, B, t = rec[:, 0] * 256 + rec[:, 1], rec[:, 2] * 256 + rec[:, 3], rec[:, 4]
    print("② lua tiles %d 条 / bytes %d 条；字节账 %d+%d+%d×%d = %d（文件 %d，%s）"
          % (len(tiles), n, PREFIX_BYTES, GRID_BYTES, n, RECORD_BYTES,
             PREFIX_BYTES + GRID_BYTES + n * RECORD_BYTES, len(b),
             "吻合 ✓" if PREFIX_BYTES + GRID_BYTES + n * RECORD_BYTES == len(b) else "⛔"))
    for name, (r, c) in (("(row, col)", (A, B)), ("(col, row) ★", (B, A))):
        hit = sum(1 for i in range(n) if tiles.get((int(r[i]) << 16) | int(c[i])) == int(t[i]))
        print("   bytes 读作 %-14s 与 lua 逐条吻合 %d / %d" % (name, hit, n))

    # ── ③ type_info ───────────────────────────────────────────
    ti = txt[txt.index("type_info"):]
    trip = [tuple(int(x) for x in m)
            for m in re.findall(r"\{\s*(-?\d+),\s*(-?\d+),\s*(-?\d+)\s*\}", ti)]
    ids = sorted({x[0] for x in trip})
    print("③ type_info %d 条；client_res id %d..%d（%d 个，连续 %s）；翻转 %s"
          % (len(trip), min(ids), max(ids), len(ids),
             "是 ✓" if ids == list(range(min(ids), max(ids) + 1)) else "否",
             dict(collections.Counter(x[1] for x in trip))))

    # ── ④ 结构签名：邻接度 ────────────────────────────────────
    cells = {(k >> 16, k & 0xFFFF) for k in tiles}
    deg_of_id: dict = {}
    for k, v in tiles.items():
        r, c = k >> 16, k & 0xFFFF
        d = sum(1 for dr, dc in ((0, 1), (0, -1), (1, 0), (-1, 0)) if (r + dr, c + dc) in cells)
        deg_of_id.setdefault(trip[v - 1][0], collections.Counter())[d] += 1
    obs = []
    for i in ids:
        cnt = deg_of_id[i]
        top, num = cnt.most_common(1)[0]
        obs.append(top)
        if num / sum(cnt.values()) < 0.5:
            raise SystemExit("⛔ id %d 的邻接度不纯：%s" % (i, dict(cnt)))
    print("④ id %d..%d 的主邻接度：%s" % (min(ids), max(ids), obs))
    print("   分桶（度: id 数）：%s" % dict(sorted(collections.Counter(obs).items())))

    # 精灵按完整路径字母序（mask 不是路片）
    root = ET.parse(resolve_by_name(ROAD_ATLAS)).getroot()
    # ⚠ 只取 `road/` 这一套皮肤（road_ash / road_snow 是同构换皮），且 ⛔ 排除 mask（不是路片）
    names = sorted(n for n in (sp.get("n") for ta in root.findall("TextureAtlas")
                               for sp in ta.findall("sprite"))
                   if "/ground/road/" in n and "/mask/" not in n)
    deg_of_class = {"line": 2, "horizonalturn": 2, "upverticalturn": 2, "downverticalturn": 2,
                    "upend": 1, "downend": 1, "uptcross": 3, "downtcross": 3, "xcross": 4}
    exp = [deg_of_class[nm.split("/")[-2]] for nm in names]
    print("   road.xml 一套皮肤 %d 片（字母序）度：%s" % (len(names), exp))
    cand = [i for i in range(len(exp)) if [d for j, d in enumerate(exp) if j != i] == obs]
    print("   删掉第 %s 项后逐位全等 ⇒ 绑定成立，未定的只有 %s"
          % ([i for i in cand], [names[i].split("/")[-2] + "/" + names[i].split("/")[-1] for i in cand]))
    if cand:
        keep = [nm for j, nm in enumerate(names) if j != cand[0]]
        print("   ⇒ id → 精灵：")
        for i, nm in zip(ids, keep):
            print("      %d → %s" % (i, "/".join(nm.split("/")[-2:])))
    else:
        raise SystemExit("⛔ 字母序绑定不成立，别硬用")
    print("⇒ **M3-B1 已解除阻塞**（⚠ 字母序绑定是 [推断]，⛔ 别当干净集引用）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
