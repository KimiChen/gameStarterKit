#!/usr/bin/env python3
"""原版地图数据层 -> mapOriginal 内容包（terrain.bytes + 调色板 + 原始层留档）。

    /tmp/maporiginal-venv/bin/python build_terrain.py [--map s1]

★ **值空间就是原版的，且逐字节等于 `res.bytes`**（2026-09-22 M0-B1）：
   `terrain.bytes` 每格存**原版 `res` 原值**，⛔ 不再用 `res_multi` 顶替 `res == 0`。
   `res` 的非零值**就是多格地形的锚点**（docs/MAPORIGINAL-2D.md §3.1），
   早先 `merged = np.where(res == 0, multi, res)` 把 142,958 个覆盖格填成了锚点值，
   **销毁了锚点信息** —— 那正是本 kit 当初不得不发明连通域的唯一原因。⛔ 别再合并。

   **覆盖掩码**留在 `raw/multi.bytes`（原版 `res_multi` 原件）：它只回答「这格属于哪个件」，
   ⛔ 不参与出图（§3.1），通行层由它派生。

语义（权威：`asset/config/S1/cn/res_pro/terrain_attr.lua` + 本轮统计判据）：

| 值 | 含义 |
|---|---|
| 1 | 平地 |
| 2..41 | **资源地块**：`类型 = (v-2)//10`（0..3，四种等量）、`等级 = (v-2)%10 + 1`（1..10） |
| 42..46 | **金矿** 等级 1..5（`gold-new` 恰好 5–6 张资产，对得上） |
| 47 | 河流（⛔ 不可通行） |
| 48..61 | **「山」族 14 形的锚点**（`山1..山14`，§3.2）：48..51 单格、52..54 两格、55 四格、
          57..59 七格、60/61 十九格；值 56（山9）无 2D prefab，数据里 0 命中 |
| 0 | **被多格地形覆盖的非锚点格**（142,958 格）：原版这里由 `terrain` 层整片出件、
     `res` 层不画（§2.1 第 3 道门），底下仍是普通地表 |

⚠ **这两个下标是怎么定死的**（⛔ 别再按 LAND_TYPE 去读 `(v-2)%10+2`，那是早先的误读）：
  ① 块下标（`(v-2)//10`）四挡计数几乎完全相等（240044/240058/240153/240124），
     相邻同值率 24.9%（随机恰好 25%），且**在各半径上恒为 1.50** ⇒ 是**资源类型**，与位置无关；
  ② 块内下标（`(v-2)%10`）随「离地图中心的距离」**单调递减**（3.26 → 1.33）
     ⇒ 是**地块等级**（三战的高级地在中心）。
  ③ 相应地，森林/丘陵/山地这些**地貌**不在 2..41 里，它们是 48..61 的多格地形。
⚠ 四种资源（甲乙丙丁）↔ 木/铁/石/粮 的**对应关系静态数据里定不了**（在资源注册表/服务端）。
  本管线按 `类型0→木、1→铁、2→石、3→粮` 取美术，⚠ 这是**假设**，可能是个置换。
⚠ 本 kit 把 48..61 拆成「山脉 / 林丛 / 散落」三粗类是**本仓自创的分类**，原版是**一族 14 形**；
  这三个 kind 目前只用于**垫底色**，件的形与贴图一律走 `mountain_forms.FORMS`。
⚠ `logic_background` 相邻同值率 96.5%（随机 41.9%）⇒ 它是**地貌分区层**，⛔ 不是逐格美术变体；
  静态数据里**没有**逐格美术变体，近档的 4 款变体片是本仓自己加的去重复手段。
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
from ctable_cw import BaseCw  # noqa: E402
from decode_ktx import resolve_by_name  # noqa: E402

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

RES_TYPES = ["wood", "iron", "stone", "food"]          # ⚠ 假设的次序，见模块注释
RES_TYPE_CN = ["木", "铁", "石", "粮"]
# 多格地形类型（res_multi 值）→ 粗类
MULTI_KIND = {60: "mountain", 61: "mountain",
              57: "grove", 58: "grove", 59: "grove",
              52: "grove", 53: "grove", 54: "grove", 55: "grove",
              48: "scatter", 49: "scatter", 50: "scatter", 51: "scatter"}
# 粗类 → 底色与通行。⚠ 底色只是垫底：资源格真正的样子由**摆件层的原版 res_field**给。
KIND_STYLE = {
    "plain":    ("平地", True, (137, 148, 100)),
    "resource": ("资源", True, (150, 152, 98)),
    "gold":     ("金矿", True, (176, 160, 100)),
    "river":    ("河流", False, (70, 120, 160)),
    "mountain": ("山地", False, (123, 130, 126)),
    "grove":    ("林丛", True, (95, 118, 80)),
    "scatter":  ("散落地物", True, (130, 145, 98)),
    "unknown":  ("未定性", True, (120, 120, 120)),
}
KINDS = list(KIND_STYLE)


def classify_value(v: int) -> tuple:
    """原版值 -> (粗类, 中文名, 可通行, 颜色, 资源类型|None, 等级|None)。"""
    if v == 0:
        # ★ 多格地形的覆盖格：原版 res 层不画它（§2.1 第 3 道门），底下就是普通地表 ⇒
        #   垫底沿用平地。⚠ 真正的原版底是 block 级的一张底纹整数次 REPEAT（§1.4，M2-B1 才做）。
        _cn, passable, color = KIND_STYLE["plain"]
        return ("plain", "多格地形覆盖", passable, color, None, None)
    if v == 1:
        cn, passable, color = KIND_STYLE["plain"]
        return ("plain", cn, passable, color, None, None)
    if 2 <= v <= 41:
        t, lv = (v - 2) // 10, (v - 2) % 10 + 1
        cn, passable, color = KIND_STYLE["resource"]
        return ("resource", "%s·%d级" % (RES_TYPE_CN[t], lv), passable, color, t, lv)
    if 42 <= v <= 46:
        cn, passable, color = KIND_STYLE["gold"]
        return ("gold", "金矿·%d级" % (v - 41), passable, color, 4, v - 41)
    if v == 47:
        cn, passable, color = KIND_STYLE["river"]
        return ("river", cn, passable, color, None, None)
    kind = MULTI_KIND.get(v)
    if kind:
        cn, passable, color = KIND_STYLE[kind]
        return (kind, "%s·%d" % (cn, v), passable, color, None, None)
    cn, passable, color = KIND_STYLE["unknown"]
    return ("unknown", "%s·%d" % (cn, v), passable, color, None, None)


def load_layer(logical: str):
    blob = open(resolve_by_name(logical), "rb").read()
    rows, cols = struct.unpack_from(">HH", blob, 0)
    arr = np.frombuffer(blob, np.uint8, offset=4, count=rows * cols).reshape(rows, cols)
    return rows, cols, arr, blob


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    mid = a.map

    rows, cols, res, res_blob = load_layer("map/%s/cn/res.bytes" % mid)
    _, _, multi, multi_blob = load_layer("map/%s/cn/res_multi.bytes" % mid)
    _, _, ground, ground_blob = load_layer("map/%s/cn/logic_background.bytes" % mid)
    print("原版层 %dx%d：res %d 值 / multi %d 值 / ground %d 值"
          % (rows, cols, len(np.unique(res)), len(np.unique(multi)), len(np.unique(ground))))

    # ★ M0-B1：显示层 = **res 原值**，⛔ 不再 merge。覆盖掩码是 res_multi 本身（留档 raw/multi.bytes）。
    disp = np.ascontiguousarray(res).astype(np.uint8)
    body = struct.pack(">II", rows, cols) + disp.tobytes()

    # 通行层：0 可走陆地 / 1 河流 / 2 山地。⚠ 水域已并入河流（原版海与河同为 47）
    # ★ **挡路集由 `base.cw` 的 `land.is_block` 直给**（2026-09-23 解开，⛔ 不再硬编码 60/61）：
    #   实测 land id **1..46 全部可通行、47..61 全部挡路**（47 名「河」、48..61 名「山1..山14」）。
    #   ⇒ §3.1 那条「覆盖格继承多格 land 的 is_block ⇒ 整片挡路」由 `[推断]` 变**实证**。
    # ⚠ 早先只挡 multi ∈ {60,61}（43,533 格），**少挡了 154,552 格** ——
    #   1/2/4/7 格的山形（48..55、57..59）同样 is_block，⛔ 别再按「只有大山挡路」想。
    cw = BaseCw()
    land = cw.rows(cw.tables()["land"])      # ★ 真解码器：目录 → land 表 → 展平成 id → 行
    blocking = {i for i, r in land.items() if r.get("is_block") is True}
    present = set(np.unique(res).tolist()) | set(np.unique(multi).tolist())
    blk_here = sorted(v for v in present if v in blocking)
    if 47 not in blk_here:
        raise SystemExit("⛔ land 表里 47（河）不挡路？结构读错了")
    mountain_ids = [v for v in blk_here if v >= 48]
    pas = np.zeros(disp.shape, np.uint8)
    pas[res == 47] = 1
    pas[np.isin(multi, mountain_ids)] = 2
    pass_body = struct.pack(">II", rows, cols) + pas.tobytes()

    d = os.path.join(OUT, "pack", mid)
    os.makedirs(os.path.join(d, "raw"), exist_ok=True)
    open(os.path.join(d, "terrain.bytes"), "wb").write(body)
    open(os.path.join(d, "terrain.pass.bytes"), "wb").write(pass_body)
    for nm, blob in (("res", res_blob), ("multi", multi_blob), ("ground", ground_blob)):
        open(os.path.join(d, "raw", nm + ".bytes"), "wb").write(blob)

    counts = np.bincount(disp.ravel(), minlength=64)
    palette = []
    for v in range(64):
        kind, cn, passable, color, rtype, level = classify_value(v)
        if counts[v] == 0:
            continue
        entry = {"id": v, "kind": kind, "cn": cn, "passable": bool(passable),
                 "color": list(color), "tiles": int(counts[v])}
        if rtype is not None:
            entry["resType"] = int(rtype)
            entry["level"] = int(level)
        palette.append(entry)

    info = {
        "schemaVersion": 2, "mapId": mid, "maxRow": rows, "maxCol": cols,
        "byteLength": len(body), "sha256": hashlib.sha256(body).hexdigest(),
        "passSha256": hashlib.sha256(pass_body).hexdigest(),
        "valueSpace": "原版 res 值**原样**（逐字节等于 res.bytes 的体）；0 = 多格地形覆盖格",
        "coverMask": "raw/multi.bytes（原版 res_multi）；通行层的山地由它的 60/61 派生",
        "rule": "1 平地；2..41 资源(类型=(v-2)//10、等级=(v-2)%10+1)；42..46 金矿 1..5 级；"
                "47 河流；48..61 山族 14 形的锚点（⛔ 无 56）；0 被多格地形覆盖",
        "resTypeAssumption": "类型0→木、1→铁、2→石、3→粮（⚠ 假设，静态数据定不了，可能是置换）",
        "palette": palette,
        "passPalette": [{"id": 0, "name": "land", "cn": "可走陆地", "passable": True,
                         "color": [137, 148, 100], "tiles": int((pas == 0).sum())},
                        {"id": 1, "name": "river", "cn": "河流", "passable": False,
                         "color": [70, 120, 160], "tiles": int((pas == 1).sum())},
                        {"id": 2, "name": "mountain", "cn": "山地", "passable": False,
                         "color": [123, 130, 126], "tiles": int((pas == 2).sum())}],
        "passNote": "挡路集取自 base.cw 的 land.is_block（实测 1..46 通行 / 47..61 挡路）；"
                    "山地按**整片足迹**挡路（res_multi ∈ 挡路集）—— 由 [推断] 升为实证",
        "blockingLandIds": blk_here,
        "mountainLandIds": mountain_ids,
        "source": {"upstream": "《三国志·战略版》2084.1768",
                   "layers": ["map/%s/cn/res.bytes" % mid, "map/%s/cn/res_multi.bytes" % mid,
                              "map/%s/cn/logic_background.bytes" % mid],
                   "authority": "asset/config/S1/cn/res_pro/terrain_attr.lua"},
    }
    json.dump(info, open(os.path.join(d, "terrain.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    tot = rows * cols
    print("terrain.bytes %d B  sha256 %s  调色板 %d 条"
          % (len(body), info["sha256"][:16], len(palette)))
    import collections
    bykind = collections.Counter()
    for e in palette:
        bykind[e["kind"]] += e["tiles"]
    for k, n in bykind.most_common():
        print("   %-9s %8d  %5.2f%%" % (k, n, 100.0 * n / tot))
    print("→ %s" % d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
