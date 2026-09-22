#!/usr/bin/env python3
"""核对**根资源清单**里的资源在本地（APK 解包树 + CDN 解包树）到位了没有。

    python3 verify_root_res.py                 # 全量核对
    python3 verify_root_res.py --prefix scene/ground/     # 只看某前缀

★ 根资源清单 = 包内 `config/res_config/season_all_root_res/all_root_res_list.cw`，
  NUL 分隔的 `asset/...` 路径表（本包 79,521 条）。它是「这一版**应该有**哪些资源」的权威表。
⚠ 核对靠 namehash（`namehash.py`）而不是文件名：包里所有条目都是 `<idx>_<hash16>.<嗅探扩展名>`。
⚠ 一条资源可能以**别的扩展名**落地（`.tga/.png` 源名 → 构建期转出的 `.ktx`），
  所以每条都要试一组扩展名变体，⛔ 只按原扩展名查会大面积假阴性。
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from namehash import namehash_hex  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json"), encoding="utf-8"))
ROOTS = [CFG["elpRoot"]] + list(CFG.get("elpRootsExtra", []))
# ⚠ 两类变体，⛔ 少一类就大面积假阴性：
#   ① **替换**扩展名：`.tga/.png` 源名 → 构建期转出的 `.ktx`；
#   ② **追加**后缀：`prefab/mesh/material/timeline` 这些编译型资源在包里叫
#      `<完整路径>.bin`（如 `scene/ground/desert/10_1_polygon_group.prefab.bin`）。
#      早先只试①，把 41,482 条 prefab 判成 0.2% 到位 —— 实际是 98%+。
REPLACE_EXT = ("", ".ktx", ".win.ktx", ".png", ".tga", ".bin", ".txt", ".json", ".xml")
#   ③ **全小写**路径：见下方注释
APPEND_EXT = (".bin", ".txt", ".json")
ROOT_RES_LIST = "config/res_config/season_all_root_res/all_root_res_list.cw"


def disk_index() -> dict:
    """namehash16 -> (根, 容器, 文件名)。⚠ 多根：容器目录名 <md5>_<size>，⛔ 不会撞车。"""
    idx = {}
    for r in ROOTS:
        files = os.path.join(r, "files")
        if not os.path.isdir(files):
            print("  ⚠ 根不存在，跳过：%s" % r)
            continue
        n0 = len(idx)
        for d in os.scandir(files):
            if not d.is_dir():
                continue
            for f in os.scandir(d.path):
                parts = f.name.split("_", 1)
                if len(parts) != 2:
                    continue
                idx.setdefault(parts[1].rsplit(".", 1)[0], (r, d.name, f.name))
        print("  根 %-64s +%d 条" % (os.path.basename(r), len(idx) - n0))
    return idx


def read_root_list(idx: dict) -> list:
    from decode_ktx import resolve_by_name
    try:
        p = resolve_by_name(ROOT_RES_LIST)
    except SystemExit:
        raise SystemExit("⛔ 取不到 %s —— 先跑 build_name_map.py" % ROOT_RES_LIST)
    b = open(p, "rb").read()
    return [x.decode("utf-8", "ignore") for x in b.split(b"\x00") if x.startswith(b"asset/")]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="", help="只核对这个前缀（如 scene/ground/）")
    ap.add_argument("--out", default=os.path.join(HERE, CFG["outDir"], "root_res_coverage.json"))
    a = ap.parse_args()

    print("磁盘索引：")
    idx = disk_index()
    print("  合计 %d 条目" % len(idx))

    paths = read_root_list(idx)
    want = [p for p in paths if p[6:].startswith(a.prefix)] if a.prefix else paths
    print("\n根资源清单 %d 条；本次核对 %d 条（前缀 %r）" % (len(paths), len(want), a.prefix))

    hit, miss = [], []
    for p in want:
        q = p[6:]                       # 去 asset/ 前缀
        got = None
        # ⚠ ★ 路径大小写：包里的 namehash 有的按**原样**、有的按**全小写**算
        #   （`MiddleLevel_01_group.prefab` 就只在小写下命中）。⛔ 两种都要试，
        #   只试原样会把常规季草地平地组这种关键件误判成缺失。
        #   同源坑：赛季目录 VFS 里是小写 `s1`，而 `map_path_config.lua` 写大写 `S1`。
        for form in (q, q.lower()):
            base = form.rsplit(".", 1)[0]
            for e in REPLACE_EXT:
                h = namehash_hex(base + e if e else form)
                if h in idx:
                    got = (e or "(原名)", idx[h]); break
            if got is None:
                for e in APPEND_EXT:
                    h = namehash_hex(form + e)
                    if h in idx:
                        got = ("+" + e, idx[h]); break
            if got:
                if form != q:
                    got = (got[0] + "(小写)", got[1])
                break
        (hit if got else miss).append((p, got))
    print("\n★ 到位 %d / %d（%.1f%%）；缺 %d" %
          (len(hit), len(want), 100.0 * len(hit) / max(len(want), 1), len(miss)))

    if hit:
        byext = collections.Counter(g[0] for _p, g in hit)
        print("  命中时用的扩展名:", byext.most_common(8))
        print("  样例:")
        for p, g in hit[:5]:
            print("     %-58s → %s/%s" % (p.replace("asset/", ""), g[1][1][:14], g[1][2]))
    if miss:
        byd = collections.Counter("/".join(p.split("/")[:4]) for p, _ in miss)
        print("  缺失按目录（前 12）:")
        for k, n in byd.most_common(12):
            print("     %5d  %s" % (n, k.replace("asset/", "")))

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump({"root_list": ROOT_RES_LIST, "prefix": a.prefix,
               "checked": len(want), "hit": len(hit), "miss": len(miss),
               "missing": [p for p, _ in miss]},
              open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("\n→ %s" % a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
