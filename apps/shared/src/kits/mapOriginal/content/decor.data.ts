/**
 * mapOriginal 摆件图集布局（s1）—— **生成物，⛔ 勿手改**。
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
 * ★ `native` 是贴图像素；资源件显示尺寸 = `transform.size × transform.scale × (halfW / 150)`。
 *   `transform.offset` 是锚点相对格心的原版像素偏移（+y 向上），当前主片 pivot 均为中心。
 *   mesh 直接消费锚点位置和 pivot，⛔ 不可把图底放到格心或再减半高（MAPORIGINAL-2D §2.2）。
 * ⚠ 原版个别级的 prefab 缺/无可用 sprite，用同套同类最近一级顶上（`MAPO_DECOR_SUBSTITUTIONS`）。
 */

export interface IMapoDecorTransform {
  readonly size: readonly [number, number];
  readonly scale: readonly [number, number];
  readonly offset: readonly [number, number];
  readonly pivot: readonly [number, number];
  readonly angle: number;
}

interface IMapoDecorArt {
  readonly id: number;
  /** 基础季 / 雪 / 沙（N1）。 */
  readonly variant: string;
  readonly cell: readonly [number, number, number, number];
  readonly art: readonly [number, number, number, number];
  /** 贴图原始像素尺寸；资源件显示矩形由 transform 决定。 */
  readonly native: readonly [number, number];
  readonly resType?: string;
  readonly level?: number;
}

/** 城址旧切片只留作存档；实际城址由 mapoCities 渲染。资源件必须携带原版 transform。 */
export type IMapoDecorCell = IMapoDecorArt & (
  { readonly kind: "res"; readonly transform: IMapoDecorTransform }
  | { readonly kind: "city" }
);

