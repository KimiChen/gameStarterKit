#!/usr/bin/env python3
"""`base.cw` 的 `land` 表**四套件列** → 变体件解析（N1 的单一真源）。

★ 机制（docs/MAPORIGINAL-2D.md §3.2，`[disasm]` 补核轮坐实）：
  每个地块类型有四套件列 `client_res_id`（基础季）/ `snow_client_res_id` /
  `desert_client_res_id` / `autumn_client_res_id`；运行时由
  `map_mgr:check_ground_type(row, col)` 的返回值在 land 行的这三列里挑
  （调用现场见干净集 `sparse_layer_block.lua:22-27`：snow → snow_client_res_id、
  desert → desert_client_res_id、否则 client_res_id）。
  ⛔ **`autumn_*` 不接**（M0-B3 已拍板山体换回基础季，秋季是误用）。

★ 实测（2026-09-23，probe_n1 系列）：
  - 资源件（land 2..46）：三套件各行指向 `scene/resource{,_snow,_desert}/<类>-new/<名>_group.prefab`。
    ⚠ 它们是 `res_type=dummy_prefab`，**包里路径全小写**（`Wood_01` → `wood_01`）——
    查 name_map 必须大小写不敏感（README §4.2·一·七）。
  - 山族（land 48..61）：雪件指向 `scene/ground/mountain_snow/<同形>_group.prefab`
    （贴图 `mountain_snow/png/1..9`，transform 与基础季**不同**，必须逐形重读）；
    **沙漠件的 2D `src_name` 与基础季完全相同**（`荒地山1..14` 只有 `src_name_3d` 不同）
    ⇒ 2D 沙盘里沙漠山 = 基础季件，⛔ 不需要新美术。
  - land 1（空地）/ 47（河）四列全 0 ⇒ 无件。
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
OUT = os.path.join(HERE, CFG["outDir"])

VARIANT_KEYS = (("base", "client_res_id"), ("snow", "snow_client_res_id"),
                ("desert", "desert_client_res_id"))
# ⛔ autumn_client_res_id 故意不列（M0-B3）

_LAND: dict | None = None
_CLIENT_RES: dict | None = None
_NAME_MAP: dict | None = None


def _cw():
    from ctable_cw import BaseCw
    return BaseCw()


def land_rows() -> dict:
    """`land` 表展平 {id: 行}（353 行）。"""
    global _LAND
    if _LAND is None:
        cw = _cw()
        _LAND = cw.rows(cw.tables()["land"])
    return _LAND


def client_res_rows() -> dict:
    """`client_res` 表展平 {id: 行}（73,679 行，⚠ 首次调用要几十秒）。"""
    global _CLIENT_RES
    if _CLIENT_RES is None:
        cw = _cw()
        _CLIENT_RES = cw.rows(cw.tables()["client_res"])
    return _CLIENT_RES


def variant_res_ids(land_id: int) -> dict:
    """land id → `{base, snow, desert}` 的 client_res id（0 = 原版就没配 ⇒ 沿用基础季）。"""
    row = land_rows()[land_id]
    out = {}
    for name, key in VARIANT_KEYS:
        v = row.get(key)
        out[name] = int(v) if isinstance(v, int) else 0
    return out


def res_src_name(rid: int) -> str:
    """client_res id → 2D `src_name`（prefab 路径）。⚠ 0 / 缺行 / 空串都回空。"""
    if not rid:
        return ""
    row = client_res_rows().get(rid)
    if row is None:
        return ""
    v = row.get("src_name")
    return v if isinstance(v, str) else ""


def _name_map() -> dict:
    global _NAME_MAP
    if _NAME_MAP is None:
        _NAME_MAP = json.load(open(os.path.join(OUT, "name_map.json")))
    return _NAME_MAP


def resolve_prefab(src_name: str) -> str:
    """prefab 逻辑路径 → 磁盘路径。⚠ 包里是**全小写 + 追加式 `.bin`**（两条规则都试）。"""
    import decode_ktx
    p = src_name[6:] if src_name.startswith("asset/") else src_name
    nm = _name_map()
    row = nm.get(p + ".bin") or nm.get(p.lower() + ".bin")
    if row is None:
        raise SystemExit("⛔ name_map 里没有 %s（小写形态也没有）" % src_name)
    for rootdir in [CFG["elpRoot"]] + list(CFG.get("elpRootsExtra", [])):
        d = os.path.join(rootdir, "files", row["container"])
        if not os.path.isdir(d):
            continue
        for fe in os.scandir(d):
            if fe.name.startswith("%03d_" % row["idx"]):
                return fe.path
    raise SystemExit("⛔ 磁盘上找不到 %s（容器 %s/%03d）" % (src_name, row["container"], row["idx"]))


def prefab_sprites(src_name: str) -> list:
    """prefab → sprite_2d 列表 [{tex, size, scale, pos, angle, low_z}]。⚠ 解析有残留直接退出。"""
    import prefab_bin
    blob = open(resolve_prefab(src_name), "rb").read()
    d = prefab_bin.parse(blob)
    if d.get("_bytes_left"):
        raise SystemExit("⛔ %s 解析有残留 %s B" % (src_name, d["_bytes_left"]))
    kids = d.get("children") or []
    out = []
    for k in kids:
        if k.get("class") != "sprite_2d":
            continue                    # ⚠ 资源件里有裸 node_2d / 动画占位，⛔ 不是件
        out.append({"tex": k.get("texture"), "size": k.get("size"), "scale": k.get("scale"),
                    "pos": k.get("position"), "angle": k.get("angle"), "low_z": k.get("low_z")})
    return out


def main_sprite(src_name: str, tree: str) -> dict | None:
    """变体件的**主 sprite**：有贴图、贴图在该变体树内（⛔ 阴影/特效不算），面积最大者。

    ⚠ 资源件是 `dummy_prefab`：原版运行期由引擎把整组 sprite 拼出来；本 kit 一层一格一件，
    取主片 —— 与 pack_decor 早先「一格一张图」的口径一致，只是**从 prefab 读出**而不是按名猜。
    """
    best = None
    for s in prefab_sprites(src_name):
        tex = s["tex"]
        if not tex:
            continue
        t = tex.lower()
        if "shadow" in t or "effect" in t:
            continue
        if ("/%s/" % tree) not in t:
            continue                    # ⛔ 主片必须长在本变体树里（阴影散在 npc/common 之类）
        area = s["size"][0] * s["size"][1] * abs(s["scale"][0] * s["scale"][1])
        if best is None or area > best[0]:
            best = (area, s)
    return best[1] if best else None
