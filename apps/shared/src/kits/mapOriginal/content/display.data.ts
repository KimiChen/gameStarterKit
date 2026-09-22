/**
 * mapOriginal **原版值空间**调色板 —— **生成物，⛔ 勿手改**。
 *
 * 由 `tools/maporiginal-assets/emit_display_palette.py` 从 `terrain.info.json` +
 * 派生。显示层每格存的就是**原版 res 值**（1 平地；2..41 资源(类型=(v-2)//10、等级=(v-2)%10+1)；42..46 金矿 1..5 级；47 河流；48..61 山族 14 形的锚点（⛔ 无 56）；0 被多格地形覆盖）。
 *
 * ★ 一格长什么样完全由这个值查出来，⛔ 不掺随机/哈希：
 *   ① `MAPO_VALUE_KIND_ID[v]` → 粗类 id → 地表图集第几行（8 粗类 × 4 变体）；
 *   ② 值本身就是摆件图集格 id → 该格放哪张原版 res_field 图（见 `decor.data.ts`）；
 *   ③ `MAPO_VALUE_BY_ID.get(v)` → 中文名 / 颜色 / 通行。
 * ⚠ 资源类型编号→中文是**假设**（类型0→木、1→铁、2→石、3→粮（⚠ 假设，静态数据定不了，可能是置换））。
 * ⛔ 别拿 3 类通行层的 `MAPO_TERRAIN_PALETTE` 来查这里的 id。
 */

export interface IMapoValueClass {
    /** 原版 res 值（res==0 的格由 res_multi 顶替，见 build_terrain.py）。 */
    readonly id: number;
    /** 粗类名，与地表图集的行一一对应。 */
    readonly kind: string;
    /** 粗类 id = 图集行号。 */
    readonly kindId: number;
    readonly cn: string;
    readonly color: readonly [number, number, number];
    readonly passable: boolean;
    /** 资源类型编号（0..3），仅资源格有。 */
    readonly resType?: number;
    /** 资源等级（1..10），仅资源格有。 */
    readonly level?: number;
}

/**
 * 粗类表：**次序即粗类 id**。⚠ M2-B1 起它**只用于详情面板与远档着色**，
 * ⛔ 不再对应任何图集行 —— 地表底已改成「一张底纹整数次 GL_REPEAT」。
 */
export const MAPO_VALUE_KINDS: readonly string[] = ["plain", "resource", "gold", "river", "scatter", "grove", "mountain", "unknown"];
/** 资源类型编号 → 中文。⚠ 静态数据定不了真实置换，见模块头。 */
export const MAPO_RES_TYPE_CN: readonly string[] = ["木", "铁", "石", "粮"];
/** 原版值上界（含）。 */
export const MAPO_VALUE_MAX = 61;

