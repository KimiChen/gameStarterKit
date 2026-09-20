"""等距六边形投影。与 apps/shared/src/kits/sgzzmap/api/hexmap 的 TS 实现必须逐式一致。

来源：三国志战略版 coord_util.grid2pos（sourceVersion/sgzz-2084.1768，反编译）
  偶数行： x = (row - col)       * TW ,  y = -(row + col + 1)   * TH
  奇数行： x = (row - col - 0.5) * TW ,  y = -(row + col + 1.5) * TH
TW/TH 是半对角，故一格读作 2TW × 2TH 的菱形，世界包围盒恰好 2:1。
"""
from __future__ import annotations

import numpy as np

TILE_HALF_W = 32.0      # SGZZ_TILE_HALF_W（设计像素 @ scale 1）
TILE_HALF_H = 16.0      # SGZZ_TILE_HALF_H


def grid2pos(row, col, half_w: float = TILE_HALF_W, half_h: float = TILE_HALF_H):
    """支持标量与 numpy 数组。返回 (x, y)。"""
    row = np.asarray(row, dtype=np.float64)
    col = np.asarray(col, dtype=np.float64)
    odd = (row.astype(np.int64) & 1).astype(np.float64)
    x = (row - col - 0.5 * odd) * half_w
    y = -(row + col + 1.0 + 0.5 * odd) * half_h
    return x, y


def world_bounds(rows: int, cols: int, half_w: float = TILE_HALF_W, half_h: float = TILE_HALF_H):
    """整幅地图在世界空间的轴对齐包围盒（含四个菱形顶点）。"""
    corners = [(0, 0), (0, cols - 1), (rows - 1, 0), (rows - 1, cols - 1)]
    xs, ys = [], []
    for r, c in corners:
        x, y = grid2pos(r, c, half_w, half_h)
        xs.append(float(x)); ys.append(float(y))
    return min(xs) - half_w, min(ys) - half_h, max(xs) + half_w, max(ys) + half_h


def fit_grid_sampler(src_w: int, src_h: int, rows: int, cols: int):
    """fit:"grid" —— 源矩形四角映到网格方 [0,rows)×[0,cols)。

    等价于把源图直接重采样成 rows×cols：cell(row,col) 取源图 (col/cols, row/rows) 处。
    这样地形与（同一仿射烘出的）底图必然对齐，⛔ 不存在「图比格偏了几格」这类 bug。
    """
    ys = (np.arange(rows) + 0.5) * (src_h / rows)
    xs = (np.arange(cols) + 0.5) * (src_w / cols)
    return xs, ys
