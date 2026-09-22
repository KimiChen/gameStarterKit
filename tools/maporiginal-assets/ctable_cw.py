#!/usr/bin/env python3
"""`base.cw`（ejoy2dx ctable 大包）**解码器** —— 从 `libnative-lib.so` 逆出来的，⛔ 不是猜的。

    /tmp/maporiginal-venv/bin/python ctable_cw.py --table client_res --prefix scene/ground/road/

★ 值编码（arm64 `libnative-lib.so`，值解码器 `0xb3fdb0`）：
  `cmp w2, #5` + 字节跳转表 `@0x11832b0 = 00 0b 10 1a 1f 25` ⇒ **类型标签只有 0..5**：

    0 = nil                         1 = int32（ldrsw，符号扩展）
    2 = float32（ldr s0 + fcvt）    3 = boolean
    4 = **嵌套表**（值是**根容器**的子项索引）
    5 = **字符串**：`ptr = base + *(u32*)base + value`

  ⚠ 跳转表末字节 `0x25` 与紧随其后的字符串 `%_ctables` 的 `'%'` **共用同一个字节**
    （链接器 packing），这反过来确认标签上界就是 5。
  ⚠ 遍历时传给解码器的 `base` 始终是**根容器** ⇒ **所有索引与串偏移都是全局的**。

★ 子容器寻址（`0xb3f930`）：
    `count      = *(u32*)(root + 4)`
    `entries[i] = *(i32*)(root + 8 + i*4)`   （`-1` = 该项不存在）
    `child(i)   = root + 8 + count*4 + entries[i]`   ← **entries 是相对偏移**

★ 表对象布局（`0xb3fb50` 的遍历函数，寄存器 provenance 已追清）：
    `O+0`                    u32 n_array
    `O+4`                    u32 n_hash
    `O+8`                    u8  tags[n_array + n_hash]
    `O+8+pad`                u32 array_values[n_array]        pad = (n_array+n_hash+3) & ~3
    `O+8+pad+4*n_array`      {u32 key, u32 value}[n_hash]     ← **哈希项 8 字节一对**
  ⚠ 哈希的**键恒是串**（全数字时原版会转成整数键）；值的标签在 `tags[n_array + i]`。
  ⚠ 数组部分步长 4、哈希部分步长 **8** —— 早先按 4 读会把键值交错读串。

★ 顶层表目录：根容器的一个子表，**表名 → 子项索引**（1,339 项可见）。

⛔ **别再用「扫键名 + 往前找行首」那套启发式**：表是**多级分桶**的
  （`client_res` 是两级：外层桶 → id → 行），变长行上的行首启发式会串行。
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

CFG = json.load(open(os.path.join(HERE, "assets.config.json")))
# ⚠ base.cw **不在 name_map 里**（没有路径条目）—— 按 namehash 锁定的容器内文件名直取。
BASE_CW_REL = "files/6853c9b7f69310c7f443a091899cbda2_13055493/004_8d15b7ffcb4b2a2a.bin"
BASE_CW_SIZE = 66_776_016
TAG_NIL, TAG_INT, TAG_FLOAT, TAG_BOOL, TAG_TABLE, TAG_STR = range(6)


class _IsRow(Exception):
    """内部：`groups()` 遍历时「这个子项本身就是一行」的信号。"""

    def __init__(self, row: dict) -> None:
        super().__init__()
        self.row = row


class Ref:
    """一个尚未展开的嵌套表（tag 4）。⚠ `idx` 是**根容器**的子项索引。"""

    __slots__ = ("idx",)

    def __init__(self, idx: int) -> None:
        self.idx = idx

    def __repr__(self) -> str:
        return "<table #%d>" % self.idx


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
        self.pool = self.u32(0)
        self.count = self.u32(4)
        self.data = 8 + self.count * 4
        self._tables: dict | None = None

    # ── 基本读 ────────────────────────────────────────────────
    def u32(self, o: int) -> int:
        return struct.unpack_from("<I", self.buf, o)[0]

    def i32(self, o: int) -> int:
        return struct.unpack_from("<i", self.buf, o)[0]

    def f32(self, o: int) -> float:
        return struct.unpack_from("<f", self.buf, o)[0]

    def s(self, v: int) -> str:
        """tag 5：`ptr = root + root[0] + value`。"""
        off = self.pool + v
        end = self.buf.index(b"\x00", off)
        return self.buf[off:end].decode("utf-8", "replace")

    def child(self, idx: int) -> int | None:
        if idx < 0 or idx >= self.count:
            return None
        ent = self.i32(8 + idx * 4)
        return None if ent == -1 else self.data + ent

    # ── 表 ────────────────────────────────────────────────────
    def _val(self, tag: int, at: int):
        if tag == TAG_NIL:
            return None
        if tag == TAG_INT:
            return self.i32(at)
        if tag == TAG_FLOAT:
            return self.f32(at)
        if tag == TAG_BOOL:
            return bool(self.u32(at))
        if tag == TAG_TABLE:
            return Ref(self.u32(at))
        if tag == TAG_STR:
            return self.s(self.u32(at))
        raise SystemExit("⛔ 未知类型标签 %d @%#x" % (tag, at))

    def table(self, idx: int):
        """子项 idx → `(array: list, hash: dict)`；不存在 / 不是合法表回 None。

        ⚠ **不是每个子项都是表**（也有裸值对象）；越界或串读不到 NUL 一律当「不是表」，
        ⛔ 别让它抛异常把整轮遍历打断。
        """
        try:
            return self._table(idx)
        except (ValueError, struct.error, IndexError):
            return None

    def _table(self, idx: int):
        o = self.child(idx)
        if o is None:
            return None
        if o + 8 > len(self.buf):
            return None
        na, nh = self.u32(o), self.u32(o + 4)
        if na > 1 << 22 or nh > 1 << 22 or o + 8 + na + nh > len(self.buf):
            return None      # ⚠ 不是表（根子项里也有裸值对象）
        pad = (na + nh + 3) & ~3
        tg, av = o + 8, o + 8 + pad
        hv = av + 4 * na
        # ⚠ 个别条目会读不出来（串越界 / 标签越界）：**逐项跳过**，
        #   ⛔ 别让一条坏项把整张表作废（目录表就因此整张丢过）。
        arr, hsh = [], {}
        for k in range(na):
            try:
                arr.append(self._val(self.buf[tg + k], av + 4 * k))
            except (ValueError, struct.error, IndexError, SystemExit):
                arr.append(None)
        for k in range(nh):
            try:
                hsh[self.s(self.u32(hv + 8 * k))] = self._val(self.buf[tg + na + k],
                                                              hv + 8 * k + 4)
            except (ValueError, struct.error, IndexError, SystemExit):
                continue
        return arr, hsh

    def refs(self, idx: int) -> list:
        t = self.table(idx)
        if t is None:
            return []
        a, h = t
        return ([v.idx for v in a if isinstance(v, Ref)]
                + [v.idx for v in h.values() if isinstance(v, Ref)])

    def groups(self, idx: int, marker: str = "id", maxdepth: int = 6) -> list:
        """把一张表展开成**若干互不相干的叶子表**：`[(桶路径, {id: 行}), …]`。

        ⚠ **目录里的名字未必是一张表，也可能是命名空间**。实测 `city` 就有 11 个兄弟桶，
        各是一张独立的表（`city[0]` 是 9 行「部队攻击/谋略…」、`city[1]` 才是 249 座真城、
        `city[2]` 是 10 行 `HP/alliance_member_cnt…`）—— ⛔ 合并它们会按 `id` 互相覆盖。
        """
        out: list = []

        def walk(i: int, d: int, path: str) -> None:
            if d > maxdepth:
                return
            t = self.table(i)
            if t is None:
                return
            if d > 0 and marker in t[1]:
                raise _IsRow(t[1])
            bucket: dict = {}
            for n, j in enumerate(self.refs(i)):
                try:
                    walk(j, d + 1, "%s[%d]" % (path, n))
                except _IsRow as r:
                    bucket[r.row.get(marker, j)] = r.row
            if bucket:
                out.append((path, bucket))

        walk(idx, 0, "")
        return out

    def rows(self, idx: int, marker: str = "id", maxdepth: int = 6) -> dict:
        """把一张（多级分桶的）表展平成 `{id: 行}`。

        ⚠ 分桶**本身是正常的**：`client_res` 就散在 336 个桶里，73,679 个 `id` 全局唯一。
        ⛔ 但目录名也可能是**命名空间**（`city` 下 9 张互不相干的表，`id` 各自从 1 起）——
        那时合并会静默互相覆盖，所以本方法**一撞 id 就报错**，请改用 `groups()` 自己挑桶。
        """
        out: dict = {}
        for path, bucket in self.groups(idx, marker, maxdepth):
            for k, row in bucket.items():
                if k in out:
                    raise ValueError(
                        "⛔ 子项 %d 展平时 %s=%r 撞车（桶 %s）—— 这多半是个**命名空间**而不是"
                        "一张表，改用 groups() 自己挑桶" % (idx, marker, k, path or "·"))
                out[k] = row
        return out

    def index_at(self, file_off: int) -> int:
        """文件偏移 → 覆盖它的子项索引。⚠ entries 是**单调递增**的相对偏移，可二分。"""
        lo, hi = 0, self.count - 1
        want = file_off - self.data
        while lo < hi:
            mid = (lo + hi + 1) // 2
            ent = self.i32(8 + mid * 4)
            if ent != -1 and ent <= want:
                lo = mid
            else:
                hi = mid - 1
        return lo

    def tables(self) -> dict:
        """顶层表目录：表名 → 子项索引。

        ⚠ 定位办法：串池里找键 `land_shape` 的**串起点**，在数据区搜它的 u32 引用，
        用 `index_at` 反查所属子项 —— ⛔ 别全量扫 712,948 个子项（慢且会踩到非表对象）。
        """
        if self._tables is not None:
            return self._tables
        import numpy as np
        pat = b"\x00land_shape\x00"
        i = self.buf.find(pat, self.pool)
        if i < 0:
            raise SystemExit("⛔ 串池里没有 land_shape")
        key = (i + 1) - self.pool
        w = np.frombuffer(self.buf[: len(self.buf) // 4 * 4], "<u4")
        for at in np.nonzero(w[: self.pool // 4] == key)[0]:
            t = self.table(self.index_at(int(at) * 4))
            if t and "client_res" in t[1] and "land" in t[1]:
                self._tables = {k: v.idx for k, v in t[1].items() if isinstance(v, Ref)}
                return self._tables
        raise SystemExit("⛔ 找不到顶层表目录")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="client_res")
    ap.add_argument("--prefix", default="")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--dir-index", type=int, default=None,
                    help="直接给表目录的子项索引（省去扫描）")
    a = ap.parse_args()
    cw = BaseCw()
    print("base.cw %s" % cw.path)
    print("  串池 %#x  根子项 %d  子区起点 %#x" % (cw.pool, cw.count, cw.data))
    idx = a.dir_index
    if idx is None:
        idx = cw.tables().get(a.table)
    if idx is None:
        raise SystemExit("⛔ 目录里没有表 %r" % a.table)
    rows = cw.rows(idx)
    print("  %s：%d 行" % (a.table, len(rows)))
    got = [(k, v) for k, v in rows.items()
           if isinstance(v.get("src_name"), str) and v["src_name"].startswith(a.prefix)]
    got.sort(key=lambda kv: (kv[0] is None, kv[0]))
    print("  前缀 %r 命中 %d 条：" % (a.prefix, len(got)))
    for k, v in got[: a.limit]:
        print("    %-8s %-58s %s" % (k, v.get("src_name"), v.get("name")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
