#!/usr/bin/env python3
"""多格地形 → **区域摆件表** `regions.bin`。

    /tmp/maporiginal-venv/bin/python build_regions.py [--map s1]

★ 两个来源，**原版优先**：
  ① `map/s1/cn/mountain_patch.bytes` —— 原版自己的大件摆放表（本轮逆出来的）：
     `[u24 BE 条数][条数 × {u16 row, u16 col, u8 件id}]`，3 + 5n 与文件长度**逐字节吻合**。
     3,942 条，密度约 1 件 / 20 格：3578 格的大山区摆 14 件，中位 7 格的小区一件不摆。
     ⇒ 有原版锚点的连通区**只用原版的**，⛔ 不再叠自己的。
  ② 没有任何原版锚点的连通区：**每区一件**（用户拍板的做法），锚在区内**屏幕最低格**、
     按区的等距尺寸缩放。这样 2.3 万个小林丛/散落区不会是平菱形。

⚠ 值→族的分组（连通域在**族内**求，⛔ 不是逐值求）：
    山脉 60/61、林丛 52..55+57..59、散落 48..51。
  逐值求会把一座山劈成两半（60 和 61 交错出现在同一座山上）。

输出记录（8 B，大端，按 s 升序 = 画家序，⛔ 客户端不再排）：
    u16 s      = row + col          （屏幕 y 单调量：y = -halfH*(s+1)）
    u16 d      = row - col + 1500   （屏幕 x：x = halfW*(d-1500)）
    u8  cell   = 摆件图集格 id（region 段）
    u8  wTiles = 件宽（格数）
    u16 cells  = 该区格数（诊断 + 客户端上限校验用）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import struct
import sys

import numpy as np
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
ROOT = CFG["elpRoot"]

D_BIAS = 1500                    # d = row - col + D_BIAS，保证非负
# ⚠ 族的次序即族 id，与 region.data.ts 的 kind 对应；⛔ 改了要同步 pack_decor.py
FAMILIES = [("mountain", [60, 61]), ("grove", [52, 53, 54, 55, 57, 58, 59]),
            ("scatter", [48, 49, 50, 51])]
# 原版锚点件的固定宽度（格）；兜底件按区尺寸算但夹在 [1, cap]
ANCHOR_TILES = {"mountain": 7, "grove": 4, "scatter": 2}
FALLBACK_CAP = {"mountain": 12, "grove": 8, "scatter": 3}


def load_layer(name: str) -> bytes:
    nm = json.load(open(os.path.join(OUT, "name_map.json"), encoding="utf-8"))
    e = nm[name]
    d = os.path.join(ROOT, "files", e["container"])
    for f in os.listdir(d):
        if f.startswith("%03d_" % e["idx"]) and e["hash"] in f:
            return open(os.path.join(d, f), "rb").read()
    raise SystemExit("⛔ 取不到 " + name)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    m = a.map

    res = np.frombuffer(load_layer("map/%s/cn/res.bytes" % m)[4:], np.uint8).reshape(1500, 1500)
    multi = np.frombuffer(load_layer("map/%s/cn/res_multi.bytes" % m)[4:], np.uint8).reshape(1500, 1500)
    merged = np.where(res == 0, multi, res)

    raw = load_layer("map/%s/cn/mountain_patch.bytes" % m)
    n_anchor = int.from_bytes(raw[:3], "big")
    if 3 + 5 * n_anchor != len(raw):
        raise SystemExit("⛔ mountain_patch 布局不符：3+5×%d ≠ %d" % (n_anchor, len(raw)))
    rec = np.frombuffer(raw[3:], np.uint8).reshape(n_anchor, 5)
    arow = rec[:, 0].astype(np.int32) * 256 + rec[:, 1]
    acol = rec[:, 2].astype(np.int32) * 256 + rec[:, 3]
    aart = rec[:, 4]                      # 原版件 id（⚠ 与 res 值不同空间）

    layout = json.load(open(os.path.join(OUT, "pack", m, "region-atlas.info.json"), encoding="utf-8"))
    by_kind: dict = {}
    for c in layout["cells"]:
        by_kind.setdefault(c["kind"], []).append(c["id"])
    for k in by_kind:
        by_kind[k].sort()

    st = ndimage.generate_binary_structure(2, 2)      # 八邻：等距斜角也算连着
    out, stats = [], {}
    art_ids = sorted(set(aart.tolist()))
    for fam, vals in FAMILIES:
        cells_of = by_kind.get(fam)
        if not cells_of:
            raise SystemExit("⛔ region 图集缺 %s 件" % fam)
        mask = np.isin(merged, vals)
        lab, k = ndimage.label(mask, st)
        sizes = np.bincount(lab.ravel(), minlength=k + 1)
        sizes[0] = 0
        infam = mask[arow, acol]
        anchored = np.zeros(k + 1, bool)
        anchored[lab[arow[infam], acol[infam]]] = True
        anchored[0] = False

        # ① 原版锚点：件的选择由原版的 art id 定（映射到本图集的第几张），⛔ 不用哈希
        ar, ac, ai = arow[infam], acol[infam], aart[infam]
        for i in range(len(ar)):
            r, c = int(ar[i]), int(ac[i])
            cid = cells_of[art_ids.index(int(ai[i])) % len(cells_of)]
            out.append((r + c, r - c + D_BIAS, cid, ANCHOR_TILES[fam],
                        int(sizes[lab[r, c]])))

        # ② 无锚连通区：每区一件，锚在区内**屏幕最低格**（row+col 最大）
        todo = np.where(~anchored[1:])[0] + 1
        if len(todo):
            rr, cc = np.nonzero(mask)
            ll = lab[rr, cc]
            s_all = rr.astype(np.int64) + cc
            d_all = rr.astype(np.int64) - cc
            order = np.argsort(ll, kind="stable")
            ll, rr, cc, s_all, d_all = ll[order], rr[order], cc[order], s_all[order], d_all[order]
            starts = np.searchsorted(ll, np.arange(1, k + 2))
            keep = np.zeros(k + 1, bool)
            keep[todo] = True
            for li in todo:
                lo, hi = starts[li - 1], starts[li]
                if lo >= hi:
                    continue
                s_seg, d_seg = s_all[lo:hi], d_all[lo:hi]
                j = int(np.argmax(s_seg))            # 屏幕最低的那一格
                w = int(d_seg.max() - d_seg.min()) + 1   # 等距横向跨度（格）
                w = max(1, min(w, FALLBACK_CAP[fam]))
                # 件的选择：族内按**区的等距跨度**挑（大区用大件），⛔ 不用随机
                cid = cells_of[min(len(cells_of) - 1, (w - 1) * len(cells_of) // FALLBACK_CAP[fam])]
                out.append((int(s_seg[j]), int(d_seg[j]) + D_BIAS, cid, w, int(hi - lo)))
        stats[fam] = {"格数": int(mask.sum()), "连通区": int(k),
                      "原版锚点": int(infam.sum()), "有锚区": int(anchored.sum()),
                      "兜底区": int(len(todo))}

    out.sort(key=lambda t: (t[0], t[1]))              # 画家序：屏幕从上到下
    body = b"".join(struct.pack(">HHBBH", *t) for t in out)
    blob = struct.pack(">I", len(out)) + body
    d = os.path.join(OUT, "pack", m)
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "regions.bin"), "wb").write(blob)
    info = {
        "schemaVersion": 1, "mapId": m, "count": len(out),
        "recordBytes": 8, "headerBytes": 4, "dBias": D_BIAS,
        "byteLength": len(blob), "sha256": hashlib.sha256(blob).hexdigest(),
        "layout": "大端：u16 s(row+col), u16 d(row-col+dBias), u8 cell, u8 wTiles, u16 cells；按 s 升序",
        "families": {f: v for f, v in FAMILIES},
        "anchorTiles": ANCHOR_TILES, "fallbackCap": FALLBACK_CAP,
        "stats": stats,
        "source": {
            "anchors": "map/%s/cn/mountain_patch.bytes（原版大件摆放表，[u24 条数][{u16 row,u16 col,u8 件id}]）" % m,
            "fallback": "res/res_multi 合并层的八邻连通域，每个**无原版锚点**的区补一件",
        },
    }
    json.dump(info, open(os.path.join(d, "regions.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    for f, s in stats.items():
        print("  %-9s %s" % (f, s))
    print("→ regions.bin %d 条 / %.0f KB  sha %s" % (len(out), len(blob) / 1024, info["sha256"][:16]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
