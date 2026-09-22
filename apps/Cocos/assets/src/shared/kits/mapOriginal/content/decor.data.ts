/**
 * mapOriginal 摆件图集布局（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 格 id = **原版 res 值**（2..46）：客户端拿到某格的值就直接查到该放哪张图，⛔ 零猜测。
 *   这是「按原游戏参数摆放」的落点——原作近档就是逐格一个 res_field，由该格的类型+等级决定。
 * ★ `native` 是**原图像素尺寸**：原版 2D 一格 300×150 px（config_2d 的 TILE_WIDTH/HEIGHT 是半值），
 *   所以件的世界宽 = native[0] × (MAPO_TILE_HALF_W / 150)。资源件实测占 0.53~1.10 格
 *   —— 等级差本来就体现在**件的大小**上，⛔ 别再按固定格宽拉伸（那会把等级差抹平）。
 * ⚠ 锚点是**底边中点**（地物立在菱形中心上），⛔ 不是几何中心。
 * ⚠ 原版没单独出图的等级用最近一级顶上（`MAPO_DECOR_SUBSTITUTIONS`）。
 */

export interface IMapoDecorCell {
  readonly id: number;
  readonly kind: string;
  readonly cell: readonly [number, number, number, number];
  readonly art: readonly [number, number, number, number];
  /** ★ **原图像素尺寸**（切片时的原始大小）。件在世界里多大由它定，⛔ 不是按格拉伸。 */
  readonly native: readonly [number, number];
  readonly resType?: string;
  readonly level?: number;
}

