/**
 * mapOriginal 「山」族件图集（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ **格 id = 原版 res 值**（48..61，⛔ 无 56）：客户端拿到锚点值就直接查到该放哪张图。
 *   原版 48..61 是**一族 14 形**（`山1..山14`，见 docs/MAPORIGINAL-2D.md §3.2），
 *   ⛔ 不是本仓早先分的「山脉 / 林丛 / 散落」三族。山9（值 56）无 2D prefab，数据里也 0 命中。
 * ★ 贴图对应是**从 prefab 读出来的**（`mountain_forms.py`）：13 形只用到 m1..m10 十张图，
 *   1m_01/1m_04 共用 m7、1m_02/1m_03 共用 m6、19m_01/19m_02 共用 m2，靠 transform 区分。
 * ★ **季/地貌变体**（N1）：`MAPO_REGION_CELLS` 是基础季，`MAPO_REGION_SNOW_CELLS` 是雪件
 *   （`mountain_snow` 同形 prefab，transform 逐形重读 ⛔ 不抄基础季）。哪格用哪套由
 *   `logic/mapoBands.ts` 的 cell 级地貌带定。⚠ **沙漠带的山件 = 基础季件**：
 *   land 表荒地山1..14 的 2D `src_name` 与基础季逐字相同（实测 14/14），⛔ 没有沙件表。
 *   ⚠ `autumn_*` 不接（M0-B3）。
 * ⚠ 锚点是**底边中点**，⛔ 不是几何中心。
 * ★ **件的大小 = `native` × `scale`**（M0-B2，§3.3）：`native` 是原图像素、`scale` 是 prefab 里
 *   那个 sprite 的缩放。m2 只有 563 px 却要盖满 19 格，靠的就是 `mountain19m_01` 的 2.163；
 *   三对共用贴图的形**全靠 transform 区分** ⇒ ⛔ 只用 native 会把 14 形压成 10 形。
 * ★ `offset` 是精灵**中心**相对锚点格的偏移（原版 px，+y 向上）；`pivot` 恒 [0.5, 0.5]。
 *   世界坐标：中心 = 锚点格位置 + toWorld(offset)，底边中点 = 中心 − (0, h/2)。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别按足迹拉伸 ——
 *   `scale` 是原版给的定值，⛔ 不是我们按格数算的。
 */

export interface IMapoRegionCell {
    /** ★ 原版 res 值（48..61），同时是 `regions.bin` 里的 cell 字段。 */
    readonly id: number;
    readonly kind: string;
    /** 基础季 / 雪（N1）。⚠ 沙漠带的山件与基础季同件，⛔ 没有沙件表。 */
    readonly variant: string;
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
    /** ★ **原图像素尺寸**（未裁 bbox），等于 prefab 里 sprite 的 `size`。 */
    readonly native: readonly [number, number];
    /** ★ prefab 里 sprite 的缩放 [x, y]。件的世界尺寸 = native × scale × (halfW / 150)。 */
    readonly scale: readonly [number, number];
    /** ★ 精灵**中心**相对锚点格的偏移（原版 px，+y 向上）。 */
    readonly offset: readonly [number, number];
    /** prefab 里 sprite 绕中心的旋转（**度**，CCW 为正）。 */
    readonly angle: number;
    /** prefab 里 sprite 的轴心，恒 [0.5, 0.5]（中心）。 */
    readonly pivot: readonly [number, number];
    readonly size: readonly [number, number];
    readonly skew: readonly [number, number];
    readonly mirror_x: boolean;
    readonly mirror_y: boolean;
    readonly color: readonly [number, number, number, number];
    readonly add_color: readonly [number, number, number, number];
    /** prefab 里 sprite 的 `low_z`（同节点内的叠序）。 */
    readonly lowZ: number;
}

