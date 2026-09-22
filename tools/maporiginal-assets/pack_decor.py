#!/usr/bin/env python3
"""摆件图集 = 原作的 **res_field**：按「资源类型 × 等级」直接用原版地物图。

    /tmp/maporiginal-venv/bin/python pack_decor.py [--map s1]

★ **按原游戏的参数摆放**：原作近档是「底图 + 逐格 res_field 单位」，而这个单位由该格的
   `res` 值（类型 + 等级）决定 —— ⛔ 不是我们撒的随机件。所以图集**按原版值建格**：
     格 id = 原版值（2..46）⇒ 客户端拿到某格的值就直接查到该放哪张图，零猜测。
   城址另占几格（64 起），由 `city_center.lua` 的真坐标驱动。

★ **季/地貌变体（N1）**：`base.cw` 的 `land` 表每地块类型有 `client_res_id` /
   `snow_client_res_id` / `desert_client_res_id` 三套件列（⛔ `autumn_*` 不接，M0-B3），
   353 个 land 里 113 个的雪/沙件与基础件不同；本 kit 消费的 45 个资源值**全在**其列。

★ **类型/等级与贴图全部从 land 表读出**（2026-09-23 N1 改），⛔ 不再按文件名/次序猜：
   land 行的套件列 → `client_res` 的 `src_name` → prefab → **主 sprite**（有贴图、贴图长在
   本套件树内、面积最大者；阴影/特效剔除）。早先的 `RES_TYPES = [wood, iron, stone, food]`
   次序假设被 land 表证伪 —— 真值是 **wood / stone / food / iron**
   （land 12..21 名「N级石料」→ `stone-new/`、22..31「N级粮食」→ `food-new/`、
   32..41「N级铁矿」→ `iron-new/`；`land.name` 与 `client_res.src_name` 两列互证），
   旧次序把 12..41 的铁/石/粮**轮转错位**，本批随变体一起改正。
   ⚠ 资源件是 `dummy_prefab`（引擎运行期拼组），本 kit 一层一格一件 ⇒ 取**主片**；
   个别 prefab 没进 name_map（基础季铁矿 5/8/9/10 级）或没有可用 sprite
   （雪地/基础季粮草 1/2 级全是阴影占位）⇒ 用**同套同类的最近一级**顶上并记进 info。
   ⚠ 件的 prefab `scale` 不落地：摆件层语义是「世界尺寸 = 原图像素」（⛔ 不乘 scale），
   实测各套件的 scale 几乎全 1（最大例外 1.39），差异记进 info 的 `prefabScale` 备查。
   ⚠ 资源件的 sprite `size` 是**显示矩形**，不恒等于贴图像素（同一 prefab 里同一张
   `3.png` 能摆成 50×58 与 49×49 两份）⇒ ⛔ 别抄山族件「size == 原图像素」那条硬等，
   `native` 仍取贴图像素；尺寸差出 2 倍才说明贴图挑错（入库闸）。

素材来源：`scene/resource{,_snow,_desert}/{wood,stone,food,iron,gold}-new/png/<级>.png`
（切自 `scene/_output_atlas_scene/atlas_tex/resource*.xml`，雪/沙切片**同在这三份图集**里）。
⚠ 图集 4096×2048（16×10 格）：三套件 45×3 + 城址 8 = 143 格 > 2048² 的 80 格位，故加宽一倍
  —— 选单图而不是按套分三张，是因为一屏会混着两种带（带界穿屏），单图集单材质才能继续
  一张 mesh 合批。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import land_variants as LV  # noqa: E402
from build_tops import normalize  # noqa: E402  ★ 贴图路径归一化（剥 mutil 前缀与 @@材质名）

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])
PNG = os.path.join(OUT, "png")

CELL_W, CELL_H = 256, 192
GRID_COLS, GRID_ROWS = 16, 10
ATLAS_W, ATLAS_H = 4096, 2048
CITY_BASE = 64                       # 城址件从这一格起
CITY_HINTS = ("main_city", "npc_city", "player_city")
# ★ 三套件的树名（贴图路径判据）。⛔ 顺序即落盘序：基础季 → 雪 → 沙。
VARIANTS = (("base", "resource"), ("snow", "resource_snow"), ("desert", "resource_desert"))
PREFAB_RE = re.compile(r"^scene/resource(?:_snow|_desert)?/([a-z]+)-new/[a-z]+_(\d+)_group\.prefab$")


def load_sprites() -> tuple:
    """-> (城址候选 [路径], 切片索引 {logical 小写: 路径})。"""
    rows = [json.loads(x) for x in open(os.path.join(OUT, "sprites.jsonl"), encoding="utf-8")]
    cities: list = []
    sliced: dict = {}
    for r in rows:
        lg, p = r["logical"], os.path.join(OUT, r["out"])
        if not os.path.exists(p):
            continue
        if lg.startswith("scene/resource"):
            sliced[lg.lower()] = p
            continue
        if any(h in lg for h in CITY_HINTS) and "mask" not in lg and "effect" not in lg:
            try:
                w, h = Image.open(p).size
            except OSError:
                continue
            if 120 <= w <= 600 and 80 <= h <= 600:
                cities.append((w * h, p, lg))
    cities.sort(reverse=True)
    return cities, sliced


def nearest(levels: dict, want: int):
    """该级读不到时取同套同类最近的一级。⛔ 不留空格（空格 = 屏幕上一片资源地没东西）。"""
    if not levels:
        return None, None
    key = min(levels, key=lambda k: (abs(k - want), k))
    return levels[key], key


def resolve_art(rid: int, tree: str, sliced: dict) -> tuple:
    """套件 prefab → 主片贴图。-> dict | None（读不到 = prefab 缺失或无可用 sprite）。"""
    src = LV.res_src_name(rid)
    if not src:
        return None
    m = PREFAB_RE.match(src.lower())
    if not m:
        raise SystemExit("⛔ %s 不像资源件 prefab —— land 表或 client_res 绑错行了" % src)
    try:
        s = LV.main_sprite(src, tree)
    except SystemExit:
        s = None                                    # ⚠ prefab 没进 name_map（缺件）
    if s is None:
        return None
    logical = normalize(s["tex"])
    p = sliced.get(logical.lower())
    if p is None:
        raise SystemExit("⛔ 切片没落位：%s —— 先跑 slice_atlas.py --all" % logical)
    w, h = Image.open(p).size
    rw, rh = w / max(s["size"][0], 1), h / max(s["size"][1], 1)
    if not (0.5 <= rw <= 2 and 0.5 <= rh <= 2):
        raise SystemExit("⛔ %s 的 prefab size %s 与切片 %s 差出 2 倍 —— 贴图对应搞错了"
                         % (src, s["size"], [w, h]))
    return {"type": m.group(1), "level": int(m.group(2)), "path": p, "source": logical,
            "prefab": src, "prefabScale": round(float(s["scale"][0]), 6)}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", default="s1")
    a = ap.parse_args()
    cities, sliced = load_sprites()
    print("城址候选 %d 张；资源三套件切片 %d 张" % (len(cities), len(sliced)))

    # ── 第一遍：45 个值 × 三套件，从 land 表读套件 prefab 的主片 ─────────
    arts: dict = {}                                # (variant, value) → art | None
    variant_ids: dict = {}
    types: dict = {}
    for v in range(2, 47):
        ids = LV.variant_res_ids(v)
        variant_ids[v] = ids
        found = []
        for var, tree in VARIANTS:
            rid = ids[var] or ids["base"]          # ⚠ 原版没配雪/沙件 ⇒ 该套件回基础季
            art = resolve_art(rid, tree, sliced) if rid else None
            arts[(var, v)] = art
            if art:
                found.append((art["type"], art["level"]))
        if not found:
            raise SystemExit("⛔ 值 %d 三套件一个都读不出来" % v)
        # ★ 三套件读出的类型/等级必须一致（⛔ 防 land↔client_res↔prefab 绑定漂移）
        if len(set(found)) != 1:
            raise SystemExit("⛔ 值 %d 的三件套类型/等级不一致：%s" % (v, found))
        types[v] = found[0]

    # ── 第二遍：缺级的用同套同类最近一级顶上 ────────────────────────────
    substitutions: dict = {"base": [], "snow": [], "desert": []}
    by_variant_type: dict = {}
    for (var, v), art in arts.items():
        if art:
            by_variant_type.setdefault((var, art["type"]), {})[art["level"]] = art
    for v in range(2, 47):
        t, lv = types[v]
        for var, _tree in VARIANTS:
            if arts[(var, v)] is None:
                near, used = nearest(by_variant_type.get((var, t), {}), lv)
                if near is None:
                    raise SystemExit("⛔ %s 的 %s 整类读不到主片（值 %d）" % (var, t, v))
                arts[(var, v)] = near
                substitutions[var].append("%d(%s用%d级)" % (v, t, used))

    atlas = Image.new("RGBA", (ATLAS_W, ATLAS_H), (0, 0, 0, 0))
    cells = []

    def place(slot: int, path: str, meta: dict) -> None:
        im = Image.open(path).convert("RGBA")
        native = [im.width, im.height]          # ★ 原图像素 = 原版尺寸的唯一依据
        im.thumbnail((CELL_W, CELL_H), Image.LANCZOS)
        gx, gy = (slot % GRID_COLS) * CELL_W, (slot // GRID_COLS) * CELL_H
        ox, oy = (CELL_W - im.width) // 2, (CELL_H - im.height)      # ⚠ 底对齐：地物立在格上
        atlas.paste(im, (gx + ox, gy + oy), im)
        cells.append({"cell": [gx, gy, CELL_W, CELL_H],
                      "art": [ox, oy, im.width, im.height], "native": native, **meta})

    # 落盘序：基础季 45（槽 0..44）→ 城址 8（45..52）→ 雪 45（53..97）→ 沙 45（98..142）
    for v in range(2, 47):
        t, lv = types[v]
        art = arts[("base", v)]
        place(v - 2, art["path"], {"id": v, "kind": "res", "variant": "base", "resType": t,
                                   "level": lv, "source": art["source"],
                                   "prefab": art["prefab"], "prefabScale": art["prefabScale"]})
    for i, (_area, path, lg) in enumerate(cities[:8]):
        place(45 + i, path, {"id": CITY_BASE + i, "kind": "city", "variant": "base",
                             "source": lg})
    for k, (var, _tree) in enumerate(VARIANTS[1:]):
        for v in range(2, 47):
            t, lv = types[v]
            art = arts[(var, v)]
            place(53 + (k - 0) * 45 + (v - 2), art["path"],
                  {"id": v, "kind": "res", "variant": var, "resType": t, "level": lv,
                   "source": art["source"], "prefab": art["prefab"],
                   "prefabScale": art["prefabScale"]})

    d = os.path.join(OUT, "pack", a.map)
    os.makedirs(d, exist_ok=True)
    atlas.save(os.path.join(d, "decor-atlas.png"))
    info = {"schemaVersion": 3, "mapId": a.map, "cell": [CELL_W, CELL_H],
            "gridCols": GRID_COLS, "gridRows": GRID_ROWS, "size": [ATLAS_W, ATLAS_H],
            "anchor": "bottom-center", "cityBase": CITY_BASE,
            "indexing": "格 id = 原版 res 值（2..46）；城址件从 cityBase 起；"
                        "变体格同 id 空间、按 variant 分表（N1）",
            "variants": {"来源": "base.cw land 表 client_res_id/snow_client_res_id/"
                                 "desert_client_res_id（⛔ autumn 不接，M0-B3）；"
                                 "类型/等级取套件 prefab 名（三套件互校，不一致即退出）",
                         "resIds": {str(v): variant_ids[v] for v in range(2, 47)}},
            "substitutions": substitutions,
            "cells": cells}
    json.dump(info, open(os.path.join(d, "decor-atlas.info.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    shared = '''/**
 * mapOriginal 摆件图集布局（%s）—— **生成物，⛔ 勿手改**。
 *
 * ★ 格 id = **原版 res 值**（2..46）：客户端拿到某格的值就直接查到该放哪张图，⛔ 零猜测。
 *   这是「按原游戏参数摆放」的落点——原作近档就是逐格一个 res_field，由该格的类型+等级决定。
 * ★ **季/地貌变体**（N1）：`MAPO_DECOR_CELLS` 是基础季 + 城址，`MAPO_DECOR_SNOW_CELLS` /
 *   `MAPO_DECOR_DESERT_CELLS` 是雪/沙两套（id 同样是原版 res 值）。哪格用哪套由
 *   `logic/mapoBands.ts` 的 cell 级地貌带定（原版 `check_ground_type` 同一条数据链）；
 *   原版没配变体件的值**打包期已回退基础季件**，客户端按表查即可，⛔ 不要在运行时补逻辑。
 *   ⚠ `autumn_*` 不接（M0-B3 已拍板）。
 * ★ 类型/等级与贴图都**从 `land` 表读出**（套件列 → client_res → prefab 主片），⛔ 不按
 *   文件名/次序猜 —— 早先的 `wood/iron/stone/food` 次序假设被 land 表证伪（真值
 *   wood/stone/food/iron），旧映射把 12..41 的铁/石/粮轮转错位，N1 已随变体改正。
 * ★ `native` 是**原图像素尺寸**：原版 2D 一格 300×150 px（config_2d 的 TILE_WIDTH/HEIGHT 是半值），
 *   所以件的世界宽 = native[0] × (MAPO_TILE_HALF_W / 150)。⛔ 别再按固定格宽拉伸
 *   （那会把等级差抹平）。
 * ⚠ 锚点是**底边中点**（地物立在菱形中心上），⛔ 不是几何中心。
 * ⚠ 原版个别级的 prefab 缺/无可用 sprite，用同套同类最近一级顶上（`MAPO_DECOR_SUBSTITUTIONS`）。
 */

export interface IMapoDecorCell {
  readonly id: number;
  readonly kind: string;
  /** 基础季 / 雪 / 沙（N1）。 */
  readonly variant: string;
  readonly cell: readonly [number, number, number, number];
  readonly art: readonly [number, number, number, number];
  /** ★ **原图像素尺寸**（切片时的原始大小）。件在世界里多大由它定，⛔ 不是按格拉伸。 */
  readonly native: readonly [number, number];
  readonly resType?: string;
  readonly level?: number;
}

export const MAPO_DECOR_ATLAS_W = %d;
export const MAPO_DECOR_ATLAS_H = %d;
export const MAPO_DECOR_CELL_W = %d;
export const MAPO_DECOR_CELL_H = %d;
/** 城址件的起始格 id；`city_center.lua` 的 249 座城按真坐标落在这里。 */
export const MAPO_DECOR_CITY_BASE = %d;
/** 原版缺级、用邻近级顶上的记录（只作存证），按套件分键。 */
export const MAPO_DECOR_SUBSTITUTIONS: %s = %s;
/** 基础季（含城址件）。 */
export const MAPO_DECOR_CELLS: readonly IMapoDecorCell[] = %s;
/** 雪地件（id = 原版 res 值）。 */
export const MAPO_DECOR_SNOW_CELLS: readonly IMapoDecorCell[] = %s;
/** 沙漠件（id = 原版 res 值）。 */
export const MAPO_DECOR_DESERT_CELLS: readonly IMapoDecorCell[] = %s;
''' % (a.map, ATLAS_W, ATLAS_H, CELL_W, CELL_H, CITY_BASE,
       "Readonly<Record<string, readonly (number | string)[]>>",
       json.dumps(substitutions, ensure_ascii=False),
       json.dumps([{k: v for k, v in c.items() if k not in ("source", "prefab", "prefabScale")}
                   for c in cells if c["variant"] == "base"], ensure_ascii=False, indent=2),
       json.dumps([{k: v for k, v in c.items() if k not in ("source", "prefab", "prefabScale")}
                   for c in cells if c["variant"] == "snow"], ensure_ascii=False, indent=2),
       json.dumps([{k: v for k, v in c.items() if k not in ("source", "prefab", "prefabScale")}
                   for c in cells if c["variant"] == "desert"], ensure_ascii=False, indent=2))
    open(os.path.join(d, "decor.data.ts"), "w", encoding="utf-8").write(shared)
    print("摆件 %d 格（基础 %d + 雪 %d + 沙 %d，含城址 %d）"
          % (len(cells), sum(1 for c in cells if c["variant"] == "base"),
             sum(1 for c in cells if c["variant"] == "snow"),
             sum(1 for c in cells if c["variant"] == "desert"),
             sum(1 for c in cells if c["kind"] == "city")))
    print("缺级替代：基础 %s；雪 %s；沙 %s"
          % (substitutions["base"] or "无", substitutions["snow"] or "无",
             substitutions["desert"] or "无"))
    print("→ %s/decor-atlas.png (%.1f MB)" % (d, os.path.getsize(os.path.join(d, "decor-atlas.png")) / 1e6))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