export const MAPO_DECOR_ATLAS_W = 2048;
export const MAPO_DECOR_ATLAS_H = 2048;
export const MAPO_DECOR_CELL_W = 256;
export const MAPO_DECOR_CELL_H = 192;
/** 城址件的起始格 id；`city_center.lua` 的 249 座城按真坐标落在这里。 */
export const MAPO_DECOR_CITY_BASE = 64;
/** 原版缺级、用邻近级顶上的记录（只作存证）。 */
export const MAPO_DECOR_SUBSTITUTIONS: readonly (number | string)[] = ["5(用3级)", "7(用5级)", "12(用2级)", "22(用2级)", "32(用5级)", "33(用5级)", "34(用5级)", "35(用5级)"];
export const MAPO_DECOR_CELLS: readonly IMapoDecorCell[] = [
  {
    "id": 2,
    "cell": [
      512,
      0,
      256,
      192
    ],
    "art": [
      115,
      141,
      26,
      51
    ],
    "native": [
      26,
      51
    ],
    "kind": "res",
    "resType": "wood",
    "level": 1
  },
  {
    "id": 3,
    "cell": [
      768,
      0,
      256,
      192
    ],
    "art": [
      119,
      167,
      18,
      25
    ],
    "native": [
      18,
      25
    ],
    "kind": "res",
    "resType": "wood",
    "level": 2
  },
  {
    "id": 4,
    "cell": [
      1024,
      0,
      256,
      192
    ],
    "art": [
      103,
      134,
      50,
      58
    ],
    "native": [
      50,
      58
    ],
    "kind": "res",
    "resType": "wood",
    "level": 3
  },
  {
    "id": 5,
    "cell": [
      1280,
      0,
      256,
      192
    ],
    "art": [
      103,
      134,
      50,
      58
    ],
    "native": [
      50,
      58
    ],
    "kind": "res",
    "resType": "wood",
    "level": 4
  },
  {
    "id": 6,
    "cell": [
      1536,
      0,
      256,
      192
    ],
    "art": [
      2,
      42,
      251,
      150
    ],
    "native": [
      251,
      150
    ],
    "kind": "res",
    "resType": "wood",
    "level": 5
  },
  {
    "id": 7,
    "cell": [
      1792,
      0,
      256,
      192
    ],
    "art": [
      2,
      42,
      251,
      150
    ],
    "native": [
      251,
      150
    ],
    "kind": "res",
    "resType": "wood",
    "level": 6
  },
  {
    "id": 8,
    "cell": [
      0,
      192,
      256,
      192
    ],
    "art": [
      0,
      62,
      256,
      130
    ],
    "native": [
      275,
      140
    ],
    "kind": "res",
    "resType": "wood",
    "level": 7
  },
  {
    "id": 9,
    "cell": [
      256,
      192,
      256,
      192
    ],
    "art": [
      0,
      44,
      256,
      148
    ],
    "native": [
      274,
      158
    ],
    "kind": "res",
    "resType": "wood",
    "level": 8
  },
  {
    "id": 10,
    "cell": [
      512,
      192,
      256,
      192
    ],
    "art": [
      0,
      45,
      256,
      147
    ],
    "native": [
      282,
      162
    ],
    "kind": "res",
    "resType": "wood",
    "level": 9
  },
  {
    "id": 11,
    "cell": [
      768,
      192,
      256,
      192
    ],
    "art": [
      10,
      55,
      235,
      137
    ],
    "native": [
      235,
      137
    ],
    "kind": "res",
    "resType": "wood",
    "level": 10
  },
  {
    "id": 12,
    "cell": [
      1024,
      192,
      256,
      192
    ],
    "art": [
      38,
      108,
      179,
      84
    ],
    "native": [
      179,
      84
    ],
    "kind": "res",
    "resType": "iron",
    "level": 1
  },
  {
    "id": 13,
    "cell": [
      1280,
      192,
      256,
      192
    ],
    "art": [
      38,
      108,
      179,
      84
    ],
    "native": [
      179,
      84
    ],
    "kind": "res",
    "resType": "iron",
    "level": 2
  },
  {
    "id": 14,
    "cell": [
      1536,
      192,
      256,
      192
    ],
    "art": [
      36,
      105,
      184,
      87
    ],
    "native": [
      184,
      87
    ],
    "kind": "res",
    "resType": "iron",
    "level": 3
  },
  {
    "id": 15,
    "cell": [
      1792,
      192,
      256,
      192
    ],
    "art": [
      33,
      94,
      189,
      98
    ],
    "native": [
      189,
      98
    ],
    "kind": "res",
    "resType": "iron",
    "level": 4
  },
  {
    "id": 16,
    "cell": [
      0,
      384,
      256,
      192
    ],
    "art": [
      8,
      81,
      239,
      111
    ],
    "native": [
      239,
      111
    ],
    "kind": "res",
    "resType": "iron",
    "level": 5
  },
  {
    "id": 17,
    "cell": [
      256,
      384,
      256,
      192
    ],
    "art": [
      7,
      77,
      241,
      115
    ],
    "native": [
      241,
      115
    ],
    "kind": "res",
    "resType": "iron",
    "level": 6
  },
  {
    "id": 18,
    "cell": [
      512,
      384,
      256,
      192
    ],
    "art": [
      13,
      63,
      229,
      129
    ],
    "native": [
      229,
      129
    ],
    "kind": "res",
    "resType": "iron",
    "level": 7
  },
  {
    "id": 19,
    "cell": [
      768,
      384,
      256,
      192
    ],
    "art": [
      0,
      61,
      256,
      131
    ],
    "native": [
      262,
      134
    ],
    "kind": "res",
    "resType": "iron",
    "level": 8
  },
  {
    "id": 20,
    "cell": [
      1024,
      384,
      256,
      192
    ],
    "art": [
      6,
      62,
      244,
      130
    ],
    "native": [
      244,
      130
    ],
    "kind": "res",
    "resType": "iron",
    "level": 9
  },
  {
    "id": 21,
    "cell": [
      1280,
      384,
      256,
      192
    ],
    "art": [
      0,
      60,
      256,
      132
    ],
    "native": [
      279,
      144
    ],
    "kind": "res",
    "resType": "iron",
    "level": 10
  },
  {
    "id": 22,
    "cell": [
      1536,
      384,
      256,
      192
    ],
    "art": [
      16,
      97,
      224,
      95
    ],
    "native": [
      224,
      95
    ],
    "kind": "res",
    "resType": "stone",
    "level": 1
  },
  {
    "id": 23,
    "cell": [
      1792,
      384,
      256,
      192
    ],
    "art": [
      16,
      97,
      224,
      95
    ],
    "native": [
      224,
      95
    ],
    "kind": "res",
    "resType": "stone",
    "level": 2
  },
  {
    "id": 24,
    "cell": [
      0,
      576,
      256,
      192
    ],
    "art": [
      13,
      108,
      230,
      84
    ],
    "native": [
      230,
      84
    ],
    "kind": "res",
    "resType": "stone",
    "level": 3
  },
  {
    "id": 25,
    "cell": [
      256,
      576,
      256,
      192
    ],
    "art": [
      40,
      105,
      176,
      87
    ],
    "native": [
      176,
      87
    ],
    "kind": "res",
    "resType": "stone",
    "level": 4
  },
  {
    "id": 26,
    "cell": [
      512,
      576,
      256,
      192
    ],
    "art": [
      13,
      85,
      229,
      107
    ],
    "native": [
      229,
      107
    ],
    "kind": "res",
    "resType": "stone",
    "level": 5
  },
  {
    "id": 27,
    "cell": [
      768,
      576,
      256,
      192
    ],
    "art": [
      13,
      83,
      229,
      109
    ],
    "native": [
      229,
      109
    ],
    "kind": "res",
    "resType": "stone",
    "level": 6
  },
  {
    "id": 28,
    "cell": [
      1024,
      576,
      256,
      192
    ],
    "art": [
      2,
      71,
      252,
      121
    ],
    "native": [
      252,
      121
    ],
    "kind": "res",
    "resType": "stone",
    "level": 7
  },
  {
    "id": 29,
    "cell": [
      1280,
      576,
      256,
      192
    ],
    "art": [
      2,
      65,
      252,
      127
    ],
    "native": [
      252,
      127
    ],
    "kind": "res",
    "resType": "stone",
    "level": 8
  },
  {
    "id": 30,
    "cell": [
      1536,
      576,
      256,
      192
    ],
    "art": [
      4,
      57,
      248,
      135
    ],
    "native": [
      248,
      135
    ],
    "kind": "res",
    "resType": "stone",
    "level": 9
  },
  {
    "id": 31,
    "cell": [
      1792,
      576,
      256,
      192
    ],
    "art": [
      0,
      67,
      256,
      125
    ],
    "native": [
      286,
      140
    ],
    "kind": "res",
    "resType": "stone",
    "level": 10
  },
  {
    "id": 32,
    "cell": [
      0,
      768,
      256,
      192
    ],
    "art": [
      30,
      64,
      196,
      128
    ],
    "native": [
      196,
      128
    ],
    "kind": "res",
    "resType": "food",
    "level": 1
  },
  {
    "id": 33,
    "cell": [
      256,
      768,
      256,
      192
    ],
    "art": [
      30,
      64,
      196,
      128
    ],
    "native": [
      196,
      128
    ],
    "kind": "res",
    "resType": "food",
    "level": 2
  },
  {
    "id": 34,
    "cell": [
      512,
      768,
      256,
      192
    ],
    "art": [
      30,
      64,
      196,
      128
    ],
    "native": [
      196,
      128
    ],
    "kind": "res",
    "resType": "food",
    "level": 3
  },
  {
    "id": 35,
    "cell": [
      768,
      768,
      256,
      192
    ],
    "art": [
      30,
      64,
      196,
      128
    ],
    "native": [
      196,
      128
    ],
    "kind": "res",
    "resType": "food",
    "level": 4
  },
  {
    "id": 36,
    "cell": [
      1024,
      768,
      256,
      192
    ],
    "art": [
      30,
      64,
      196,
      128
    ],
    "native": [
      196,
      128
    ],
    "kind": "res",
    "resType": "food",
    "level": 5
  },
  {
    "id": 37,
    "cell": [
      1280,
      768,
      256,
      192
    ],
    "art": [
      3,
      60,
      250,
      132
    ],
    "native": [
      250,
      132
    ],
    "kind": "res",
    "resType": "food",
    "level": 6
  },
  {
    "id": 38,
    "cell": [
      1536,
      768,
      256,
      192
    ],
    "art": [
      2,
      52,
      251,
      140
    ],
    "native": [
      251,
      140
    ],
    "kind": "res",
    "resType": "food",
    "level": 7
  },
  {
    "id": 39,
    "cell": [
      1792,
      768,
      256,
      192
    ],
    "art": [
      0,
      57,
      256,
      135
    ],
    "native": [
      277,
      146
    ],
    "kind": "res",
    "resType": "food",
    "level": 8
  },
  {
    "id": 40,
    "cell": [
      0,
      960,
      256,
      192
    ],
    "art": [
      0,
      67,
      256,
      125
    ],
    "native": [
      287,
      140
    ],
    "kind": "res",
    "resType": "food",
    "level": 9
  },
  {
    "id": 41,
    "cell": [
      256,
      960,
      256,
      192
    ],
    "art": [
      48,
      111,
      159,
      81
    ],
    "native": [
      159,
      81
    ],
    "kind": "res",
    "resType": "food",
    "level": 10
  },
  {
    "id": 42,
    "cell": [
      512,
      960,
      256,
      192
    ],
    "art": [
      28,
      82,
      200,
      110
    ],
    "native": [
      200,
      110
    ],
    "kind": "res",
    "resType": "gold",
    "level": 1
  },
  {
    "id": 43,
    "cell": [
      768,
      960,
      256,
      192
    ],
    "art": [
      13,
      71,
      229,
      121
    ],
    "native": [
      229,
      121
    ],
    "kind": "res",
    "resType": "gold",
    "level": 2
  },
  {
    "id": 44,
    "cell": [
      1024,
      960,
      256,
      192
    ],
    "art": [
      0,
      60,
      256,
      132
    ],
    "native": [
      262,
      135
    ],
    "kind": "res",
    "resType": "gold",
    "level": 3
  },
  {
    "id": 45,
    "cell": [
      1280,
      960,
      256,
      192
    ],
    "art": [
      0,
      64,
      256,
      128
    ],
    "native": [
      278,
      139
    ],
    "kind": "res",
    "resType": "gold",
    "level": 4
  },
  {
    "id": 46,
    "cell": [
      1536,
      960,
      256,
      192
    ],
    "art": [
      0,
      68,
      256,
      124
    ],
    "native": [
      276,
      134
    ],
    "kind": "res",
    "resType": "gold",
    "level": 5
  },
  {
    "id": 64,
    "cell": [
      0,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 65,
    "cell": [
      256,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 66,
    "cell": [
      512,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 67,
    "cell": [
      768,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 68,
    "cell": [
      1024,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 69,
    "cell": [
      1280,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 70,
    "cell": [
      1536,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  },
  {
    "id": 71,
    "cell": [
      1792,
      1536,
      256,
      192
    ],
    "art": [
      32,
      0,
      192,
      192
    ],
    "native": [
      512,
      512
    ],
    "kind": "city"
  }
];
