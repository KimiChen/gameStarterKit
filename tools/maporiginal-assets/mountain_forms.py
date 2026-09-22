#!/usr/bin/env python3
"""原版「山」族 14 形的**单一真源**：值 ↔ prefab ↔ 贴图 ↔ 足迹。

★ 依据 `docs/MAPORIGINAL-2D.md` §3.1/§3.2/§3.3：
  原版 48..61 是**一族 14 形**（`山1..山14`），⛔ 不是本仓早先分的「山脉/林丛/散落」三族；
  `res.bytes` 的非零值**就是锚点**，`res_multi` 只是「这格属于哪个件」的覆盖掩码。
  `res 值 v ↔ 山(v−47)`；山9（值 56）没有 2D prefab，数据里 56 也恰好 **0 命中**。

★ 贴图不是猜的：逐个读 `scene/ground/mountain_new/<form>_group.prefab.bin` 的字符串池，
  里面明写 `asset/scene/ground/mountain_new[/<季>]/png/mN.png`。13 形只用到 10 张图 ——
  1m_01/1m_04 共用 m7、1m_02/1m_03 共用 m6、19m_01/19m_02 共用 m2，靠 prefab 的
  transform 区分（见 §3.3 与 M0-B2）。

⚠ 足迹表是**从数据反推再回代校验**的，⛔ 不是按某种六边形约定推的：
  `footprint_offsets()` 按 odd-row offset（奇数行右移）生成，`verify_footprints()`
  拿 res/res_multi 逐锚点回代，命中率低于阈值直接 SystemExit。
"""
from __future__ import annotations

# 六邻：奇数行右移（odd-row offset）。次序 W / E / NW / NE / SW / SE。
# ⚠ 这个约定是**实测定的**：值 53 的第二格在偶数行是 (1,0)、奇数行是 (1,1) = SE；
#   值 54 是 (1,-1) / (1,0) = SW。⛔ 改约定前先跑 verify_footprints()。
NEIGHBORS = {
    0: [(0, -1), (0, 1), (-1, -1), (-1, 0), (1, -1), (1, 0)],
    1: [(0, -1), (0, 1), (-1, 0), (-1, 1), (1, 0), (1, 1)],
}
_W, _E, _NW, _NE, _SW, _SE = range(6)


def _ring(parity: int, radius: int) -> list:
    """以 (0,0) 为心、半径 radius 的六边形全部格（含心），按 (dr,dc) 排序。"""
    seen = {(0, 0)}
    frontier = [(0, 0)]
    for _ in range(radius):
        nxt = []
        for dr, dc in frontier:
            for ndr, ndc in NEIGHBORS[(parity + dr) & 1]:
                p = (dr + ndr, dc + ndc)
                if p not in seen:
                    seen.add(p)
                    nxt.append(p)
        frontier = nxt
    return sorted(seen)


def _pick(parity: int, dirs: list) -> list:
    return sorted({(0, 0)} | {NEIGHBORS[parity][d] for d in dirs})


def footprint_offsets(shape: str, parity: int) -> list:
    if shape == "1m":
        return [(0, 0)]
    if shape == "2m_x":
        return _pick(parity, [_W])
    if shape == "2m_xy":
        return _pick(parity, [_SE])
    if shape == "2m_y":
        return _pick(parity, [_SW])
    if shape == "4m":
        return _pick(parity, [_W, _NW, _SW])
    if shape == "7m":
        return _ring(parity, 1)
    if shape == "19m":
        return _ring(parity, 2)
    raise SystemExit("⛔ 未知足迹形 " + shape)


# 值 → (山N, prefab 名, 贴图基名, 足迹形)。⚠ 56（山9）无 2D prefab，数据里 0 命中，故不列。
FORMS = {
    48: (1,  "mountain1m_01",   "m7",  "1m"),
    49: (2,  "mountain1m_02",   "m6",  "1m"),
    50: (3,  "mountain1m_03",   "m6",  "1m"),
    51: (4,  "mountain1m_04",   "m7",  "1m"),
    52: (5,  "mountain2m_x_01", "m8",  "2m_x"),
    53: (6,  "mountain2m_xy_01", "m3", "2m_xy"),
    54: (7,  "mountain2m_y_01", "m9",  "2m_y"),
    55: (8,  "mountain4m_01",   "m10", "4m"),
    57: (10, "mountain7m_01",   "m1",  "7m"),
    58: (11, "mountain7m_02",   "m4",  "7m"),
    59: (12, "mountain7m_03",   "m5",  "7m"),
    60: (13, "mountain19m_01",  "m2",  "19m"),
    61: (14, "mountain19m_02",  "m2",  "19m"),
}
MISSING_VALUE = 56            # 山9：无 2D prefab，res/res_multi 双侧 0 命中
VALUES = sorted(FORMS)
PREFAB_DIR_BASE = "scene/ground/mountain_new"                     # 基础季
PREFAB_DIR_FALL = "scene/ground/mountain_new/grass_fall_new"      # 秋季


def footprint_cells(v: int, parity: int) -> list:
    return footprint_offsets(FORMS[v][3], parity)


def d_span(v: int) -> int:
    """足迹在等距横轴上的跨度（半宽数）—— d = row − col。"""
    lo = hi = 0
    for parity in (0, 1):
        for dr, dc in footprint_cells(v, parity):
            lo, hi = min(lo, dr - dc), max(hi, dr - dc)
    return hi - lo + 1


def verify_footprints(res, multi, min_rate: float = 0.999) -> dict:
    """逐锚点回代：足迹内每格的 res_multi 必须等于锚点值。⚠ 越界格跳过（§3.1 的回代约定）。"""
    import numpy as np
    rows, cols = res.shape
    out = {}
    for v in VALUES:
        ar, ac = np.nonzero(res == v)
        ok = bad = 0
        for parity in (0, 1):
            sel = (ar % 2) == parity
            rr, cc = ar[sel], ac[sel]
            for dr, dc in footprint_cells(v, parity):
                r2, c2 = rr + dr, cc + dc
                m = (r2 >= 0) & (r2 < rows) & (c2 >= 0) & (c2 < cols)
                hit = multi[r2[m], c2[m]] == v
                ok += int(hit.sum())
                bad += int((~hit).sum())
        rate = ok / max(ok + bad, 1)
        out[v] = {"命中": ok, "不符": bad, "命中率": round(rate, 6)}
        if rate < min_rate:
            raise SystemExit("⛔ 足迹回代不过：值 %d 命中率 %.4f < %.3f" % (v, rate, min_rate))
    return out
