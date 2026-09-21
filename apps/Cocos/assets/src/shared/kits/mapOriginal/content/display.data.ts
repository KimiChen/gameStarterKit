/**
 * mapOriginal **显示层**（16 类）调色板 —— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_display_palette.py` 从 `terrain.info.json` 派生。
 * ⚠ 这里只有调色板：显示层的格数据走 Cocos BufferAsset（熵太高，塞不进 shared），
 *   见 `apps/kits/mapOriginal/README.md` §3。
 * ⛔ 别拿 4 类通行层的 `MAPO_TERRAIN_PALETTE` 去查 16 类 id。
 */
import type { IMapoTerrainClass } from "../api/hexmap/index";

export const MAPO_DISPLAY_PALETTE: readonly IMapoTerrainClass[] = [
  {
    "id": 0,
    "name": "plain",
    "cn": "平地",
    "color": [
      137,
      148,
      100
    ],
    "passable": true
  },
  {
    "id": 1,
    "name": "wood",
    "cn": "木材",
    "color": [
      104,
      132,
      78
    ],
    "passable": true
  },
  {
    "id": 2,
    "name": "stone",
    "cn": "石料",
    "color": [
      150,
      148,
      112
    ],
    "passable": true
  },
  {
    "id": 3,
    "name": "food",
    "cn": "粮田",
    "color": [
      166,
      168,
      96
    ],
    "passable": true
  },
  {
    "id": 4,
    "name": "iron",
    "cn": "铁矿",
    "color": [
      128,
      124,
      116
    ],
    "passable": true
  },
  {
    "id": 5,
    "name": "gold",
    "cn": "金矿",
    "color": [
      176,
      160,
      100
    ],
    "passable": true
  },
  {
    "id": 6,
    "name": "water",
    "cn": "水域",
    "color": [
      96,
      128,
      138
    ],
    "passable": false
  },
  {
    "id": 7,
    "name": "forest",
    "cn": "森林",
    "color": [
      86,
      112,
      74
    ],
    "passable": true
  },
  {
    "id": 8,
    "name": "wetland",
    "cn": "湿地",
    "color": [
      112,
      132,
      104
    ],
    "passable": true
  },
  {
    "id": 9,
    "name": "desert",
    "cn": "荒漠",
    "color": [
      176,
      166,
      124
    ],
    "passable": true
  },
  {
    "id": 10,
    "name": "hill",
    "cn": "丘陵",
    "color": [
      150,
      148,
      112
    ],
    "passable": true
  },
  {
    "id": 11,
    "name": "river",
    "cn": "河流",
    "color": [
      70,
      120,
      160
    ],
    "passable": false
  },
  {
    "id": 12,
    "name": "mountain",
    "cn": "山地",
    "color": [
      123,
      130,
      126
    ],
    "passable": false
  },
  {
    "id": 13,
    "name": "grove",
    "cn": "林丛",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 14,
    "name": "scatter",
    "cn": "散落地物",
    "color": [
      130,
      145,
      98
    ],
    "passable": true
  },
  {
    "id": 15,
    "name": "special",
    "cn": "特殊地块",
    "color": [
      170,
      140,
      110
    ],
    "passable": true
  }
];

/** id → 类，⛔ 不要每格去 find。 */
export const MAPO_DISPLAY_BY_ID: ReadonlyMap<number, IMapoTerrainClass> =
    new Map(MAPO_DISPLAY_PALETTE.map((e) => [e.id, e]));
