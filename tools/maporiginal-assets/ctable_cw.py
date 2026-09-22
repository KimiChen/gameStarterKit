#!/usr/bin/env python3
"""`base.cw`（ejoy2dx ctable 大包）的**定向读取**器。

    /tmp/maporiginal-venv/bin/python ctable_cw.py --table client_res --prefix scene/ground/road/

★ 已解开的部分（2026-09-23，MAPORIGINAL-2D §11-1 的最大缺口）：

    [0]  u32  串池偏移（实测 0x02ee49fc = 49,170,940，其后 17.6 MB 是 NUL 分隔的串池）
    [4]  u32  **对象总数**（实测 712,948）
    [8..] u32 **对象偏移表**（712,948 项，句柄 → 文件偏移，递增）

  ⚠ 早先把 `[4]` 读成「串索引偏移」是**错的** —— 它是对象数；在 0xae0f4 处读到的
  「池内偏移」其实是偏移表的表项（值恰好落在数据区、被 `s()` 当池偏移误解了）。

★ **顶层表目录**：一段按**字母序**排的「表名 → 句柄」键值对（实测 1,339 项，
  `build` … `zhongshuling_market_level_cfg`），就是 `get_cfg("<名>")` 的落点。
  ⚠ 判据用「池里前一字节是 NUL」（真键必指向串**起点**），⛔ 别用「像标识符」那种软判据
  —— 软判据会在 `IER_1` / `RY_6` 这类池内巧合上停住、把目录截断。
⛔ **「对象按表分组、目录值是句柄」是错的**（2026-09-23 实测反证）：
  `client_res` 的行落在句柄 ~214,746 而目录值是 164,841；`land` 是 ~505,131 vs 460,421，
  差值还不是常数。⇒ **目录的 u32 语义未知**，⛔ 别拿它去定位表的行。

  **行是 `[u32 键池偏移][u32 值]` 的键值对序列**，值要么是池偏移（串），要么是整数。
  同一张表的行**定长且对齐**（`client_res` 实测 100 B / 25 个 u32：6 对键值 +
  9 个 u32 的尾巴 + `day_night_res_type` 对 + `id` 对）。

⚠ **这不是通用 ctable 解析器**，⛔ 别当它是：
  - 尾巴那 9 个 u32 的含义未解（疑似打包描述符）；
  - 行长/列集**逐表不同**，本模块靠「必含某个键」来圈定一张表，⛔ 不解析表目录；
  - 跨表的 `id` 会撞车（实测按 `name`+`id` 盲扫会捞到 3,875 行、来自多张表），
    所以**必须**同时给一个该表独有的键（如 `client_res` 给 `src_name`）。

★ 已验证的战果：`client_res` 的 848 行全出，其中 `scene/ground/road/` 152 条；
  道路的 `type_info` id **+1** 后逐条对上 prefab（见 `build_roads.py`）。
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
# ⚠ base.cw **不在 name_map 里**（它没有路径条目）—— 按 namehash 锁定的容器内文件名直取。
BASE_CW_REL = "files/6853c9b7f69310c7f443a091899cbda2_13055493/004_8d15b7ffcb4b2a2a.bin"
BASE_CW_SIZE = 66_776_016


class BaseCw:
    def __init__(self, path: str | None = None) -> None:
        if path is None:
            for root in [CFG["elpRoot"]] + list(CFG.get("elpRootsExtra", [])):
                cand = os.path.join(root, BASE_CW_REL)
                if os.path.exists(cand):
                    path = cand
                    break
        if path is None or not os.path.exists(path):
            raise SystemExit("⛔ 找不到 base.cw（%s）" % BASE_CW_REL)
        if os.path.getsize(path) != BASE_CW_SIZE:
            raise SystemExit("⛔ base.cw 大小 %d ≠ %d —— 换版本了，结构要重验"
                             % (os.path.getsize(path), BASE_CW_SIZE))
        self.path = path
        self.buf = open(path, "rb").read()
        self.pool_off = struct.unpack_from("<I", self.buf, 0)[0]
        self.strindex_off = struct.unpack_from("<I", self.buf, 4)[0]
        self.pool = self.buf[self.pool_off:]
        self.words = np.frombuffer(self.buf[: len(self.buf) // 4 * 4], "<u4")
        self._key_cache: dict = {}

    # ── 对象表与表目录 ──────────────────────────────────────
    def obj_offset(self, handle: int) -> int:
        """句柄 → 文件偏移。"""
        return struct.unpack_from("<I", self.buf, 8 + handle * 4)[0]

    def tables(self) -> dict:
        """顶层表目录：表名 → **一个语义未知的 u32**。⚠ 以 `land_shape` 为锚向两头扩。

        ⛔ 那个 u32 **不是对象句柄**（已反证，见模块注释）。这张表目前只用来
        **确认某张表存在 / 拿到全部表名**，⛔ 别拿它定位行。
        """
        if getattr(self, "_tables", None) is not None:
            return self._tables
        w = self.words
        anchor = self.key_off("land_shape")
        i = int(np.nonzero(w == anchor)[0][0])
        k = i
        while k > 2 and self.pool_key(int(w[k - 2])):
            k -= 2
        j = i
        while j + 1 < len(w) and self.pool_key(int(w[j])):
            j += 2
        self._tables = {self.pool_key(int(w[k + t])): int(w[k + t + 1])
                        for t in range(0, j - k, 2)}
        return self._tables

    # ⛔ **曾有一个 `owner_of(file_off)`，已删** ——它建在「对象按表分组、目录值是句柄」
    #   这个假设上，而该假设**已被反证**：`client_res` 的行实测落在句柄 ~214,746，
    #   目录里写的却是 164,841；`land` 是 ~505,131 vs 460,421，差值还不是常数。
    #   ⇒ 目录的 u32 **不是对象句柄**，语义未知。⛔ 别再按「句柄区间 = 表」去归属地址。

    def pool_key(self, off: int) -> str | None:
        """池偏移 → 键名；⚠ 必须指向串**起点**（前一字节是 NUL），⛔ 否则是巧合。"""
        if off <= 0 or off >= len(self.pool) or self.pool[off - 1] != 0:
            return None
        st = self.s(off)
        return st if st and st.isascii() and 0 < len(st) < 64 else None

    def s(self, off: int) -> str | None:
        """池偏移 → 串；越界或太长回 None。"""
        if off >= len(self.pool):
            return None
        end = self.pool.find(b"\x00", off)
        if end < 0 or end - off > 512:
            return None
        return self.pool[off:end].decode("utf-8", "replace")

    def key_off(self, name: str) -> int:
        """键名 → 它在池里的偏移。⚠ 取**第一处**出现，键名短、重复风险低。"""
        if name in self._key_cache:
            return self._key_cache[name]
        pat = b"\x00" + name.encode() + b"\x00"
        i = self.pool.find(pat)
        if i < 0:
            raise SystemExit("⛔ 串池里没有键 %r" % name)
        self._key_cache[name] = i + 1
        return i + 1

    # ★ `client_res` 的**定长行布局**（100 B / 25 个 u32，实测逐行成立）：
    #     [0]键 name [1]值 | [2]键 pool_id [3]值 | [4]键 res_season [5]值
    #     [6]键 res_type [7]值 | [8]键 src_name [9]值 | [10]键 src_name_3d [11]值
    #     [12..20] 尾巴 9 个 u32（含义未解，疑似打包描述符）
    #     [21]键 day_night_res_type [22]值 | [23]键 id [24]值
    # ⚠ **这是 `client_res` 这一张表的布局**，⛔ 别推广到别的表：行长与列集逐表不同。
    #   换表要先照 §11-1 的办法重定：找一个该表独有的键的池偏移，
    #   在文件里搜它的 u32 引用，dump 周围 ±40 B 看键值对节律。
    CLIENT_RES_SLOTS = {"name": 1, "pool_id": 3, "res_season": 5, "res_type": 7,
                        "src_name": 9, "src_name_3d": 11, "day_night_res_type": 22, "id": 24}
    CLIENT_RES_KEYS = {0: "name", 2: "pool_id", 4: "res_season", 6: "res_type",
                       8: "src_name", 10: "src_name_3d", 21: "day_night_res_type", 23: "id"}
    CLIENT_RES_WORDS = 25

    def client_res_rows(self) -> list:
        """全量 `client_res` 行。⚠ 靠**四个键同时落在固定槽**圈定，⛔ 不是盲扫。"""
        need = {slot: self.key_off(name) for slot, name in self.CLIENT_RES_KEYS.items()}
        w = self.words
        anchor = need[0]
        cand = np.nonzero(w[: -self.CLIENT_RES_WORDS] == anchor)[0]
        out = []
        for i in cand:
            if any(w[i + slot] != ko for slot, ko in need.items()):
                continue
            row = {"_at": int(i) * 4}
            for col, slot in self.CLIENT_RES_SLOTS.items():
                row[col] = int(w[i + slot])
            out.append(row)
        return out

    def road_pieces(self) -> dict:
        """`client_res` 里 `scene/ground/road/<名>_complex_group.prefab` 的 id → 名。

        ⚠ 只收 `_complex_group`（本体），⛔ 不收 `_complex_path_*`（路点变体，26,055 起）
        与 `_沙漠` 皮肤（26,038 起）。
        """
        out = {}
        for r in self.client_res_rows():
            src = self.s(r["src_name"])
            if not src or not src.startswith("scene/ground/road/"):
                continue
            stem = src[len("scene/ground/road/"):]
            if not stem.endswith("_complex_group.prefab") or "_complex_path" in stem:
                continue
            out[r["id"]] = stem[: -len("_complex_group.prefab")]
        return out

    # ★ `land` 表：**49 列 / 392 B 一行**，键按**字母序**排（与 `client_res` 的定长布局同理，
    #   但列集完全不同 —— 又一次印证「行长与列集逐表不同」）。
    # ⚠ 值分三类：标量 int 直接读；**字符串列**是池偏移（`name` → `1级木材`）；
    #   **列表列**（`offset_2d` / `vector` / `variant_*_list` / `reward_*`）是**连号句柄**，
    #   指向未解的数组池 ⇒ ⛔ 别把它们当数字读。
    LAND_ANCHOR = "army_fight_confirm_diaplay_func"   # 字母序第一列，兼作行首锚
    LAND_COLS = 49
    # ⚠ `is_block` 的真值是 **0x01000000**（不是 1）：疑似大端布尔或高字节标志位。
    #   实测只有 0 与它两种取值（229 / 124 行）。⛔ 别写成 `!= 0` 以外的判断。
    LAND_IS_BLOCK = 0x01000000

    def land_rows(self) -> list:
        """全量 `land` 行（字典：列名 → 原始 u32）。⚠ 只保证**标量列**可直接当数读。"""
        ka = self.key_off(self.LAND_ANCHOR)
        w = self.words
        out = []
        for i in np.nonzero(w[: -self.LAND_COLS * 2] == ka)[0]:
            row, ok = {}, True
            for j in range(self.LAND_COLS):
                key = self.s(int(w[i + j * 2]))
                if not key or not key.replace("_", "a").isalnum() or key[0].isdigit():
                    ok = False
                    break
                row[key] = int(w[i + j * 2 + 1])
            if ok and "is_block" in row and "id" in row:
                row["_at"] = int(i) * 4
                out.append(row)
        return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="client_res")
    ap.add_argument("--prefix", default="")
    ap.add_argument("--limit", type=int, default=40)
    a = ap.parse_args()
    cw = BaseCw()
    print("base.cw %s" % cw.path)
    print("  串池偏移 %#x（%.1f MB 串池）  串索引偏移 %#x" % (cw.pool_off, len(cw.pool) / 1e6,
                                                            cw.strindex_off))
    if a.table != "client_res":
        raise SystemExit("⛔ 目前只圈定了 client_res 的定长布局；别的表要先照 §11-1 的办法重定")
    rows = cw.client_res_rows()
    print("  client_res 行 %d 条" % len(rows))
    got = []
    for r in rows:
        src = cw.s(r["src_name"])
        if src and src.startswith(a.prefix):
            got.append((r["id"], src, cw.s(r["name"])))
    got.sort()
    print("  前缀 %r 命中 %d 条：" % (a.prefix, len(got)))
    for i, src, nm in got[: a.limit]:
        print("    %-7s %-58s %s" % (i, src, nm))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