export const MAPO_DECOR_ATLAS_W = 4096;
export const MAPO_DECOR_ATLAS_H = 2048;
export const MAPO_DECOR_CELL_W = 256;
export const MAPO_DECOR_CELL_H = 192;
/** 城址件的起始格 id；`city_center.lua` 的 249 座城按真坐标落在这里。 */
export const MAPO_DECOR_CITY_BASE = 64;
/** 原版缺级、用邻近级顶上的记录（只作存证），按套件分键。 */
export const MAPO_DECOR_SUBSTITUTIONS: Readonly<Record<string, readonly (number | string)[]>> = {"base": ["22(food用3级)", "23(food用3级)", "36(iron用4级)", "39(iron用7级)", "40(iron用7级)", "41(iron用7级)"], "snow": ["22(food用3级)", "23(food用3级)"], "desert": []};
/** 基础季（含城址件）。 */
export const MAPO_DECOR_CELLS: readonly IMapoDecorCell[] = [
  {
    "cell": [
      0,
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
    "id": 2,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 1,
    "transform": {
      "size": [
        50.0,
        58.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        2.7998,
        -27.084
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      0,
      256,
      192
    ],
    "art": [
      70,
      82,
      115,
      110
    ],
    "native": [
      115,
      110
    ],
    "id": 3,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 2,
    "transform": {
      "size": [
        115.0,
        110.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.68457,
        9.75391
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      0,
      256,
      192
    ],
    "art": [
      12,
      73,
      232,
      119
    ],
    "native": [
      232,
      119
    ],
    "id": 4,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 3,
    "transform": {
      "size": [
        232.0,
        119.0
      ],
      "scale": [
        0.922414,
        0.915966
      ],
      "offset": [
        -7.29297,
        3.62402
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      0,
      256,
      192
    ],
    "art": [
      14,
      59,
      227,
      133
    ],
    "native": [
      227,
      133
    ],
    "id": 5,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 4,
    "transform": {
      "size": [
        227.0,
        133.0
      ],
      "scale": [
        1.02745,
        1.05839
      ],
      "offset": [
        3.63086,
        8.05078
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
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
    "id": 6,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 5,
    "transform": {
      "size": [
        251.0,
        150.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.60742,
        3.77734
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      0,
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
    "id": 7,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 6,
    "transform": {
      "size": [
        235.0,
        137.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -2.0,
        17.0
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      0,
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
    "id": 8,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 7,
    "transform": {
      "size": [
        275.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -7.51563,
        1.36719
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      0,
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
    "id": 9,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 8,
    "transform": {
      "size": [
        274.0,
        158.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -8.59766,
        -1.87891
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      0,
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
    "id": 10,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 9,
    "transform": {
      "size": [
        282.0,
        162.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.1875,
        0.285156
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      0,
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
      329,
      174
    ],
    "id": 11,
    "kind": "res",
    "variant": "base",
    "resType": "wood",
    "level": 10,
    "transform": {
      "size": [
        329.0,
        174.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.1875,
        -2.41992
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      0,
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
    "id": 12,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 1,
    "transform": {
      "size": [
        224.0,
        95.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -15.751,
        -0.233398
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      0,
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
    "id": 13,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 2,
    "transform": {
      "size": [
        230.0,
        84.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        3.07422,
        2.81934
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      0,
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
    "id": 14,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 3,
    "transform": {
      "size": [
        176.0,
        87.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -18.294901,
        8.9248
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      0,
      256,
      192
    ],
    "art": [
      40,
      80,
      175,
      112
    ],
    "native": [
      175,
      112
    ],
    "id": 15,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 4,
    "transform": {
      "size": [
        175.0,
        112.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -13.0469,
        6.81738
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
      0,
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
    "id": 16,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 5,
    "transform": {
      "size": [
        229.0,
        107.0
      ],
      "scale": [
        0.9869,
        1.00935
      ],
      "offset": [
        -2.1084,
        7.34961
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
      0,
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
    "id": 17,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 6,
    "transform": {
      "size": [
        229.0,
        109.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.530273,
        6.38086
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      192,
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
    "id": 18,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 7,
    "transform": {
      "size": [
        252.0,
        121.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        3.07422,
        7.39844
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      192,
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
    "id": 19,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 8,
    "transform": {
      "size": [
        252.0,
        127.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        2.56543,
        -2.26855
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      192,
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
    "id": 20,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 9,
    "transform": {
      "size": [
        248.0,
        135.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -2.01367,
        3.83691
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      192,
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
    "id": 21,
    "kind": "res",
    "variant": "base",
    "resType": "stone",
    "level": 10,
    "transform": {
      "size": [
        286.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.50488,
        8.9248
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
      192,
      256,
      192
    ],
    "art": [
      67,
      116,
      122,
      76
    ],
    "native": [
      122,
      76
    ],
    "id": 22,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 1,
    "transform": {
      "size": [
        122.0,
        76.0
      ],
      "scale": [
        1.17213,
        1.21053
      ],
      "offset": [
        30.058599,
        13.457
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      192,
      256,
      192
    ],
    "art": [
      67,
      116,
      122,
      76
    ],
    "native": [
      122,
      76
    ],
    "id": 23,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 2,
    "transform": {
      "size": [
        122.0,
        76.0
      ],
      "scale": [
        1.17213,
        1.21053
      ],
      "offset": [
        30.058599,
        13.457
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      192,
      256,
      192
    ],
    "art": [
      67,
      116,
      122,
      76
    ],
    "native": [
      122,
      76
    ],
    "id": 24,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 3,
    "transform": {
      "size": [
        122.0,
        76.0
      ],
      "scale": [
        1.17213,
        1.21053
      ],
      "offset": [
        30.058599,
        13.457
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      192,
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
    "id": 25,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 4,
    "transform": {
      "size": [
        159.0,
        81.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        17.882799,
        10.1445
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      192,
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
    "id": 26,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 5,
    "transform": {
      "size": [
        196.0,
        128.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -8.05469,
        -3.63477
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      192,
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
    "id": 27,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 6,
    "transform": {
      "size": [
        250.0,
        132.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        5.41016,
        -0.450195
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      192,
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
    "id": 28,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 7,
    "transform": {
      "size": [
        251.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -0.899414,
        0.451172
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      192,
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
    "id": 29,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 8,
    "transform": {
      "size": [
        277.0,
        146.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.80078,
        5.85938
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      192,
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
    "id": 30,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 9,
    "transform": {
      "size": [
        287.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -6.30762,
        6.76074
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      192,
      256,
      192
    ],
    "art": [
      0,
      65,
      256,
      127
    ],
    "native": [
      312,
      155
    ],
    "id": 31,
    "kind": "res",
    "variant": "base",
    "resType": "food",
    "level": 10,
    "transform": {
      "size": [
        312.0,
        155.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -8.11035,
        -1.35156
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
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
    "id": 32,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 1,
    "transform": {
      "size": [
        179.0,
        84.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        21.0273,
        -2.58008
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
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
    "id": 33,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 2,
    "transform": {
      "size": [
        184.0,
        87.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        8.17969,
        -7.83594
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      384,
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
    "id": 34,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 3,
    "transform": {
      "size": [
        189.0,
        98.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.0918,
        10.2676
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      384,
      256,
      192
    ],
    "art": [
      5,
      100,
      245,
      92
    ],
    "native": [
      245,
      92
    ],
    "id": 35,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 4,
    "transform": {
      "size": [
        245.0,
        92.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.54785,
        -1.12695
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      384,
      256,
      192
    ],
    "art": [
      5,
      100,
      245,
      92
    ],
    "native": [
      245,
      92
    ],
    "id": 36,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 5,
    "transform": {
      "size": [
        245.0,
        92.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.54785,
        -1.12695
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
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
    "id": 37,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 6,
    "transform": {
      "size": [
        241.0,
        115.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -2.33203,
        0.339844
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
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
    "id": 38,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 7,
    "transform": {
      "size": [
        229.0,
        129.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.08398,
        4.42773
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
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
    "id": 39,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 8,
    "transform": {
      "size": [
        229.0,
        129.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.08398,
        4.42773
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
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
    "id": 40,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 9,
    "transform": {
      "size": [
        229.0,
        129.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.08398,
        4.42773
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
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
    "id": 41,
    "kind": "res",
    "variant": "base",
    "resType": "iron",
    "level": 10,
    "transform": {
      "size": [
        229.0,
        129.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.08398,
        4.42773
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      384,
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
    "id": 42,
    "kind": "res",
    "variant": "base",
    "resType": "gold",
    "level": 1,
    "transform": {
      "size": [
        200.0,
        110.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.233398,
        2.4873
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      384,
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
    "id": 43,
    "kind": "res",
    "variant": "base",
    "resType": "gold",
    "level": 2,
    "transform": {
      "size": [
        229.0,
        121.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -5.5127,
        7.58496
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
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
      262,
      135
    ],
    "id": 44,
    "kind": "res",
    "variant": "base",
    "resType": "gold",
    "level": 3,
    "transform": {
      "size": [
        262.0,
        135.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        3.2207,
        2.82129
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      384,
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
    "id": 45,
    "kind": "res",
    "variant": "base",
    "resType": "gold",
    "level": 4,
    "transform": {
      "size": [
        278.0,
        139.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.54297,
        3.61523
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      384,
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
    "id": 46,
    "kind": "res",
    "variant": "base",
    "resType": "gold",
    "level": 5,
    "transform": {
      "size": [
        276.0,
        134.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        1.63281,
        5.20313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      384,
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
    "id": 64,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      3584,
      384,
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
    "id": 65,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      3840,
      384,
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
    "id": 66,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      0,
      576,
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
    "id": 67,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      256,
      576,
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
    "id": 68,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      512,
      576,
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
    "id": 69,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      768,
      576,
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
    "id": 70,
    "kind": "city",
    "variant": "base"
  },
  {
    "cell": [
      1024,
      576,
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
    "id": 71,
    "kind": "city",
    "variant": "base"
  }
];
/** 雪地件（id = 原版 res 值）。 */
export const MAPO_DECOR_SNOW_CELLS: readonly IMapoDecorCell[] = [
  {
    "cell": [
      1280,
      576,
      256,
      192
    ],
    "art": [
      65,
      118,
      126,
      74
    ],
    "native": [
      126,
      74
    ],
    "id": 2,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 1,
    "transform": {
      "size": [
        126.0,
        74.0
      ],
      "scale": [
        1.38489,
        1.38489
      ],
      "offset": [
        2.56348,
        -0.324219
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      576,
      256,
      192
    ],
    "art": [
      7,
      83,
      242,
      109
    ],
    "native": [
      242,
      109
    ],
    "id": 3,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 2,
    "transform": {
      "size": [
        242.0,
        109.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -12.9297,
        5.12207
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      576,
      256,
      192
    ],
    "art": [
      17,
      68,
      221,
      124
    ],
    "native": [
      221,
      124
    ],
    "id": 4,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 3,
    "transform": {
      "size": [
        221.0,
        124.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -7.86328,
        -7.60059
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      576,
      256,
      192
    ],
    "art": [
      8,
      70,
      240,
      122
    ],
    "native": [
      240,
      122
    ],
    "id": 5,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 4,
    "transform": {
      "size": [
        240.0,
        122.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.15039,
        -0.131836
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      576,
      256,
      192
    ],
    "art": [
      0,
      51,
      256,
      141
    ],
    "native": [
      258,
      142
    ],
    "id": 6,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 5,
    "transform": {
      "size": [
        258.0,
        142.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.21484,
        1.875
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      576,
      256,
      192
    ],
    "art": [
      17,
      78,
      221,
      114
    ],
    "native": [
      221,
      114
    ],
    "id": 7,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 6,
    "transform": {
      "size": [
        221.0,
        114.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.77734,
        6.07227
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      576,
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
      290,
      141
    ],
    "id": 8,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 7,
    "transform": {
      "size": [
        290.0,
        141.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -9.71094,
        4.16406
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      576,
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
      258,
      149
    ],
    "id": 9,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 8,
    "transform": {
      "size": [
        258.0,
        149.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -6.85156,
        -2.15918
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      576,
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
      268,
      155
    ],
    "id": 10,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 9,
    "transform": {
      "size": [
        268.0,
        155.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -10.3096,
        4.75391
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
      576,
      256,
      192
    ],
    "art": [
      0,
      54,
      256,
      138
    ],
    "native": [
      299,
      161
    ],
    "id": 11,
    "kind": "res",
    "variant": "snow",
    "resType": "wood",
    "level": 10,
    "transform": {
      "size": [
        299.0,
        161.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -10.5547,
        -1.44727
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
      576,
      256,
      192
    ],
    "art": [
      29,
      104,
      197,
      88
    ],
    "native": [
      197,
      88
    ],
    "id": 12,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 1,
    "transform": {
      "size": [
        197.0,
        88.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -11.0557,
        4.92871
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      768,
      256,
      192
    ],
    "art": [
      39,
      108,
      178,
      84
    ],
    "native": [
      178,
      84
    ],
    "id": 13,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 2,
    "transform": {
      "size": [
        178.0,
        84.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        20.563499,
        3.42578
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      768,
      256,
      192
    ],
    "art": [
      31,
      86,
      194,
      106
    ],
    "native": [
      194,
      106
    ],
    "id": 14,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 3,
    "transform": {
      "size": [
        194.0,
        106.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -10.5781,
        -0.908203
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      768,
      256,
      192
    ],
    "art": [
      19,
      53,
      217,
      139
    ],
    "native": [
      217,
      139
    ],
    "id": 15,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 4,
    "transform": {
      "size": [
        217.0,
        139.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.99707,
        -5.13965
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      768,
      256,
      192
    ],
    "art": [
      10,
      72,
      235,
      120
    ],
    "native": [
      235,
      120
    ],
    "id": 16,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 5,
    "transform": {
      "size": [
        235.0,
        120.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.02832,
        10.6885
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
      768,
      256,
      192
    ],
    "art": [
      13,
      78,
      230,
      114
    ],
    "native": [
      230,
      114
    ],
    "id": 17,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 6,
    "transform": {
      "size": [
        230.0,
        114.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.504883,
        6.91504
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      768,
      256,
      192
    ],
    "art": [
      4,
      71,
      248,
      121
    ],
    "native": [
      248,
      121
    ],
    "id": 18,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 7,
    "transform": {
      "size": [
        248.0,
        121.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.603516,
        7.00586
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      768,
      256,
      192
    ],
    "art": [
      6,
      64,
      243,
      128
    ],
    "native": [
      243,
      128
    ],
    "id": 19,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 8,
    "transform": {
      "size": [
        243.0,
        128.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -0.242188,
        -2.51367
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      768,
      256,
      192
    ],
    "art": [
      4,
      56,
      248,
      136
    ],
    "native": [
      248,
      136
    ],
    "id": 20,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 9,
    "transform": {
      "size": [
        248.0,
        136.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.16309,
        5.15625
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      768,
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
      275,
      138
    ],
    "id": 21,
    "kind": "res",
    "variant": "snow",
    "resType": "stone",
    "level": 10,
    "transform": {
      "size": [
        275.0,
        138.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.05176,
        9.19043
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      768,
      256,
      192
    ],
    "art": [
      67,
      110,
      122,
      82
    ],
    "native": [
      122,
      82
    ],
    "id": 22,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 1,
    "transform": {
      "size": [
        122.0,
        82.0
      ],
      "scale": [
        1.11784,
        1.11784
      ],
      "offset": [
        29.500999,
        17.0313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      768,
      256,
      192
    ],
    "art": [
      67,
      110,
      122,
      82
    ],
    "native": [
      122,
      82
    ],
    "id": 23,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 2,
    "transform": {
      "size": [
        122.0,
        82.0
      ],
      "scale": [
        1.11784,
        1.11784
      ],
      "offset": [
        29.500999,
        17.0313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      768,
      256,
      192
    ],
    "art": [
      67,
      110,
      122,
      82
    ],
    "native": [
      122,
      82
    ],
    "id": 24,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 3,
    "transform": {
      "size": [
        122.0,
        82.0
      ],
      "scale": [
        1.11784,
        1.11784
      ],
      "offset": [
        29.500999,
        17.0313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      768,
      256,
      192
    ],
    "art": [
      40,
      117,
      176,
      75
    ],
    "native": [
      176,
      75
    ],
    "id": 25,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 4,
    "transform": {
      "size": [
        176.0,
        75.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        10.2012,
        6.31641
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      768,
      256,
      192
    ],
    "art": [
      27,
      61,
      201,
      131
    ],
    "native": [
      201,
      131
    ],
    "id": 26,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 5,
    "transform": {
      "size": [
        201.0,
        131.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -6.80859,
        -4.23047
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
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
    "id": 27,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 6,
    "transform": {
      "size": [
        251.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.63672,
        3.78125
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
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
    "id": 28,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 7,
    "transform": {
      "size": [
        251.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -2.80273,
        0.347656
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      960,
      256,
      192
    ],
    "art": [
      0,
      58,
      256,
      134
    ],
    "native": [
      277,
      145
    ],
    "id": 29,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 8,
    "transform": {
      "size": [
        277.0,
        145.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.6582,
        6.07031
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
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
      286,
      140
    ],
    "id": 30,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 9,
    "transform": {
      "size": [
        286.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -6.23633,
        7.21484
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      960,
      256,
      192
    ],
    "art": [
      0,
      65,
      256,
      127
    ],
    "native": [
      312,
      155
    ],
    "id": 31,
    "kind": "res",
    "variant": "snow",
    "resType": "food",
    "level": 10,
    "transform": {
      "size": [
        312.0,
        155.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -8.41992,
        0.263672
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      960,
      256,
      192
    ],
    "art": [
      51,
      112,
      154,
      80
    ],
    "native": [
      154,
      80
    ],
    "id": 32,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 1,
    "transform": {
      "size": [
        154.0,
        80.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        36.6133,
        -1.90625
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
      960,
      256,
      192
    ],
    "art": [
      25,
      94,
      206,
      98
    ],
    "native": [
      206,
      98
    ],
    "id": 33,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 2,
    "transform": {
      "size": [
        206.0,
        98.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -0.78418,
        -7.74121
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      960,
      256,
      192
    ],
    "art": [
      48,
      101,
      159,
      91
    ],
    "native": [
      159,
      91
    ],
    "id": 34,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 3,
    "transform": {
      "size": [
        159.0,
        91.0
      ],
      "scale": [
        1.10703,
        1.10703
      ],
      "offset": [
        4.24512,
        5.59961
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      960,
      256,
      192
    ],
    "art": [
      5,
      96,
      245,
      96
    ],
    "native": [
      245,
      96
    ],
    "id": 35,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 4,
    "transform": {
      "size": [
        245.0,
        96.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.30762,
        -2.01855
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      960,
      256,
      192
    ],
    "art": [
      7,
      82,
      241,
      110
    ],
    "native": [
      241,
      110
    ],
    "id": 36,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 5,
    "transform": {
      "size": [
        241.0,
        110.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        3.33691,
        -0.732422
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      960,
      256,
      192
    ],
    "art": [
      12,
      78,
      231,
      114
    ],
    "native": [
      231,
      114
    ],
    "id": 37,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 6,
    "transform": {
      "size": [
        231.0,
        114.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.0166,
        1.7627
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      960,
      256,
      192
    ],
    "art": [
      11,
      61,
      234,
      131
    ],
    "native": [
      234,
      131
    ],
    "id": 38,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 7,
    "transform": {
      "size": [
        234.0,
        131.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.77441,
        4.41699
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      960,
      256,
      192
    ],
    "art": [
      0,
      65,
      256,
      127
    ],
    "native": [
      268,
      133
    ],
    "id": 39,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 8,
    "transform": {
      "size": [
        268.0,
        133.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        11.7051,
        5.95703
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      960,
      256,
      192
    ],
    "art": [
      7,
      67,
      241,
      125
    ],
    "native": [
      241,
      125
    ],
    "id": 40,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 9,
    "transform": {
      "size": [
        241.0,
        125.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -4.24219,
        10.0488
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      960,
      256,
      192
    ],
    "art": [
      0,
      56,
      256,
      136
    ],
    "native": [
      264,
      140
    ],
    "id": 41,
    "kind": "res",
    "variant": "snow",
    "resType": "iron",
    "level": 10,
    "transform": {
      "size": [
        264.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        1.6084,
        3.94434
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      960,
      256,
      192
    ],
    "art": [
      24,
      80,
      208,
      112
    ],
    "native": [
      208,
      112
    ],
    "id": 42,
    "kind": "res",
    "variant": "snow",
    "resType": "gold",
    "level": 1,
    "transform": {
      "size": [
        208.0,
        112.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.37109,
        1.30859
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
      960,
      256,
      192
    ],
    "art": [
      9,
      62,
      237,
      130
    ],
    "native": [
      237,
      130
    ],
    "id": 43,
    "kind": "res",
    "variant": "snow",
    "resType": "gold",
    "level": 2,
    "transform": {
      "size": [
        237.0,
        130.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.39844,
        2.17188
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
      960,
      256,
      192
    ],
    "art": [
      0,
      58,
      256,
      134
    ],
    "native": [
      263,
      138
    ],
    "id": 44,
    "kind": "res",
    "variant": "snow",
    "resType": "gold",
    "level": 3,
    "transform": {
      "size": [
        263.0,
        138.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        5.24316,
        1.01465
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      1152,
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
      276,
      140
    ],
    "id": 45,
    "kind": "res",
    "variant": "snow",
    "resType": "gold",
    "level": 4,
    "transform": {
      "size": [
        276.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.316406,
        3.11328
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      1152,
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
    "id": 46,
    "kind": "res",
    "variant": "snow",
    "resType": "gold",
    "level": 5,
    "transform": {
      "size": [
        276.0,
        134.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.579102,
        3.16504
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  }
];
/** 沙漠件（id = 原版 res 值）。 */
export const MAPO_DECOR_DESERT_CELLS: readonly IMapoDecorCell[] = [
  {
    "cell": [
      512,
      1152,
      256,
      192
    ],
    "art": [
      103,
      143,
      49,
      49
    ],
    "native": [
      49,
      49
    ],
    "id": 2,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 1,
    "transform": {
      "size": [
        50.0,
        58.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        2.7998,
        -27.084
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      1152,
      256,
      192
    ],
    "art": [
      71,
      83,
      113,
      109
    ],
    "native": [
      113,
      109
    ],
    "id": 3,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 2,
    "transform": {
      "size": [
        113.0,
        109.0
      ],
      "scale": [
        1.0177,
        1.00917
      ],
      "offset": [
        -1.68457,
        9.75391
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
      1152,
      256,
      192
    ],
    "art": [
      12,
      72,
      232,
      120
    ],
    "native": [
      232,
      120
    ],
    "id": 4,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 3,
    "transform": {
      "size": [
        232.0,
        120.0
      ],
      "scale": [
        0.922414,
        0.915966
      ],
      "offset": [
        -7.29297,
        3.62402
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      1152,
      256,
      192
    ],
    "art": [
      14,
      69,
      227,
      123
    ],
    "native": [
      227,
      123
    ],
    "id": 5,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 4,
    "transform": {
      "size": [
        227.0,
        123.0
      ],
      "scale": [
        1.02745,
        1.05839
      ],
      "offset": [
        -2.375,
        2.04492
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      1152,
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
      260,
      150
    ],
    "id": 6,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 5,
    "transform": {
      "size": [
        260.0,
        150.0
      ],
      "scale": [
        0.965385,
        1.0
      ],
      "offset": [
        1.79785,
        1.97559
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      1152,
      256,
      192
    ],
    "art": [
      17,
      69,
      221,
      123
    ],
    "native": [
      221,
      123
    ],
    "id": 7,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 6,
    "transform": {
      "size": [
        221.0,
        123.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -6.29102,
        8.7207
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      1152,
      256,
      192
    ],
    "art": [
      0,
      71,
      256,
      121
    ],
    "native": [
      272,
      129
    ],
    "id": 8,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 7,
    "transform": {
      "size": [
        272.0,
        129.0
      ],
      "scale": [
        1.01103,
        1.08527
      ],
      "offset": [
        -13.5215,
        13.9795
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      1152,
      256,
      192
    ],
    "art": [
      0,
      43,
      256,
      149
    ],
    "native": [
      271,
      158
    ],
    "id": 9,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 8,
    "transform": {
      "size": [
        274.0,
        158.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -8.59766,
        -1.87891
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      1152,
      256,
      192
    ],
    "art": [
      0,
      40,
      256,
      152
    ],
    "native": [
      276,
      164
    ],
    "id": 10,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 9,
    "transform": {
      "size": [
        282.0,
        162.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -3.1875,
        0.285156
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      1152,
      256,
      192
    ],
    "art": [
      0,
      51,
      256,
      141
    ],
    "native": [
      319,
      176
    ],
    "id": 11,
    "kind": "res",
    "variant": "desert",
    "resType": "wood",
    "level": 10,
    "transform": {
      "size": [
        319.0,
        176.0
      ],
      "scale": [
        1.03135,
        0.988636
      ],
      "offset": [
        -17.601601,
        6.58887
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      1152,
      256,
      192
    ],
    "art": [
      16,
      92,
      224,
      100
    ],
    "native": [
      224,
      100
    ],
    "id": 12,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 1,
    "transform": {
      "size": [
        224.0,
        100.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        1.66406,
        4.45996
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      1152,
      256,
      192
    ],
    "art": [
      28,
      97,
      200,
      95
    ],
    "native": [
      200,
      95
    ],
    "id": 13,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 2,
    "transform": {
      "size": [
        200.0,
        95.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -8.00391,
        2.04297
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
      1152,
      256,
      192
    ],
    "art": [
      20,
      80,
      215,
      112
    ],
    "native": [
      215,
      112
    ],
    "id": 14,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 3,
    "transform": {
      "size": [
        215.0,
        112.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.88672,
        0.431641
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
      1152,
      256,
      192
    ],
    "art": [
      35,
      80,
      185,
      112
    ],
    "native": [
      185,
      112
    ],
    "id": 15,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 4,
    "transform": {
      "size": [
        185.0,
        112.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -23.311501,
        2.04297
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      1344,
      256,
      192
    ],
    "art": [
      18,
      93,
      220,
      99
    ],
    "native": [
      220,
      99
    ],
    "id": 16,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 5,
    "transform": {
      "size": [
        220.0,
        99.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        1.66406,
        11.7109
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      1344,
      256,
      192
    ],
    "art": [
      13,
      76,
      230,
      116
    ],
    "native": [
      230,
      116
    ],
    "id": 17,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 6,
    "transform": {
      "size": [
        230.0,
        116.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.052734,
        6.07129
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      1344,
      256,
      192
    ],
    "art": [
      3,
      71,
      250,
      121
    ],
    "native": [
      250,
      121
    ],
    "id": 18,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 7,
    "transform": {
      "size": [
        250.0,
        121.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        5.69238,
        7.68262
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      1344,
      256,
      192
    ],
    "art": [
      7,
      64,
      242,
      128
    ],
    "native": [
      242,
      128
    ],
    "id": 19,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 8,
    "transform": {
      "size": [
        242.0,
        128.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        1.66406,
        -2.79102
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
      1344,
      256,
      192
    ],
    "art": [
      4,
      57,
      247,
      135
    ],
    "native": [
      247,
      135
    ],
    "id": 20,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 9,
    "transform": {
      "size": [
        247.0,
        135.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -5.58691,
        9.29395
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      1344,
      256,
      192
    ],
    "art": [
      0,
      65,
      256,
      127
    ],
    "native": [
      283,
      140
    ],
    "id": 21,
    "kind": "res",
    "variant": "desert",
    "resType": "stone",
    "level": 10,
    "transform": {
      "size": [
        283.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -2.62988,
        10.7725
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      1344,
      256,
      192
    ],
    "art": [
      53,
      119,
      149,
      73
    ],
    "native": [
      149,
      73
    ],
    "id": 22,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 1,
    "transform": {
      "size": [
        149.0,
        73.0
      ],
      "scale": [
        0.525194,
        0.525194
      ],
      "offset": [
        -5.2002,
        16.029301
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      1344,
      256,
      192
    ],
    "art": [
      53,
      119,
      149,
      73
    ],
    "native": [
      149,
      73
    ],
    "id": 23,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 2,
    "transform": {
      "size": [
        149.0,
        73.0
      ],
      "scale": [
        1.34183,
        1.18085
      ],
      "offset": [
        -14.9844,
        -0.358398
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      1344,
      256,
      192
    ],
    "art": [
      30,
      103,
      195,
      89
    ],
    "native": [
      195,
      89
    ],
    "id": 24,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 3,
    "transform": {
      "size": [
        195.0,
        89.0
      ],
      "scale": [
        1.11784,
        1.11784
      ],
      "offset": [
        5.3291,
        9.26172
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      1344,
      256,
      192
    ],
    "art": [
      8,
      77,
      239,
      115
    ],
    "native": [
      239,
      115
    ],
    "id": 25,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 4,
    "transform": {
      "size": [
        239.0,
        115.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        8.6875,
        2.17188
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      1344,
      256,
      192
    ],
    "art": [
      14,
      62,
      228,
      130
    ],
    "native": [
      228,
      130
    ],
    "id": 26,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 5,
    "transform": {
      "size": [
        228.0,
        130.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        2.64453,
        0.445313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      1344,
      256,
      192
    ],
    "art": [
      3,
      60,
      249,
      132
    ],
    "native": [
      249,
      132
    ],
    "id": 27,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 6,
    "transform": {
      "size": [
        249.0,
        132.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        5.23438,
        0.445313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      1344,
      256,
      192
    ],
    "art": [
      0,
      54,
      256,
      138
    ],
    "native": [
      258,
      139
    ],
    "id": 28,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 7,
    "transform": {
      "size": [
        258.0,
        139.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        5.23438,
        3.03516
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      1344,
      256,
      192
    ],
    "art": [
      0,
      51,
      256,
      141
    ],
    "native": [
      285,
      157
    ],
    "id": 29,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 8,
    "transform": {
      "size": [
        277.0,
        145.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.6582,
        6.07031
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
      1344,
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
    "id": 30,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 9,
    "transform": {
      "size": [
        286.0,
        140.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -6.23633,
        7.21484
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3840,
      1344,
      256,
      192
    ],
    "art": [
      0,
      65,
      256,
      127
    ],
    "native": [
      312,
      155
    ],
    "id": 31,
    "kind": "res",
    "variant": "desert",
    "resType": "food",
    "level": 10,
    "transform": {
      "size": [
        312.0,
        155.0
      ],
      "scale": [
        0.940468,
        0.940468
      ],
      "offset": [
        -8.41992,
        -0.599609
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      0,
      1536,
      256,
      192
    ],
    "art": [
      12,
      92,
      232,
      100
    ],
    "native": [
      232,
      100
    ],
    "id": 32,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 1,
    "transform": {
      "size": [
        232.0,
        100.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -7.71484,
        11.668
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      256,
      1536,
      256,
      192
    ],
    "art": [
      15,
      84,
      226,
      108
    ],
    "native": [
      226,
      108
    ],
    "id": 33,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 2,
    "transform": {
      "size": [
        226.0,
        108.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -10.3047,
        0.445313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      512,
      1536,
      256,
      192
    ],
    "art": [
      19,
      81,
      217,
      111
    ],
    "native": [
      217,
      111
    ],
    "id": 34,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 3,
    "transform": {
      "size": [
        217.0,
        111.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -5.98828,
        4.76172
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      768,
      1536,
      256,
      192
    ],
    "art": [
      6,
      95,
      244,
      97
    ],
    "native": [
      244,
      97
    ],
    "id": 35,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 4,
    "transform": {
      "size": [
        244.0,
        97.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -9.44141,
        -1.28125
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1024,
      1536,
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
    "id": 36,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 5,
    "transform": {
      "size": [
        241.0,
        115.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        4.83594,
        -1.9707
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1280,
      1536,
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
    "id": 37,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 6,
    "transform": {
      "size": [
        241.0,
        115.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        2.43945,
        -1.9707
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1536,
      1536,
      256,
      192
    ],
    "art": [
      12,
      63,
      232,
      129
    ],
    "native": [
      232,
      129
    ],
    "id": 38,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 7,
    "transform": {
      "size": [
        232.0,
        129.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -0.755859,
        5.21875
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      1792,
      1536,
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
      277,
      134
    ],
    "id": 39,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 8,
    "transform": {
      "size": [
        277.0,
        134.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        12.0254,
        6.01758
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2048,
      1536,
      256,
      192
    ],
    "art": [
      7,
      62,
      242,
      130
    ],
    "native": [
      242,
      130
    ],
    "id": 40,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 9,
    "transform": {
      "size": [
        242.0,
        130.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -5.54883,
        9.21289
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2304,
      1536,
      256,
      192
    ],
    "art": [
      0,
      59,
      256,
      133
    ],
    "native": [
      279,
      145
    ],
    "id": 41,
    "kind": "res",
    "variant": "desert",
    "resType": "iron",
    "level": 10,
    "transform": {
      "size": [
        279.0,
        145.0
      ],
      "scale": [
        1.0,
        0.993103
      ],
      "offset": [
        -5.25195,
        2.67578
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2560,
      1536,
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
    "id": 42,
    "kind": "res",
    "variant": "desert",
    "resType": "gold",
    "level": 1,
    "transform": {
      "size": [
        200.0,
        110.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        0.233398,
        2.4873
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      2816,
      1536,
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
    "id": 43,
    "kind": "res",
    "variant": "desert",
    "resType": "gold",
    "level": 2,
    "transform": {
      "size": [
        229.0,
        121.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -5.5127,
        7.58496
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3072,
      1536,
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
    "id": 44,
    "kind": "res",
    "variant": "desert",
    "resType": "gold",
    "level": 3,
    "transform": {
      "size": [
        262.0,
        135.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        3.2207,
        2.82129
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3328,
      1536,
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
    "id": 45,
    "kind": "res",
    "variant": "desert",
    "resType": "gold",
    "level": 4,
    "transform": {
      "size": [
        278.0,
        139.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        -1.54297,
        3.61523
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  },
  {
    "cell": [
      3584,
      1536,
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
    "id": 46,
    "kind": "res",
    "variant": "desert",
    "resType": "gold",
    "level": 5,
    "transform": {
      "size": [
        276.0,
        134.0
      ],
      "scale": [
        1.0,
        1.0
      ],
      "offset": [
        1.63281,
        5.20313
      ],
      "pivot": [
        0.5,
        0.5
      ],
      "angle": 0.0
    }
  }
];
