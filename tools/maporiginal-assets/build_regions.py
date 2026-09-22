#!/usr/bin/env python3
"""原版「山」族件的**摆放表** `regions.bin`。

    /tmp/maporiginal-venv/bin/python build_regions.py [--map s1]

★ 摆放**完全由原版数据定**，⛔ 零连通域、零启发式、零随机（2026-09-22 M0-B1 改）：

  ① **主表 = `res.bytes` 的 55,127 个非零锚点**（值 48..61）。
     `res` 的非零值**就是锚点**、`res_multi` 只是「这格属于哪个件」的覆盖掩码
     （docs/MAPORIGINAL-2D.md §3.1，六项判据实测全中）。件的形与贴图由值直接查
     `mountain_forms.FORMS`，⛔ 不按区的跨度挑。
  ② **补件 = `mountain_patch.bytes` 的 3,942 条**（§3.4）：落在大山**内部**的
     `res==0` 格上，作用是打散 19m 大件平铺的重复感。件 id 与 res **同一值空间**。

⚠ 早先这里做的是「res 与 res_multi 合并 → 八邻连通域 → 每区一件」：
  合并那一步 `np.where(res == 0, multi, res)` **把 142,958 个覆盖格填成了锚点值**，
  自己销毁了锚点信息 —— 连通域是为了补救它才发明的。⛔ 别再合并、别再求连通域。

⚠ 足迹表每次构建都**回代校验**（`mountain_forms.verify_footprints`），
  命中率 < 99.9% 直接退出。实测 198,086 命中 / 2 不符（与 §3.1 的「2 例」逐字复现）。

输出记录（8 B，大端，按 s 升序 = 画家序，⛔ 客户端不再排）：
    u16 s      = row + col          （屏幕 y 单调量：y = -halfH*(s+1)）
    u16 d      = row - col + 1500   （屏幕 x：x = halfW*(d-1500)）
    u8  cell   = **原版 res 值**（= 件形，直接查 region.data.ts 的格）
    u8  wTiles = 该形足迹的等距横跨度（半宽数），诊断/裁剪用
    u16 cells  = 该形足迹格数（1/2/4/7/19）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import mountain_forms as MF  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

D_BIAS = 1500                    # d = row - col + D_BIAS，保证非负


def load_layer(logical: str) -> bytes:
    return open(resolve_by_name(logical), "rb").read()


def grid(logical: str) -> np.ndarray:
    b = load_layer(logical)
    rows, cols = struct.unpack_from(">HH", b, 0)
    return np.frombuffer(b, np.uint8, offset=4, count=rows * cols).reshape(rows, cols)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map

    res = grid("map/%s/cn/res.bytes" % m)
    multi = grid("map/%s/cn/res_multi.bytes" % m)

    # ★ 足迹表回代校验（不过就退出）
    fp_stats = MF.verify_footprints(res, multi)
    fp_ok = sum(x["命中"] for x in fp_stats.values())
    fp_bad = sum(x["不符"] for x in fp_stats.values())

    layout = {c["id"] for c in json.load(
        open(os.path.join(OUT, "pack", m, "region-atlas.info.json"), encoding="utf-8"))["cells"]}
    if layout != set(MF.VALUES):
        raise SystemExit("⛔ region 图集的格 id 与山族值不符：%s" % sorted(layout ^ set(MF.VALUES)))

    out, by_value = [], {}
    # ① 主表：res 的非零锚点
    for v in MF.VALUES:
        ar, ac = np.nonzero(res == v)
        by_value[v] = int(len(ar))
        w, n = MF.d_span(v), len(MF.footprint_cells(v, 0))
        s = (ar + ac).astype(np.int64)
        d = (ar.astype(np.int64) - ac) + D_BIAS
        out.extend((int(s[i]), int(d[i]), v, w, n) for i in range(len(ar)))
    n_anchor = len(out)
    if n_anchor != int(np.isin(res, MF.VALUES).sum()):
        raise SystemExit("⛔ 锚点计数不自洽")

    # ② 补件：mountain_patch.bytes
    raw = load_layer("map/%s/cn/mountain_patch.bytes" % m)
    n_patch = int.from_bytes(raw[:3], "big")
    if 3 + 5 * n_patch != len(raw):
        raise SystemExit("⛔ mountain_patch 布局不符：3+5×%d ≠ %d" % (n_patch, len(raw)))
    rec = np.frombuffer(raw[3:], np.uint8).reshape(n_patch, 5)
    prow = rec[:, 0].astype(np.int64) * 256 + rec[:, 1]
    pcol = rec[:, 2].astype(np.int64) * 256 + rec[:, 3]
    part = rec[:, 4]
    bad_art = sorted(set(part.tolist()) - set(MF.VALUES))
    if bad_art:
        raise SystemExit("⛔ mountain_patch 出现山族外的件 id：%s" % bad_art)
    # ⚠ 补件**不一定**落在 res==0 的覆盖格上：实测 13 条落在别的件的**锚点格**，
    #   即那一格同时出两件（原版第二遍补件本来就是叠上去的）。分三类落盘供机检对钉。
    patch_by_value = {}
    on_cover = on_anchor_same = on_anchor_diff = 0
    for i in range(n_patch):
        v = int(part[i])
        patch_by_value[v] = patch_by_value.get(v, 0) + 1
        here = int(res[prow[i], pcol[i]])
        if here == 0:
            on_cover += 1
        elif here == v:
            on_anchor_same += 1
        else:
            on_anchor_diff += 1
        out.append((int(prow[i] + pcol[i]), int(prow[i] - pcol[i]) + D_BIAS, v,
                    MF.d_span(v), len(MF.footprint_cells(v, 0))))

    out.sort(key=lambda t: (t[0], t[1]))              # 画家序：屏幕从上到下
    body = b"".join(struct.pack(">HHBBH", *t) for t in out)
    blob = struct.pack(">I", len(out)) + body
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "regions.bin"), "wb").write(blob)
    info = {
        "schemaVersion": 2, "mapId": m, "count": len(out),
        "recordBytes": 8, "headerBytes": 4, "dBias": D_BIAS,
        "byteLength": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
        "layout": "大端：u16 s(row+col), u16 d(row-col+dBias), u8 cell(=原版 res 值), "
                  "u8 wTiles(足迹横跨度/半宽), u16 cells(足迹格数)；按 s 升序",
        "anchors": n_anchor, "patches": n_patch,
        "anchorsByValue": by_value, "patchesByValue": patch_by_value,
        "patchPlacement": {"落在覆盖格": on_cover, "落在同值锚点格": on_anchor_same,
                           "落在异值锚点格": on_anchor_diff},
        "footprints": {str(v): {"shape": MF.FORMS[v][3], "form": MF.FORMS[v][1],
                                "cells": len(MF.footprint_cells(v, 0)), "dSpan": MF.d_span(v)}
                       for v in MF.VALUES},
        "footprintCheck": {"命中": fp_ok, "不符": fp_bad,
                           "命中率": round(fp_ok / max(fp_ok + fp_bad, 1), 6),
                           "逐值": {str(k): v for k, v in fp_stats.items()}},
        "coverMask": {"res_multi 非零": int((multi != 0).sum()),
                      "60/61 覆盖格": int(((multi == 60) | (multi == 61)).sum()),
                      # ★ 挡路集取自 base.cw 的 land.is_block（实测 47..61 全挡）
                      "挡路覆盖格": int(np.isin(multi, MF.VALUES).sum()),
                      "res 非锚点(==0)": int((res == 0).sum()),
                      "锚点处 res==multi": int((res[res != 0] == multi[res != 0]).sum())},
        "source": {
            "anchors": "map/%s/cn/res.bytes 的非零值 48..61（= 锚点，§3.1）" % m,
            "cover": "map/%s/cn/res_multi.bytes（覆盖掩码，⛔ 不参与出件）" % m,
            "patches": "map/%s/cn/mountain_patch.bytes（第二遍补件，§3.4）" % m,
        },
    }
    json.dump(info, open(os.path.join(d, "regions.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("  锚点 %d（%s）" % (n_anchor, " ".join("%d:%d" % kv for kv in sorted(by_value.items()))))
    print("  补件 %d（%s）" % (n_patch, " ".join("%d:%d" % kv for kv in sorted(patch_by_value.items()))))
    print("  足迹回代 命中 %d / 不符 %d（%.4f%%）" % (fp_ok, fp_bad, 100.0 * fp_ok / (fp_ok + fp_bad)))
    print("→ regions.bin %d 条 / %.0f KB  sha %s" % (len(out), len(blob) / 1024, info["sha256"][:16]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