export const MAPO_REGION_ATLAS_W = 2048;
export const MAPO_REGION_ATLAS_H = 4096;
export const MAPO_REGION_CELL_W = 682;
export const MAPO_REGION_CELL_H = 409;
/** 基础季 13 形。 */
export const MAPO_REGION_CELLS: readonly IMapoRegionCell[] = [
  {
    "id": 48,
    "kind": "mountain",
    "variant": "base",
    "shan": 1,
    "form": "mountain1m_01",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      0,
      0,
      682,
      409
    ],
    "art": [
      200,
      261,
      281,
      148
    ],
    "native": [
      281,
      148
    ],
    "scale": [
      1.16614,
      1.16614
    ],
    "offset": [
      4.416,
      7.8203
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      281.0,
      148.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 49,
    "kind": "mountain",
    "variant": "base",
    "shan": 2,
    "form": "mountain1m_02",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      682,
      0,
      682,
      409
    ],
    "art": [
      197,
      261,
      287,
      148
    ],
    "native": [
      287,
      148
    ],
    "scale": [
      1.22747,
      1.22747
    ],
    "offset": [
      -2.1065,
      5.2822
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      287.0,
      148.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 50,
    "kind": "mountain",
    "variant": "base",
    "shan": 3,
    "form": "mountain1m_03",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      1364,
      0,
      682,
      409
    ],
    "art": [
      197,
      261,
      287,
      148
    ],
    "native": [
      287,
      148
    ],
    "scale": [
      1.17858,
      1.17858
    ],
    "offset": [
      0.0059,
      5.2822
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      287.0,
      148.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      6.688960075378418,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 51,
    "kind": "mountain",
    "variant": "base",
    "shan": 4,
    "form": "mountain1m_04",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      0,
      409,
      682,
      409
    ],
    "art": [
      200,
      261,
      281,
      148
    ],
    "native": [
      281,
      148
    ],
    "scale": [
      1.23793,
      1.11194
    ],
    "offset": [
      1.4141,
      5.9863
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      281.0,
      148.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 52,
    "kind": "mountain",
    "variant": "base",
    "shan": 5,
    "form": "mountain2m_x_01",
    "shape": "2m_x",
    "footprintCells": 2,
    "cell": [
      682,
      409,
      682,
      409
    ],
    "art": [
      130,
      175,
      422,
      234
    ],
    "native": [
      422,
      234
    ],
    "scale": [
      1.195,
      1.00852
    ],
    "offset": [
      74.5283,
      45.6816
    ],
    "angle": -1.7436,
    "lowZ": 1,
    "size": [
      422.0,
      234.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      3.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 53,
    "kind": "mountain",
    "variant": "base",
    "shan": 6,
    "form": "mountain2m_xy_01",
    "shape": "2m_xy",
    "footprintCells": 2,
    "cell": [
      1364,
      409,
      682,
      409
    ],
    "art": [
      189,
      171,
      303,
      238
    ],
    "native": [
      303,
      238
    ],
    "scale": [
      1.23535,
      1.23535
    ],
    "offset": [
      19.5635,
      -60.9512
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      303.0,
      238.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 54,
    "kind": "mountain",
    "variant": "base",
    "shan": 7,
    "form": "mountain2m_y_01",
    "shape": "2m_y",
    "footprintCells": 2,
    "cell": [
      0,
      818,
      682,
      409
    ],
    "art": [
      86,
      231,
      510,
      178
    ],
    "native": [
      510,
      178
    ],
    "scale": [
      1.14433,
      1.14433
    ],
    "offset": [
      104.213,
      -3.167
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      510.0,
      178.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 55,
    "kind": "mountain",
    "variant": "base",
    "shan": 8,
    "form": "mountain4m_01",
    "shape": "4m",
    "footprintCells": 4,
    "cell": [
      682,
      818,
      682,
      409
    ],
    "art": [
      83,
      117,
      516,
      292
    ],
    "native": [
      516,
      292
    ],
    "scale": [
      1.14272,
      1.14272
    ],
    "offset": [
      62.8008,
      48.2871
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      516.0,
      292.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 57,
    "kind": "mountain",
    "variant": "base",
    "shan": 10,
    "form": "mountain7m_01",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      1364,
      818,
      682,
      409
    ],
    "art": [
      13,
      67,
      656,
      342
    ],
    "native": [
      656,
      342
    ],
    "scale": [
      1.11753,
      1.11753
    ],
    "offset": [
      -3.5703,
      10.8662
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      656.0,
      342.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 58,
    "kind": "mountain",
    "variant": "base",
    "shan": 11,
    "form": "mountain7m_02",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      0,
      1227,
      682,
      409
    ],
    "art": [
      12,
      59,
      657,
      350
    ],
    "native": [
      657,
      350
    ],
    "scale": [
      1.12063,
      1.12063
    ],
    "offset": [
      -5.7588,
      -3.2344
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      657.0,
      350.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 59,
    "kind": "mountain",
    "variant": "base",
    "shan": 12,
    "form": "mountain7m_03",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      682,
      1227,
      682,
      409
    ],
    "art": [
      0,
      71,
      682,
      338
    ],
    "native": [
      697,
      345
    ],
    "scale": [
      1.15871,
      1.15871
    ],
    "offset": [
      -25.0195,
      8.2734
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      697.0,
      345.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 60,
    "kind": "mountain",
    "variant": "base",
    "shan": 13,
    "form": "mountain19m_01",
    "shape": "19m",
    "footprintCells": 19,
    "cell": [
      1364,
      1227,
      682,
      409
    ],
    "art": [
      59,
      126,
      563,
      283
    ],
    "native": [
      563,
      283
    ],
    "scale": [
      2.16305,
      2.16305
    ],
    "offset": [
      -7.791,
      22.9844
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      563.0,
      283.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 61,
    "kind": "mountain",
    "variant": "base",
    "shan": 14,
    "form": "mountain19m_02",
    "shape": "19m",
    "footprintCells": 19,
    "cell": [
      0,
      1636,
      682,
      409
    ],
    "art": [
      59,
      126,
      563,
      283
    ],
    "native": [
      563,
      283
    ],
    "scale": [
      2.27932,
      2.08262
    ],
    "offset": [
      -7.7637,
      15.9102
    ],
    "angle": -0.5181,
    "lowZ": 1,
    "size": [
      563.0,
      283.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.5771480202674866
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  }
];
/** 雪山 13 形（id = 原版 res 值；N1）。 */
export const MAPO_REGION_SNOW_CELLS: readonly IMapoRegionCell[] = [
  {
    "id": 48,
    "kind": "mountain",
    "variant": "snow",
    "shan": 1,
    "form": "mountain1m_01",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      682,
      1636,
      682,
      409
    ],
    "art": [
      208,
      254,
      265,
      155
    ],
    "native": [
      265,
      155
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      -1.7148,
      -16.1963
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      265.0,
      155.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 49,
    "kind": "mountain",
    "variant": "snow",
    "shan": 2,
    "form": "mountain1m_02",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      1364,
      1636,
      682,
      409
    ],
    "art": [
      208,
      254,
      265,
      155
    ],
    "native": [
      265,
      155
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      -1.7148,
      -16.1963
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      265.0,
      155.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 50,
    "kind": "mountain",
    "variant": "snow",
    "shan": 3,
    "form": "mountain1m_03",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      0,
      2045,
      682,
      409
    ],
    "art": [
      208,
      254,
      265,
      155
    ],
    "native": [
      265,
      155
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      -1.7148,
      -16.1963
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      265.0,
      155.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 51,
    "kind": "mountain",
    "variant": "snow",
    "shan": 4,
    "form": "mountain1m_04",
    "shape": "1m",
    "footprintCells": 1,
    "cell": [
      682,
      2045,
      682,
      409
    ],
    "art": [
      208,
      254,
      265,
      155
    ],
    "native": [
      265,
      155
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      -1.7148,
      -16.1963
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      265.0,
      155.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 52,
    "kind": "mountain",
    "variant": "snow",
    "shan": 5,
    "form": "mountain2m_x_01",
    "shape": "2m_x",
    "footprintCells": 2,
    "cell": [
      1364,
      2045,
      682,
      409
    ],
    "art": [
      129,
      179,
      423,
      230
    ],
    "native": [
      423,
      230
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      76.5703,
      20.8184
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      423.0,
      230.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 53,
    "kind": "mountain",
    "variant": "snow",
    "shan": 6,
    "form": "mountain2m_xy_01",
    "shape": "2m_xy",
    "footprintCells": 2,
    "cell": [
      0,
      2454,
      682,
      409
    ],
    "art": [
      187,
      152,
      307,
      257
    ],
    "native": [
      307,
      257
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      39.916,
      -51.9434
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      307.0,
      257.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 54,
    "kind": "mountain",
    "variant": "snow",
    "shan": 7,
    "form": "mountain2m_y_01",
    "shape": "2m_y",
    "footprintCells": 2,
    "cell": [
      682,
      2454,
      682,
      409
    ],
    "art": [
      81,
      210,
      520,
      199
    ],
    "native": [
      520,
      199
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      93.3691,
      -41.0293
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      520.0,
      199.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 55,
    "kind": "mountain",
    "variant": "snow",
    "shan": 8,
    "form": "mountain4m_01",
    "shape": "4m",
    "footprintCells": 4,
    "cell": [
      1364,
      2454,
      682,
      409
    ],
    "art": [
      44,
      111,
      593,
      298
    ],
    "native": [
      593,
      298
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      35.7813,
      28.9414
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      593.0,
      298.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 57,
    "kind": "mountain",
    "variant": "snow",
    "shan": 10,
    "form": "mountain7m_01",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      0,
      2863,
      682,
      409
    ],
    "art": [
      0,
      86,
      682,
      323
    ],
    "native": [
      893,
      423
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      13.2217,
      -8.2041
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      893.0,
      423.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 58,
    "kind": "mountain",
    "variant": "snow",
    "shan": 11,
    "form": "mountain7m_02",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      682,
      2863,
      682,
      409
    ],
    "art": [
      0,
      76,
      682,
      333
    ],
    "native": [
      769,
      375
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      -56.5664,
      -1.667
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      769.0,
      375.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 59,
    "kind": "mountain",
    "variant": "snow",
    "shan": 12,
    "form": "mountain7m_03",
    "shape": "7m",
    "footprintCells": 7,
    "cell": [
      1364,
      2863,
      682,
      409
    ],
    "art": [
      0,
      12,
      682,
      397
    ],
    "native": [
      733,
      427
    ],
    "scale": [
      1.0,
      1.0
    ],
    "offset": [
      -26.3818,
      -9.6885
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      733.0,
      427.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 60,
    "kind": "mountain",
    "variant": "snow",
    "shan": 13,
    "form": "mountain19m_01",
    "shape": "19m",
    "footprintCells": 19,
    "cell": [
      0,
      3272,
      682,
      409
    ],
    "art": [
      28,
      81,
      626,
      328
    ],
    "native": [
      626,
      328
    ],
    "scale": [
      2.0,
      2.0
    ],
    "offset": [
      21.0,
      18.5
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      626.0,
      328.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  },
  {
    "id": 61,
    "kind": "mountain",
    "variant": "snow",
    "shan": 14,
    "form": "mountain19m_02",
    "shape": "19m",
    "footprintCells": 19,
    "cell": [
      682,
      3272,
      682,
      409
    ],
    "art": [
      28,
      81,
      626,
      328
    ],
    "native": [
      626,
      328
    ],
    "scale": [
      2.0,
      2.0
    ],
    "offset": [
      21.0,
      18.5
    ],
    "angle": 0.0,
    "lowZ": 1,
    "size": [
      626.0,
      328.0
    ],
    "pivot": [
      0.5,
      0.5
    ],
    "skew": [
      0.0,
      0.0
    ],
    "mirror_x": false,
    "mirror_y": false,
    "color": [
      255,
      255,
      255,
      255
    ],
    "add_color": [
      0,
      0,
      0,
      0
    ]
  }
];
