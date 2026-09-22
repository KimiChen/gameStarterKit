#!/usr/bin/env python3
"""ELP 素材反查：把 hash 命名的 126,061 个文件改回真实资源路径。

    python3 build_name_map.py            # 全量反查，产物落 out/
    python3 build_name_map.py --stats    # 只打印覆盖率统计

原理见 namehash.py 的模块注释。候选路径来自四处：
  ① ELP 内所有 txt/xml/json 里出现的路径型字符串（材质 / prefab / 图集描述）
  ② 游戏自带的资源总索引（atlas_xml_2_sprite_dict / all_ignore_files）
  ③ sourceVersion 的 Lua 字符串语料
  ④ `map/<赛季小写>/cn/<层文件>` 的组合枚举（赛季与文件名取自 map_path_config.lua）
再对每条候选做**扩展名替换**（.tga/.png 源名 → 包内 .ktx），这是 KTX 能被点名的关键。

⛔ 产物只落 out/（已 gitignore）；⛔ 原始素材永远留仓外只读。
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from namehash import namehash, strip_asset  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
ELP = CFG["elpRoot"]
# ★ 多根：APK 解包树 + CDN 解包树（容器目录名 <md5>_<size>，⛔ 不会撞车）
ELP_ROOTS = [ELP] + list(CFG.get("elpRootsExtra", []))


def elp_dirs():
    """遍历所有根下的容器目录。"""
    for r in ELP_ROOTS:
        root = os.path.join(r, "files")
        if not os.path.isdir(root):
            continue
        for d in os.scandir(root):
            if d.is_dir():
                yield d
SV = CFG["sourceVersionRoot"]
OUT = os.path.join(HERE, CFG["outDir"])

PATH_RE = re.compile(rb"[A-Za-z0-9_\-./]{5,200}")
IMG_RE = re.compile(rb'imagePath="([^"]+)"')
# 包内实际存在的贴图扩展名（构建期从 tga/png/psd 转出）
TEX_EXT = ("ktx", "png", "win.ktx", "astc", "pvr", "jpg", "tga", "bytes", "bin")
SRC_EXT = ("tga", "png", "psd", "jpg", "ktx", "exr", "bmp", "dds")

# map_path_config.lua 的赛季目录（VFS 里是小写）
SEASONS = [s.lower() for s in (
    "S1 S1-1 S1-2 S1-3 S1-4 S1-4-1 S1-PK24 S1-PK28 S2 S2-3 S2-4 S3 PKG1 SS1 SS2 SS3 SS4 SS5 "
    "NS0 NS1 DS1 DS1-1 DS1-2 DS2 DS2-3 DS3 GD1 HL3 HZ1 M4 M9 XF1 XF24 DQ1 "
    "AUTOCHESS1 AUTOCHESS2 AUTOCHESS2-1 AUTOCHESS3 AUTOCHESS3-1 AUTOCHESS4 AUTOCHESS4-1 AUTOCHESS5"
).split()] + ["pk%d" % i for i in range(3, 31)] + [
    "pk18-1", "pk19-1", "pk21-1", "pk23-1", "pk23-2", "pk27-1", "pk28-1"]
MAP_FILES = (
    "res.bytes res_multi.bytes res_attach.bytes ground2.bytes ground_snow.bytes ground_desert.bytes "
    "logic_background.bytes logic_road.bytes river.bytes river_attach.bytes river_attach_back.bytes "
    "river_area_id.bytes waterway.bytes highland.bytes highland_logic_client.bytes decorate.bytes "
    "mountain_patch.bytes birth_point.bytes city.bytes piers.bytes road_info.bytes map_region.bytes "
    "map_region_attach.bytes map_region_attach_back.bytes map_block_attach.bytes map_block_attach_back.bytes "
    "map_dynamic_block_attach.bytes map_server_attach.bytes client_gen_province_weather.bytes "
    "client_gen_weather_alpha.bytes river_path.json river_area_info.json waterway_path.json "
    "ground_snow_path.json ground_desert_path.json highland_path.json mountain_effect.json "
    "street_static_config.json city_gate_wall_static_config.json street.static_scene "
    "city_gate_wall.static_scene river_color_mask.ktx river_color_mask.win.ktx ice_mask.png "
    "ice_sampler.ktx ice_sampler_5th.ktx"
).split()


def load_index() -> dict:
    """hash(u64) -> (container, idx, ext, rsize)"""
    idx = {}
    for d in elp_dirs():
        mf = os.path.join(d.path, "_manifest.json")
        if not os.path.exists(mf):
            continue
        for row in json.load(open(mf))["files"]:
            idx[int(row[1], 16)] = (d.name, row[0], row[6], row[4])
    return idx


def collect_candidates() -> set:
    cand = set()
    # ① ELP 内文本资产
    for d in elp_dirs():
        for fe in os.scandir(d.path):
            if fe.name == "_manifest.json":
                continue
            if fe.name.rsplit(".", 1)[-1] not in ("txt", "xml", "json"):
                continue
            try:
                blob = open(fe.path, "rb").read()
            except OSError:
                continue
            for m in PATH_RE.findall(blob):
                s = m.decode("ascii", "ignore")
                if "/" in s and "." in s.rsplit("/", 1)[-1]:
                    cand.add(s)
    # ② 资源总索引（键是图集 xml 路径，值是被合图吃掉的源图）
    for d in elp_dirs():
        for fe in os.scandir(d.path):
            if not fe.name.endswith(".json") or fe.stat().st_size < 10_000_000:
                continue
            try:
                j = json.load(open(fe.path))
            except (ValueError, OSError):
                continue
            if "atlas_xml_2_sprite_dict" not in j:
                continue
            cand.update(j["atlas_xml_2_sprite_dict"].keys())
            for v in j["atlas_xml_2_sprite_dict"].values():
                cand.update(v)
            for key in ("all_ignore_files", "all_ignore_files_by_same_file"):
                cand.update(j.get(key, []))
    # ③ Lua 字符串语料
    corpus = os.path.join(SV, "data", "strings_corpus.txt")
    if os.path.exists(corpus):
        blob = open(corpus, "rb").read()
        for m in PATH_RE.findall(blob):
            s = m.decode("ascii", "ignore")
            if "/" in s and "." in s.rsplit("/", 1)[-1]:
                cand.add(s)
    # ④ 地图数据层组合
    for se in SEASONS:
        for fn in MAP_FILES:
            cand.add("map/%s/cn/%s" % (se, fn))
    return cand


def resolve(cand: set, idx: dict) -> dict:
    res = {}

    def put(q: str) -> None:
        """登记一条候选。

        ⚠ ★ 包里的 namehash 有的按**原样**路径算、有的按**全小写**算
          （`scene/ground/grass/MiddleLevel_01_group.prefab.bin` 只在小写下命中）。
          ⛔ 只试原样会把常规季草地那几件关键 prefab 判成「不在包里」——实际在。
          同源坑：赛季目录 VFS 里是小写 `s1`，而 `map_path_config.lua` 写大写 `S1`。
        """
        for form in (q, q.lower()) if q != q.lower() else (q,):
            if form in res:
                return
            if namehash(form) in idx:
                res[form] = namehash(form)
                return

    for s in cand:
        q = strip_asset(s)
        put(q)
        # ★ 编译型资源（prefab/mesh/material/timeline）在包里是**追加** `.bin`
        for ap in (".bin", ".txt"):
            put(q + ap)
        base, _, ext = q.rpartition(".")
        if base and ext.lower() in SRC_EXT:
            for ne in TEX_EXT:
                put("%s.%s" % (base, ne))
    # 图集页：<xml 所在目录>/<imagePath>
    for k in [k for k in list(res) if k.endswith(".xml")]:
        cont, i, _ext, _sz = idx[res[k]]
        hit = []
        for r in ELP_ROOTS:
            cd = os.path.join(r, "files", cont)
            if os.path.isdir(cd):
                hit = [p for p in os.scandir(cd) if p.name.startswith("%03d_" % i)]
                if hit:
                    break
        if not hit:
            continue
        m = IMG_RE.search(open(hit[0].path, "rb").read(4096))
        if not m:
            continue
        img = m.group(1).decode("ascii", "ignore")
        d = k.rsplit("/", 1)[0]
        for q in (d + "/" + img, d + "/atlas_tex/" + img, img):
            put(q)
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stats", action="store_true", help="只打印统计，不落盘")
    args = ap.parse_args()

    idx = load_index()
    print("ELP 条目 %d" % len(idx), flush=True)
    cand = collect_candidates()
    print("候选路径 %d" % len(cand), flush=True)
    res = resolve(cand, idx)
    print("★ 命名 %d / %d (%.1f%%)" % (len(res), len(idx), 100.0 * len(res) / len(idx)))

    by_ext = collections.Counter(idx[h][2] for h in res.values())
    print("按包内扩展名:", by_ext.most_common(10))
    by_top = collections.Counter(k.split("/")[0] for k in res)
    print("按顶层目录:", by_top.most_common(12))

    if args.stats:
        return 0
    os.makedirs(OUT, exist_ok=True)
    rows = {}
    for p, h in sorted(res.items()):
        cont, i, ext, sz = idx[h]
        rows[p] = {"hash": "%016x" % h, "container": cont, "idx": i, "ext": ext, "size": sz}
    with open(os.path.join(OUT, "name_map.json"), "w", encoding="utf-8") as fo:
        json.dump(rows, fo, ensure_ascii=False, indent=1, sort_keys=True)
    named = set(res.values())
    unnamed = collections.Counter(idx[h][2] for h in idx if h not in named)
    with open(os.path.join(OUT, "coverage.json"), "w", encoding="utf-8") as fo:
        json.dump({"total": len(idx), "named": len(res),
                   "named_by_ext": dict(by_ext), "unnamed_by_ext": dict(unnamed)},
                  fo, ensure_ascii=False, indent=1)
    print("→ %s/name_map.json, coverage.json" % OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