export const MAPO_VALUE_PALETTE: readonly IMapoValueClass[] = [
  {
    "id": 0,
    "kind": "plain",
    "kindId": 0,
    "cn": "多格地形覆盖",
    "color": [
      137,
      148,
      100
    ],
    "passable": true
  },
  {
    "id": 1,
    "kind": "plain",
    "kindId": 0,
    "cn": "平地",
    "color": [
      137,
      148,
      100
    ],
    "passable": true
  },
  {
    "id": 2,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·1级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 1
  },
  {
    "id": 3,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·2级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 2
  },
  {
    "id": 4,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·3级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 3
  },
  {
    "id": 5,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·4级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 4
  },
  {
    "id": 6,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·5级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 5
  },
  {
    "id": 7,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·6级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 6
  },
  {
    "id": 8,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·7级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 7
  },
  {
    "id": 9,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·8级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 8
  },
  {
    "id": 10,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·9级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 9
  },
  {
    "id": 11,
    "kind": "resource",
    "kindId": 1,
    "cn": "木·10级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 0,
    "level": 10
  },
  {
    "id": 12,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·1级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 1
  },
  {
    "id": 13,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·2级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 2
  },
  {
    "id": 14,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·3级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 3
  },
  {
    "id": 15,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·4级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 4
  },
  {
    "id": 16,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·5级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 5
  },
  {
    "id": 17,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·6级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 6
  },
  {
    "id": 18,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·7级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 7
  },
  {
    "id": 19,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·8级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 8
  },
  {
    "id": 20,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·9级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 9
  },
  {
    "id": 21,
    "kind": "resource",
    "kindId": 1,
    "cn": "铁·10级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 1,
    "level": 10
  },
  {
    "id": 22,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·1级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 1
  },
  {
    "id": 23,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·2级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 2
  },
  {
    "id": 24,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·3级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 3
  },
  {
    "id": 25,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·4级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 4
  },
  {
    "id": 26,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·5级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 5
  },
  {
    "id": 27,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·6级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 6
  },
  {
    "id": 28,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·7级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 7
  },
  {
    "id": 29,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·8级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 8
  },
  {
    "id": 30,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·9级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 9
  },
  {
    "id": 31,
    "kind": "resource",
    "kindId": 1,
    "cn": "石·10级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 2,
    "level": 10
  },
  {
    "id": 32,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·1级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 1
  },
  {
    "id": 33,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·2级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 2
  },
  {
    "id": 34,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·3级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 3
  },
  {
    "id": 35,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·4级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 4
  },
  {
    "id": 36,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·5级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 5
  },
  {
    "id": 37,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·6级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 6
  },
  {
    "id": 38,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·7级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 7
  },
  {
    "id": 39,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·8级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 8
  },
  {
    "id": 40,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·9级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 9
  },
  {
    "id": 41,
    "kind": "resource",
    "kindId": 1,
    "cn": "粮·10级",
    "color": [
      150,
      152,
      98
    ],
    "passable": true,
    "resType": 3,
    "level": 10
  },
  {
    "id": 42,
    "kind": "gold",
    "kindId": 2,
    "cn": "金矿·1级",
    "color": [
      176,
      160,
      100
    ],
    "passable": true,
    "resType": 4,
    "level": 1
  },
  {
    "id": 43,
    "kind": "gold",
    "kindId": 2,
    "cn": "金矿·2级",
    "color": [
      176,
      160,
      100
    ],
    "passable": true,
    "resType": 4,
    "level": 2
  },
  {
    "id": 44,
    "kind": "gold",
    "kindId": 2,
    "cn": "金矿·3级",
    "color": [
      176,
      160,
      100
    ],
    "passable": true,
    "resType": 4,
    "level": 3
  },
  {
    "id": 45,
    "kind": "gold",
    "kindId": 2,
    "cn": "金矿·4级",
    "color": [
      176,
      160,
      100
    ],
    "passable": true,
    "resType": 4,
    "level": 4
  },
  {
    "id": 46,
    "kind": "gold",
    "kindId": 2,
    "cn": "金矿·5级",
    "color": [
      176,
      160,
      100
    ],
    "passable": true,
    "resType": 4,
    "level": 5
  },
  {
    "id": 47,
    "kind": "river",
    "kindId": 3,
    "cn": "河流",
    "color": [
      70,
      120,
      160
    ],
    "passable": false
  },
  {
    "id": 48,
    "kind": "scatter",
    "kindId": 4,
    "cn": "散落地物·48",
    "color": [
      130,
      145,
      98
    ],
    "passable": true
  },
  {
    "id": 49,
    "kind": "scatter",
    "kindId": 4,
    "cn": "散落地物·49",
    "color": [
      130,
      145,
      98
    ],
    "passable": true
  },
  {
    "id": 50,
    "kind": "scatter",
    "kindId": 4,
    "cn": "散落地物·50",
    "color": [
      130,
      145,
      98
    ],
    "passable": true
  },
  {
    "id": 51,
    "kind": "scatter",
    "kindId": 4,
    "cn": "散落地物·51",
    "color": [
      130,
      145,
      98
    ],
    "passable": true
  },
  {
    "id": 52,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·52",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 53,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·53",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 54,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·54",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 55,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·55",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 57,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·57",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 58,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·58",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 59,
    "kind": "grove",
    "kindId": 5,
    "cn": "林丛·59",
    "color": [
      95,
      118,
      80
    ],
    "passable": true
  },
  {
    "id": 60,
    "kind": "mountain",
    "kindId": 6,
    "cn": "山地·60",
    "color": [
      123,
      130,
      126
    ],
    "passable": false
  },
  {
    "id": 61,
    "kind": "mountain",
    "kindId": 6,
    "cn": "山地·61",
    "color": [
      123,
      130,
      126
    ],
    "passable": false
  }
];

/** 值 → 类，⛔ 不要每格去 find。 */
export const MAPO_VALUE_BY_ID: ReadonlyMap<number, IMapoValueClass> =
    new Map(MAPO_VALUE_PALETTE.map((e) => [e.id, e]));

/** 下标 = 原版值 → 粗类 id。**逐格热路径查这张表**，⛔ 不要查 Map。 */
export const MAPO_VALUE_KIND_ID: readonly number[] = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 4, 4, 4, 4, 5, 5, 5, 5, 7, 5, 5, 5, 6, 6];

/** 下标 = 原版值 → RGB。远档着色与顶点色走它，⛔ 不要查 Map。 */
export const MAPO_VALUE_COLORS: readonly (readonly [number, number, number])[] = [[137, 148, 100], [137, 148, 100], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [150, 152, 98], [176, 160, 100], [176, 160, 100], [176, 160, 100], [176, 160, 100], [176, 160, 100], [70, 120, 160], [130, 145, 98], [130, 145, 98], [130, 145, 98], [130, 145, 98], [95, 118, 80], [95, 118, 80], [95, 118, 80], [95, 118, 80], [120, 120, 120], [95, 118, 80], [95, 118, 80], [95, 118, 80], [123, 130, 126], [123, 130, 126]];
