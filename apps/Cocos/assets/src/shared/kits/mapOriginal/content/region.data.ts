/**
 * mapOriginal 「山」族件图集（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ **格 id = 原版 res 值**（48..61，⛔ 无 56）：客户端拿到锚点值就直接查到该放哪张图。
 *   原版 48..61 是**一族 14 形**（`山1..山14`，见 docs/MAPORIGINAL-2D.md §3.2），
 *   ⛔ 不是本仓早先分的「山脉 / 林丛 / 散落」三族。山9（值 56）无 2D prefab，数据里也 0 命中。
 * ★ 贴图对应是**从 prefab 读出来的**（`mountain_forms.py`）：13 形只用到 m1..m10 十张图，
 *   1m_01/1m_04 共用 m7、1m_02/1m_03 共用 m6、19m_01/19m_02 共用 m2，靠 transform 区分。
 * ⚠ 锚点是**底边中点**，⛔ 不是几何中心。
 * ★ `native` 是原图像素：世界宽 = native[0] × (MAPO_TILE_HALF_W / 150)。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别再拉伸。
 */

export interface IMapoRegionCell {
    /** ★ 原版 res 值（48..61），同时是 `regions.bin` 里的 cell 字段。 */
    readonly id: number;
    readonly kind: string;
    /** 原版件号 `山N`。 */
    readonly shan: number;
    /** 原版 prefab 名，如 `mountain19m_01`。 */
    readonly form: string;
    /** 足迹形：1m / 2m_x / 2m_xy / 2m_y / 4m / 7m / 19m。 */
    readonly shape: string;
    /** 该形覆盖的格数（1 / 2 / 4 / 7 / 19）。 */
    readonly footprintCells: number;
    readonly cell: readonly [number, number, number, number];
    readonly art: readonly [number, number, number, number];
    /** ★ **原图像素尺寸**。件在世界里多大由它定，⛔ 不是按连通区拉伸。 */
    readonly native: readonly [number, number];
}

export const MAPO_REGION_ATLAS_W = 2048;
export const MAPO_REGION_ATLAS_H = 2048;
export const MAPO_REGION_CELL_W = 680;
export const MAPO_REGION_CELL_H = 352;
export const MAPO_REGION_CELLS: readonly IMapoRegionCell[] = [
  {
    "id": 48,
    "kind": "mountain",
    "shan": 1,
    "form": "mountain1m_01",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      0,
      0,
      680,
      352
    ],
    "art": [
      199,
      204,
      281,
      148
    ],
    "native": [
      281,
      148
    ]
  },
  {
    "id": 49,
    "kind": "mountain",
    "shan": 2,
    "form": "mountain1m_02",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      680,
      0,
      680,
      352
    ],
    "art": [
      196,
      204,
      287,
      148
    ],
    "native": [
      287,
      148
    ]
  },
  {
    "id": 50,
    "kind": "mountain",
    "shan": 3,
    "form": "mountain1m_03",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      1360,
      0,
      680,
      352
    ],
    "art": [
      196,
      204,
      287,
      148
    ],
    "native": [
      287,
      148
    ]
  },
  {
    "id": 51,
    "kind": "mountain",
    "shan": 4,
    "form": "mountain1m_04",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      0,
      352,
      680,
      352
    ],
    "art": [
      199,
      204,
      281,
      148
    ],
    "native": [
      281,
      148
    ]
  },
  {
    "id": 52,
    "kind": "mountain",
    "shan": 5,
    "form": "mountain2m_x_01",
    "shape": "2m_x",
    "footprintCells": 2,
    "cell": [
      680,
      352,
      680,
      352
    ],
    "art": [
      130,
      118,
      420,
      234
    ],
    "native": [
      420,
      234
    ]
  },
  {
    "id": 53,
    "kind": "mountain",
    "shan": 6,
    "form": "mountain2m_xy_01",
    "shape": "2m_xy",
    "footprintCells": 2,
    "cell": [
      1360,
      352,
      680,
      352
    ],
    "art": [
      189,
      114,
      302,
      238
    ],
    "native": [
      302,
      238
    ]
  },
  {
    "id": 54,
    "kind": "mountain",
    "shan": 7,
    "form": "mountain2m_y_01",
    "shape": "2m_y",
    "footprintCells": 2,
    "cell": [
      0,
      704,
      680,
      352
    ],
    "art": [
      85,
      174,
      510,
      178
    ],
    "native": [
      510,
      178
    ]
  },
  {
    "id": 55,
    "kind": "mountain",
    "shan": 8,
    "form": "mountain4m_01",
    "shape": "4m",
    "footprintCells": 4,
    "cell": [
      680,
      704,
      680,
      352
    ],
    "art": [
      82,
      62,
      516,
      290
    ],
    "native": [
      516,
      290
    ]
  },
  {
    "id": 57,
    "kind": "mountain",
    "shan": 10,
    "form": "mountain7m_01",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      1360,
      704,
      680,
      352
    ],
    "art": [
      12,
      11,
      655,
      341
    ],
    "native": [
      655,
      341
    ]
  },
  {
    "id": 58,
    "kind": "mountain",
    "shan": 11,
    "form": "mountain7m_02",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      0,
      1056,
      680,
      352
    ],
    "art": [
      11,
      2,
      657,
      350
    ],
    "native": [
      657,
      350
    ]
  },
  {
    "id": 59,
    "kind": "mountain",
    "shan": 12,
    "form": "mountain7m_03",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      680,
      1056,
      680,
      352
    ],
    "art": [
      3,
      7,
      674,
      345
    ],
    "native": [
      674,
      345
    ]
  },
  {
    "id": 60,
    "kind": "mountain",
    "shan": 13,
    "form": "mountain19m_01",
    "shape": "19m",
    "footprintCells": 19,
    "cell": [
      1360,
      1056,
      680,
      352
    ],
    "art": [
      58,
      69,
      563,
      283
    ],
    "native": [
      563,
      283
    ]
  },
  {
    "id": 61,
    "kind": "mountain",
    "shan": 14,
    "form": "mountain19m_02",
    "shape": "19m",
    "footprintCells": 19,
    "cell": [
      0,
      1408,
      680,
      352
    ],
    "art": [
      58,
      69,
      563,
      283
    ],
    "native": [
      563,
      283
    ]
  }
];
