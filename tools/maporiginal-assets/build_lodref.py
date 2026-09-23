#!/usr/bin/env python3
"""原版 **LOD 隐藏配置**两张真表 → `lodref.json` + shared TS（N3 第 2 步：交叉校验的参考数据）。

    /tmp/maporiginal-venv/bin/python build_lodref.py

★ 两张表都在 `base.cw` 里（[实测]，ctable_cw.py 解码）：
  - `map_layer_lod`     37 层：`{name, desc(中文说明), lod_hide_cfg[3]}` —— **旧档**。
  - `map_layer_lod_cfg` 64 层：`{map_layer_name, is_lod_0_hide, lod_hide_cfg[5]}` —— **现行**。
  `lod_hide_cfg[i] == 1` = 该层在第 i 档隐藏。

★ 为什么以 `map_layer_lod_cfg` 为准（三条互证）：
  ① 消费方函数名直给：`forest_grid_layer_view.lua:21` 调 `birdview_mgr:get_map_layer_lod_cfg(...)`
     （[干净集]，NEXT.md §5）。
  ② `map_layer_lod` 自述过时：`birdview_mountain` 的 desc 写着「在PK19改了，mountain配置待删除」。
  ③ 两表 35 层重叠，其中 7 层隐藏模式冲突（逐前缀比对，见产物的 `conflicts`）——
     不是同一份数据的两种粒度 ⇒ ⛔ 不许混用；交叉校验只查 cfg 表，旧档仅留档。
  ⚠ 档界阈值（各档对应的相机距离/scale）**取不到**：`birdview_mgr` 不在干净集
    ⇒ 本数据只含「各档隐不隐」，⛔ 没有档号 ↔ 缩放的换算，档界对齐是 N3 第 3 步的事。

⚠ 这是**全局配置**，⛔ 不是 per-map 数据 —— 落 `apps/kits/mapOriginal/data/lodref.json`
  （data/ 根，⛔ 不进 maps/s1/），也不进 Cocos 运行时镜像（客户端消费 shared 的 lodref.data.ts）。
⚠ 两张表都是「表名 → {层key: 行}」的**单层**结构，行里无 `id` 字段 ⇒ 不用 rows()/groups()，
  直接 table() 展平（层 key 即行键，天然无撞 id 问题）。

产物：`out/lodref.json`（产物链留档）+ `apps/kits/mapOriginal/data/lodref.json`（kit 留档）
+ `lodref.data.ts`（shared，纯数据，⛔ 勿手改）。
机检在 `apps/client/test/mapOriginal-lodref.test.ts`：TS ↔ json 逐字段互证 + 层映射相对次序。
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from ctable_cw import BaseCw  # noqa: E402

OUT = os.path.join(HERE, "out")
KIT_DATA = os.path.join(REPO, "apps/kits/mapOriginal/data")
SHARED = os.path.join(REPO, "apps/shared/src/kits/mapOriginal/content/lodref.data.ts")


def flatten(cw: BaseCw, idx: int, name_key: str) -> list[dict]:
    """`{层key: 行}` 单层表 → 按 key 排序的行数组（key/name/hide 三项，cfg 多 lod0Hide）。"""
    _arr, hsh = cw.table(idx)
    rows = []
    for key, ref in hsh.items():
        _a, row = cw.table(ref.idx)
        hide_arr, _h = cw.table(row["lod_hide_cfg"].idx)
        hide = [int(x) for x in hide_arr]
        assert set(hide) <= {0, 1}, "⛔ %s 的 lod_hide_cfg 越出 {0,1}：%s" % (key, hide)
        name = row[name_key]
        assert name == key, "⛔ 层 key %s 与行内名字 %s 不一致" % (key, name)
        # ⚠ 字段序就是 canonical 序（contentSha256 与 TS/json 两侧 stringify 都按它），⛔ 别调
        item = {"key": key, "name": name}
        if "desc" in row:
            item["desc"] = row["desc"]
        if "is_lod_0_hide" in row:
            item["lod0Hide"] = bool(row["is_lod_0_hide"])
        item["hide"] = hide
        rows.append(item)
    rows.sort(key=lambda r: r["key"])
    return rows


def ts_array(name: str, rows: list[dict], fields: list[str]) -> str:
    lines = []
    for r in rows:
        parts = []
        for f in fields:
            v = r[f]
            if isinstance(v, bool):
                parts.append("%s: %s" % (f, "true" if v else "false"))
            elif isinstance(v, list):
                parts.append("%s: [%s]" % (f, ", ".join(str(x) for x in v)))
            else:
                parts.append('%s: %s' % (f, json.dumps(v, ensure_ascii=False)))
        lines.append("    { %s }," % ", ".join(parts))
    return "export const %s = Object.freeze([\n%s\n] as const);\n" % (name, "\n".join(lines))


def main() -> int:
    cw = BaseCw()
    tables = cw.tables()

    legacy = flatten(cw, tables["map_layer_lod"], "name")
    cfg = flatten(cw, tables["map_layer_lod_cfg"], "map_layer_name")
    assert len(legacy) == 37 and len(cfg) == 64, "⛔ 层数漂移：%d / %d" % (len(legacy), len(cfg))
    assert all(len(r["hide"]) == 3 for r in legacy), "⛔ map_layer_lod 不是 3 档"
    assert all(len(r["hide"]) == 5 for r in cfg), "⛔ map_layer_lod_cfg 不是 5 档"

    lk = {r["key"] for r in legacy}
    ck = {r["key"] for r in cfg}
    legacy_by = {r["key"]: r for r in legacy}
    cfg_by = {r["key"]: r for r in cfg}
    both = sorted(lk & ck)
    # ⚠ 冲突判据 = 逐前缀比对（旧档 3 档 vs 现行前 3 档）：只能发现「不一致」，
    #   一致的层**不**反推档号对应关系（档界本来就取不到）。
    conflicts = sorted(k for k in both if legacy_by[k]["hide"] != cfg_by[k]["hide"][:3])

    # contentSha256 的 canonical payload：两表行数组（序固定 = key 排序，字段序固定），
    # Python json 与 JS JSON.stringify 同序同分隔 ⇒ 两侧可独立重算互证。
    payload = json.dumps({"legacy": legacy, "cfg": cfg},
                         ensure_ascii=False, separators=(",", ":"))
    sha = hashlib.sha256(payload.encode("utf-8")).hexdigest()

    doc = {
        "schemaVersion": 1, "contentSha256": sha,
        "source": "base.cw 的 map_layer_lod（旧档 3 档）/ map_layer_lod_cfg（现行 5 档），"
                  "ctable_cw.py 解码 [实测]",
        "semantics": "lod_hide_cfg[i]==1 = 该层在第 i 档隐藏；is_lod_0_hide = LOD0 特判。"
                     "⛔ 档界阈值取不到（birdview_mgr 不在干净集），本表只有『各档隐不隐』。",
        "authority": "交叉校验只以 cfg 为准：消费方函数名 get_map_layer_lod_cfg"
                     "（[干净集] forest_grid_layer_view.lua:21）+ 旧档自述过时"
                     "（birdview_mountain 的 desc）+ 两表 7 层冲突 ⇒ 旧档仅留档。",
        "legacyOnly": sorted(lk - ck), "cfgOnly": sorted(ck - lk), "conflicts": conflicts,
        "legacy": legacy, "cfg": cfg,
    }
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(KIT_DATA, exist_ok=True)
    for dest in (os.path.join(OUT, "lodref.json"), os.path.join(KIT_DATA, "lodref.json")):
        with open(dest, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=1)
        print("→ %s" % os.path.relpath(dest, REPO))

    ts = '''/**
 * mapOriginal **LOD 隐藏配置参考**（原版真表，N3 第 2 步）—— **生成物，⛔ 勿手改**。
 *
 * ★ 两张表都在 `base.cw` 里（[实测]，tools/maporiginal-assets/ctable_cw.py 解码）：
 *   - `MAPO_LODREF_LAYERS` = `map_layer_lod`：%d 层，`hide` **3 档**，带中文说明 —— **旧档，仅留档**。
 *   - `MAPO_LODREF_CFG` = `map_layer_lod_cfg`：%d 层，`hide` **5 档** + `lod0Hide` —— **现行**。
 *   `hide[i] === 1` = 该层在第 i 档隐藏。
 * ★ 交叉校验只以 cfg 为准（三条互证）：消费方函数名 `get_map_layer_lod_cfg`
 *   （[干净集] forest_grid_layer_view.lua:21）；旧档自述过时（birdview_mountain 的 desc
 *   「在PK19改了，mountain配置待删除」）；两表 %d 层重叠中 %d 层冲突 ⇒ 不是同一份数据的两种粒度。
 * ⚠ 档界阈值**取不到**（`birdview_mgr` 不在干净集）⇒ 本表只有「各档隐不隐」，
 *   ⛔ 没有档号 ↔ 缩放的换算 —— ⛔ 不许拿它去改 `mapoLayers.ts` 的档界（那是 N3 第 3 步）。
 * ⚠ 权威留档 = `apps/kits/mapOriginal/data/lodref.json`（全局配置，⛔ 不是 per-map），
 *   与本文件逐字段互证由 `apps/client/test/mapOriginal-lodref.test.ts` 钉住。
 */

/** 两表行数组的 canonical JSON（key 排序、字段序固定）的 sha256；与 kit 留档互证用。 */
export const MAPO_LODREF_SHA256 = "%s";

/** `map_layer_lod`（旧档 3 档）。`desc` 是原版中文说明。 */
%s
/** `map_layer_lod_cfg`（现行 5 档 + LOD0 特判）。 */
%s''' % (len(legacy), len(cfg), len(both), len(conflicts), sha,
         ts_array("MAPO_LODREF_LAYERS", legacy, ["key", "name", "desc", "hide"]),
         ts_array("MAPO_LODREF_CFG", cfg, ["key", "name", "lod0Hide", "hide"]))
    with open(SHARED, "w", encoding="utf-8") as f:
        f.write(ts)
    print("→ %s" % os.path.relpath(SHARED, REPO))

    print("  map_layer_lod %d 层（3 档，旧档）/ map_layer_lod_cfg %d 层（5 档，现行）"
          % (len(legacy), len(cfg)))
    print("  重叠 %d 层；旧档独有 %s；现行独有 %d 层；冲突 %d 层 %s"
          % (len(both), sorted(lk - ck), len(ck - lk), len(conflicts), conflicts))
    print("  contentSha256 %s" % sha[:16])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
