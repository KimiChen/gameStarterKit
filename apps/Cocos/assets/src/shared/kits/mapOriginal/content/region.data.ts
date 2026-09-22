/**
 * mapOriginal **区域件**图集布局（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 多格地形（山脉 / 林丛 / 散落）的件。摆放表在 `regions.bin`（Cocos BufferAsset），
 *   ⛔ 不进 shared：2.8 万条、217 KB。这里只有**图集布局**。
 * ⚠ 锚点是**底边中点**，⛔ 不是几何中心。
 * ⚠ 族内按面积**升序**排，`build_regions.py` 按区的等距跨度挑件（大区用大件）。
 * ★ `native` 是原图像素：原版 2D 一格 300×150 px ⇒ 世界宽 = native[0] × (MAPO_TILE_HALF_W / 150)。
 *   实测山体件占 0.94~2.25 格、树簇 0.12~0.45 格 —— 这就是原版的比例。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别再拉伸。
 */

export interface IMapoRegionCell {
    readonly id: number;
    readonly kind: string;
    readonly cell: readonly [number, number, number, number];
    readonly art: readonly [number, number, number, number];
    /** ★ **原图像素尺寸**。件在世界里多大由它定，⛔ 不是按连通区拉伸。 */
    readonly native: readonly [number, number];
}

export const MAPO_REGION_ATLAS_W = 2048;
export const MAPO_REGION_ATLAS_H = 2048;
export const MAPO_REGION_CELL_W = 512;
export const MAPO_REGION_CELL_H = 320;
export const MAPO_REGION_CELLS: readonly IMapoRegionCell[] = [
  {
    "id": 0,
    "kind": "mountain",
    "cell": [
      0,
      0,
      512,
      320
    ],
    "art": [
      115,
      172,
      281,
      148
    ],
    "native": [
      281,
      148
    ]
  },
  {
    "id": 1,
    "kind": "mountain",
    "cell": [
      512,
      0,
      512,
      320
    ],
    "art": [
      112,
      172,
      287,
      148
    ],
    "native": [
      287,
      148
    ]
  },
  {
    "id": 2,
    "kind": "mountain",
    "cell": [
      1024,
      0,
      512,
      320
    ],
    "art": [
      105,
      82,
      302,
      238
    ],
    "native": [
      302,
      238
    ]
  },
  {
    "id": 3,
    "kind": "mountain",
    "cell": [
      1536,
      0,
      512,
      320
    ],
    "art": [
      1,
      142,
      510,
      178
    ],
    "native": [
      510,
      178
    ]
  },
  {
    "id": 4,
    "kind": "mountain",
    "cell": [
      0,
      320,
      512,
      320
    ],
    "art": [
      46,
      86,
      420,
      234
    ],
    "native": [
      420,
      234
    ]
  },
  {
    "id": 5,
    "kind": "mountain",
    "cell": [
      512,
      320,
      512,
      320
    ],
    "art": [
      0,
      32,
      512,
      288
    ],
    "native": [
      516,
      290
    ]
  },
  {
    "id": 6,
    "kind": "mountain",
    "cell": [
      1024,
      320,
      512,
      320
    ],
    "art": [
      0,
      63,
      512,
      257
    ],
    "native": [
      563,
      283
    ]
  },
  {
    "id": 7,
    "kind": "mountain",
    "cell": [
      1536,
      320,
      512,
      320
    ],
    "art": [
      0,
      53,
      512,
      267
    ],
    "native": [
      655,
      341
    ]
  },
  {
    "id": 8,
    "kind": "mountain",
    "cell": [
      0,
      640,
      512,
      320
    ],
    "art": [
      0,
      47,
      512,
      273
    ],
    "native": [
      657,
      350
    ]
  },
  {
    "id": 9,
    "kind": "mountain",
    "cell": [
      512,
      640,
      512,
      320
    ],
    "art": [
      0,
      58,
      512,
      262
    ],
    "native": [
      674,
      345
    ]
  },
  {
    "id": 10,
    "kind": "grove",
    "cell": [
      1024,
      640,
      512,
      320
    ],
    "art": [
      213,
      272,
      85,
      48
    ],
    "native": [
      85,
      48
    ]
  },
  {
    "id": 11,
    "kind": "grove",
    "cell": [
      1536,
      640,
      512,
      320
    ],
    "art": [
      213,
      272,
      86,
      48
    ],
    "native": [
      86,
      48
    ]
  },
  {
    "id": 12,
    "kind": "grove",
    "cell": [
      0,
      960,
      512,
      320
    ],
    "art": [
      213,
      272,
      86,
      48
    ],
    "native": [
      86,
      48
    ]
  },
  {
    "id": 13,
    "kind": "grove",
    "cell": [
      512,
      960,
      512,
      320
    ],
    "art": [
      213,
      272,
      86,
      48
    ],
    "native": [
      86,
      48
    ]
  },
  {
    "id": 14,
    "kind": "grove",
    "cell": [
      1024,
      960,
      512,
      320
    ],
    "art": [
      213,
      272,
      86,
      48
    ],
    "native": [
      86,
      48
    ]
  },
  {
    "id": 15,
    "kind": "grove",
    "cell": [
      1536,
      960,
      512,
      320
    ],
    "art": [
      213,
      272,
      86,
      48
    ],
    "native": [
      86,
      48
    ]
  },
  {
    "id": 16,
    "kind": "grove",
    "cell": [
      0,
      1280,
      512,
      320
    ],
    "art": [
      213,
      272,
      86,
      48
    ],
    "native": [
      86,
      48
    ]
  },
  {
    "id": 17,
    "kind": "grove",
    "cell": [
      512,
      1280,
      512,
      320
    ],
    "art": [
      213,
      271,
      85,
      49
    ],
    "native": [
      85,
      49
    ]
  },
  {
    "id": 18,
    "kind": "scatter",
    "cell": [
      1024,
      1280,
      512,
      320
    ],
    "art": [
      76,
      149,
      360,
      171
    ],
    "native": [
      360,
      171
    ]
  },
  {
    "id": 19,
    "kind": "scatter",
    "cell": [
      1536,
      1280,
      512,
      320
    ],
    "art": [
      18,
      93,
      475,
      227
    ],
    "native": [
      475,
      227
    ]
  },
  {
    "id": 20,
    "kind": "scatter",
    "cell": [
      0,
      1600,
      512,
      320
    ],
    "art": [
      36,
      42,
      439,
      278
    ],
    "native": [
      439,
      278
    ]
  },
  {
    "id": 21,
    "kind": "scatter",
    "cell": [
      512,
      1600,
      512,
      320
    ],
    "art": [
      0,
      116,
      512,
      204
    ],
    "native": [
      571,
      228
    ]
  },
  {
    "id": 22,
    "kind": "scatter",
    "cell": [
      1024,
      1600,
      512,
      320
    ],
    "art": [
      0,
      132,
      512,
      188
    ],
    "native": [
      609,
      224
    ]
  },
  {
    "id": 23,
    "kind": "scatter",
    "cell": [
      1536,
      1600,
      512,
      320
    ],
    "art": [
      7,
      17,
      497,
      303
    ],
    "native": [
      497,
      303
    ]
  }
];
