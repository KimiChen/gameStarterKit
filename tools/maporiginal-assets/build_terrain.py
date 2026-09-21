#!/usr/bin/env python3
"""原版地图数据层 -> mapOriginal 内容包（terrain.bytes + 调色板 + 原始层留档）。

    /tmp/maporiginal-venv/bin/python build_terrain.py [--map s1]

输入（仓外只读，按真名反查）：
    map/<id>/cn/res.bytes             1500x1500  主地块层，字节值 = LAND_TYPE / TERRAIN_TYPE
    map/<id>/cn/res_multi.bytes       1500x1500  多格地形（本体格的类型）
    map/<id>/cn/logic_background.bytes 1500x1500 地表底色

输出 out/pack/<id>/：
    terrain.bytes      **本仓格式**：8B 大端头 (u32 rows, u32 cols) + 行主序 u8 的**显示类**
    terrain.info.json  尺寸 / sha256 / 调色板（含原版 id 与 passable）/ 管线溯源
    raw/{res,multi,ground}.bytes  原版三层原值留档（4B 头照抄），⛔ 供将来扩展，v1 不消费

语义（2026-09-22 实测，权威表 asset/config/S1/cn/res_pro/terrain_attr.lua）：
    res==1                 LAND 平地
    2 <= res <= 41         资源/地形地块：LAND_TYPE = (res-2)%10 + 2，(res-2)//10 是 4 款变体
                           2木 3石 4粮 5铁 6金 7水 8森林 9湿地 10荒漠 11丘陵
    42 <= res <= 46        未定性（格数 7321/2924/1363/402/100 递减，像是要塞/关隘分级）
    res==47                RIVER 河流
    res==0 或 res>=48      **多格地形本体/锚点**，类型取 res_multi：
                           60/61 平均 26 格、最大 228 ⇒ 山脉（⛔ 不可通行）
                           57/58/59 平均 8 格 ⇒ 林丛；52..55 中小；48..51 单格地物
⚠ 字节值就是资源 id：`res_bytes_id_map.lua` 的 id 集合跳过 56，而数据里 56 恰好零命中。
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
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

# 显示类调色板。color 是 LOD0 平涂与远档鸟瞰共用的基色（贴图没到货时的兜底）。
PALETTE = [
    ("plain",    "平地",   True,  (137, 148, 100)),
    ("wood",     "木材",   True,  (104, 132,  78)),
    ("stone",    "石料",   True,  (150, 148, 112)),
    ("food",     "粮田",   True,  (166, 168,  96)),
    ("iron",     "铁矿",   True,  (128, 124, 116)),
    ("gold",     "金矿",   True,  (176, 160, 100)),
    ("water",    "水域",   False, (96, 128, 138)),
    ("forest",   "森林",   True,  (86, 112,  74)),
    ("wetland",  "湿地",   True,  (112, 132, 104)),
    ("desert",   "荒漠",   True,  (176, 166, 124)),
    ("hill",     "丘陵",   True,  (150, 148, 112)),
    ("river",    "河流",   False, (70, 120, 160)),
    ("mountain", "山地",   False, (123, 130, 126)),
    ("grove",    "林丛",   True,  (95, 118,  80)),
    ("scatter",  "散落地物", True, (130, 145,  98)),
    ("special",  "特殊地块", True, (170, 140, 110)),
]
NAME2ID = {n: i for i, (n, _cn, _p, _c) in enumerate(PALETTE)}
# 通行层（4 类）：0 可走陆地 / 1 河流 / 2 山地 / 3 水域。
# ⚠ 为什么要单独一层：16 类全分辨率层一阶熵 2.95 bit/格、zlib 都只到 772 KB，
#   varint-RLE 反而胀到 125.6%（3.95 MB TS）—— ⛔ 塞不进 shared 模块。
#   通行层游程平均 19.2，RLE 后 237 KB / base64 309 KB，与 sgzzmap 的 282 KB 同量级。
PASS_PALETTE = [("land", "可走陆地", True, (137, 148, 100)),
                ("river", "河流", False, (70, 120, 160)),
                ("mountain", "山地", False, (123, 130, 126)),
                ("water", "水域", False, (96, 128, 138))]
PASS_OF = {"river": 1, "mountain": 2, "water": 3}
# LAND_TYPE -> 显示类
LT2CLASS = {2: "wood", 3: "stone", 4: "food", 5: "iron", 6: "gold",
            7: "water", 8: "forest", 9: "wetland", 10: "desert", 11: "hill"}
# res_multi -> 显示类（按团块规模实测定性）
MULTI2CLASS = {60: "mountain", 61: "mountain",
               57: "grove", 58: "grove", 59: "grove",
               52: "grove", 53: "grove", 54: "grove", 55: "grove",
               48: "scatter", 49: "scatter", 50: "scatter", 51: "scatter"}


def load_layer(logical: str):
    blob = open(resolve_by_name(logical), "rb").read()
    rows, cols = struct.unpack_from(">HH", blob, 0)
    arr = np.frombuffer(blob, np.uint8, offset=4, count=rows * cols).reshape(rows, cols)
    return rows, cols, arr, blob


def classify(res: np.ndarray, multi: np.ndarray) -> np.ndarray:
    out = np.full(res.shape, NAME2ID["plain"], np.uint8)
    lt = ((res.astype(np.int16) - 2) % 10) + 2
    m = (res >= 2) & (res <= 41)
    for v, name in LT2CLASS.items():
        out[m & (lt == v)] = NAME2ID[name]
    out[(res >= 42) & (res <= 46)] = NAME2ID["special"]
    out[res == 47] = NAME2ID["river"]
    body = (res == 0) | (res >= 48)
    for v, name in MULTI2CLASS.items():
        out[body & (multi == v)] = NAME2ID[name]
    out[res == 1] = NAME2ID["plain"]
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default=SEL_MAP_DEFAULT if (SEL_MAP_DEFAULT := "s1") else "s1")
    a = ap.parse_args()
    mid = a.map

    rows, cols, res, res_blob = load_layer("map/%s/cn/res.bytes" % mid)
    _, _, multi, multi_blob = load_layer("map/%s/cn/res_multi.bytes" % mid)
    _, _, ground, ground_blob = load_layer("map/%s/cn/logic_background.bytes" % mid)
    print("原版层 %dx%d：res %d 值 / multi %d 值 / ground %d 值"
          % (rows, cols, len(np.unique(res)), len(np.unique(multi)), len(np.unique(ground))))

    cls = classify(res, multi)
    body = struct.pack(">II", rows, cols) + cls.tobytes()
    assert len(body) == 8 + rows * cols

    pas = np.zeros(cls.shape, np.uint8)
    for name, pid in PASS_OF.items():
        pas[cls == NAME2ID[name]] = pid
    pass_body = struct.pack(">II", rows, cols) + pas.tobytes()

    d = os.path.join(OUT, "pack", mid)
    os.makedirs(os.path.join(d, "raw"), exist_ok=True)
    open(os.path.join(d, "terrain.bytes"), "wb").write(body)
    open(os.path.join(d, "terrain.pass.bytes"), "wb").write(pass_body)
    for nm, blob in (("res", res_blob), ("multi", multi_blob), ("ground", ground_blob)):
        open(os.path.join(d, "raw", nm + ".bytes"), "wb").write(blob)

    counts = np.bincount(cls.ravel(), minlength=len(PALETTE))
    info = {
        "schemaVersion": 1, "mapId": mid, "maxRow": rows, "maxCol": cols,
        "byteLength": len(body), "sha256": hashlib.sha256(body).hexdigest(),
        "palette": [{"id": i, "name": n, "cn": cn, "passable": p,
                     "color": list(c), "tiles": int(counts[i])}
                    for i, (n, cn, p, c) in enumerate(PALETTE)],
        "passPalette": [{"id": i, "name": n, "cn": cn, "color": list(c), "passable": p,
                         "tiles": int((pas == i).sum())}
                        for i, (n, cn, p, c) in enumerate(PASS_PALETTE)],
        "passSha256": hashlib.sha256(pass_body).hexdigest(),
        "layering": "16 类显示层走 Cocos BufferAsset（全分辨率、近档选片用）；"
                    "4 类通行层走 shared TS 模块（首帧轮廓 + 通行判定）。"
                    "⚠ 16 类层熵 2.95 bit/格，RLE 胀到 125.6%，⛔ 进不了 shared。",
        "source": {
            "upstream": "《三国志·战略版》2084.1768",
            "layers": ["map/%s/cn/res.bytes" % mid, "map/%s/cn/res_multi.bytes" % mid,
                       "map/%s/cn/logic_background.bytes" % mid],
            "rule": "res==1 平地；2..41 → LAND_TYPE=(res-2)%10+2；42..46 特殊；47 河流；"
                    "res==0 或 >=48 取 res_multi（60/61 山地，57..59/52..55 林丛，48..51 散落）",
            "authority": "asset/config/S1/cn/res_pro/terrain_attr.lua",
        },
    }
    json.dump(info, open(os.path.join(d, "terrain.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    tot = rows * cols
    print("terrain.bytes %d B  sha256 %s" % (len(body), info["sha256"][:16]))
    for i, (n, cn, p, _c) in enumerate(PALETTE):
        if counts[i]:
            print("   %-9s %-6s %8d  %5.2f%%  %s" % (n, cn, counts[i], 100.0 * counts[i] / tot,
                                                     "" if p else "⛔不可通行"))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
