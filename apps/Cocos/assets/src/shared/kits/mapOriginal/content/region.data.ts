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
 * ★ 锚点来自 prefab position/pivot；与图集格位、图片底边无关。
 * ★ **件的大小 = `size` × `scale`**（M0-B2，§3.3）：`size` 是 prefab 画布、`scale` 是 prefab 里
 *   那个 sprite 的缩放。m2 只有 563 px 却要盖满 19 格，靠的就是 `mountain19m_01` 的 2.163；
 *   三对共用贴图的形**全靠 transform 区分** ⇒ ⛔ 只用 native 会把 14 形压成 10 形。
 * ★ `offset` 是精灵**中心**相对锚点格的偏移（原版 px，+y 向上）；`pivot` 恒 [0.5, 0.5]。
 *   世界坐标：中心 = 锚点格位置 + toWorld(offset)，底边中点 = 中心 − (0, h/2)。
 * ⚠ 早先按连通区跨度把件**拉大到整片区**，真机一看是糊成一团的大绿斑，⛔ 别按足迹拉伸 ——
 *   `scale` 是原版给的定值，⛔ 不是我们按格数算的。
 */

import type { MapoTextureLayouts } from "./atlas-layout.types";

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
    /** Stable image identity; multiple logical forms can share pixels. */
    readonly textureId: string;
    /** ★ prefab 里 sprite 的缩放 [x, y]。件的世界尺寸 = size × scale × (halfW / 150)。 */
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
export const MAPO_REGION_ATLAS_H = 2048;
export const MAPO_REGION_STORAGE_LIMIT: readonly [number, number] = [682, 409];
export const MAPO_REGION_TEXTURES: MapoTextureLayouts = {"region:062eb182be7c08028029": {"textureId": "region:062eb182be7c08028029", "atlasId": "region", "rect": [2, 1270, 287, 148], "nativeSize": [287, 148], "storageSize": [287, 148], "trimRect": [0, 0, 287, 148], "layoutVersion": 1, "contentHash": "c7ec822e757c34431d825c2ebd33170aed11ae1ed4a7073ca0fd2ebc3a117eeb"}, "region:06f42c11f9276985fdb1": {"textureId": "region:06f42c11f9276985fdb1", "atlasId": "region", "rect": [688, 681, 626, 328], "nativeSize": [626, 328], "storageSize": [626, 328], "trimRect": [0, 0, 626, 328], "layoutVersion": 1, "contentHash": "1415f408ac13f4dc891f3ec6dce44e06757d63660248233adb9b2e87a79f7944"}, "region:1a7acf8659f949997299": {"textureId": "region:1a7acf8659f949997299", "atlasId": "region", "rect": [2, 730, 593, 298], "nativeSize": [593, 298], "storageSize": [593, 298], "trimRect": [0, 0, 593, 298], "layoutVersion": 1, "contentHash": "7ced47b14f44dcfc3b3529aaea4150e08555db3dc86e3c5b94329477067ad359"}, "region:1bead044d5e9de7750ae": {"textureId": "region:1bead044d5e9de7750ae", "atlasId": "region", "rect": [2, 1032, 422, 234], "nativeSize": [422, 234], "storageSize": [422, 234], "trimRect": [0, 0, 422, 234], "layoutVersion": 1, "contentHash": "0e6c8802f42b48b9651634e3dc327792e2f393d272b5036f9fc29719d1b0a08a"}, "region:46c6d1ed25737a4f944f": {"textureId": "region:46c6d1ed25737a4f944f", "atlasId": "region", "rect": [2, 1844, 265, 155], "nativeSize": [265, 155], "storageSize": [265, 155], "trimRect": [0, 0, 265, 155], "layoutVersion": 1, "contentHash": "1f155a62b044a39f7338835917c8bbfb039f39e06da7af59c1a7b6f86bc1afa9"}, "region:528c6b6ad9067b370030": {"textureId": "region:528c6b6ad9067b370030", "atlasId": "region", "rect": [599, 1013, 520, 199], "nativeSize": [520, 199], "storageSize": [520, 199], "trimRect": [0, 0, 520, 199], "layoutVersion": 1, "contentHash": "57e6c994646b0a11469b77fff235a513c479e57f90e187067d44b78c669ef2fc"}, "region:62165345de620aa91c63": {"textureId": "region:62165345de620aa91c63", "atlasId": "region", "rect": [688, 344, 682, 333], "nativeSize": [769, 375], "storageSize": [682, 333], "trimRect": [0, 0, 682, 333], "layoutVersion": 1, "contentHash": "b82a268311189599ebb1a7fb929260a0394e7ce5e5695614b72c1dafdc0958b2"}, "region:69b0e9d21647a8f820a6": {"textureId": "region:69b0e9d21647a8f820a6", "atlasId": "region", "rect": [2, 2, 682, 397], "nativeSize": [733, 427], "storageSize": [682, 397], "trimRect": [0, 0, 682, 397], "layoutVersion": 1, "contentHash": "155fcbdbe0b0ab7dd8a1c783aea7da0480374d074b2982255ff2769c049fed45"}, "region:7556193ebb761d3736c9": {"textureId": "region:7556193ebb761d3736c9", "atlasId": "region", "rect": [2, 1692, 281, 148], "nativeSize": [281, 148], "storageSize": [281, 148], "trimRect": [0, 0, 281, 148], "layoutVersion": 1, "contentHash": "24236d5721b1835ba7dd7da4728cb9bf6704d519e57bef1d63d4cd60a4a90c98"}, "region:8c5b6021d07181a3462e": {"textureId": "region:8c5b6021d07181a3462e", "atlasId": "region", "rect": [1374, 356, 656, 342], "nativeSize": [656, 342], "storageSize": [656, 342], "trimRect": [0, 0, 656, 342], "layoutVersion": 1, "contentHash": "2a1dc34fff014bceef176010fbec6b47481bc949a07aeb5cc1602a17fb565c34"}, "region:c7a9c2a1d77da868b313": {"textureId": "region:c7a9c2a1d77da868b313", "atlasId": "region", "rect": [428, 1216, 423, 230], "nativeSize": [423, 230], "storageSize": [423, 230], "trimRect": [0, 0, 423, 230], "layoutVersion": 1, "contentHash": "6a8f5a6ebb3956f4a5ac12fcd1c97aadfd88a683a98d854dd0e3fce99c1071aa"}, "region:c89f56643ae5dd5c10fc": {"textureId": "region:c89f56643ae5dd5c10fc", "atlasId": "region", "rect": [1318, 702, 563, 283], "nativeSize": [563, 283], "storageSize": [563, 283], "trimRect": [0, 0, 563, 283], "layoutVersion": 1, "contentHash": "4777478410f21fabd19bcc9296cf886900770f5b42b2d49954b7787031ba94fe"}, "region:cbd0d1978f01835c5c49": {"textureId": "region:cbd0d1978f01835c5c49", "atlasId": "region", "rect": [2, 403, 682, 323], "nativeSize": [893, 423], "storageSize": [682, 323], "trimRect": [0, 0, 682, 323], "layoutVersion": 1, "contentHash": "137859db280e0caa89e3d1d658c54863e4d15fd1986f66f8c6f6bbde1fb8bc46"}, "region:d0f2ddd81fd1818a6490": {"textureId": "region:d0f2ddd81fd1818a6490", "atlasId": "region", "rect": [1318, 989, 516, 292], "nativeSize": [516, 292], "storageSize": [516, 292], "trimRect": [0, 0, 516, 292], "layoutVersion": 1, "contentHash": "38206cbc1a96be793e858507580c6482bd0499597499469f2695752d742a6021"}, "region:d4b051bf23db28d0b210": {"textureId": "region:d4b051bf23db28d0b210", "atlasId": "region", "rect": [855, 1216, 307, 257], "nativeSize": [307, 257], "storageSize": [307, 257], "trimRect": [0, 0, 307, 257], "layoutVersion": 1, "contentHash": "caa27478f8b24e5b83ed04e6a0f451ecc9fe1213dbaf77ac8531c30f3df605f5"}, "region:d52767b53da59668bac7": {"textureId": "region:d52767b53da59668bac7", "atlasId": "region", "rect": [1374, 2, 657, 350], "nativeSize": [657, 350], "storageSize": [657, 350], "trimRect": [0, 0, 657, 350], "layoutVersion": 1, "contentHash": "f8d8f347efa6e5e64263291e3da77b952ca0990681929fdf8121c2e6f51b592b"}, "region:e0f1fa07a63d8c4203fa": {"textureId": "region:e0f1fa07a63d8c4203fa", "atlasId": "region", "rect": [2, 1450, 510, 178], "nativeSize": [510, 178], "storageSize": [510, 178], "trimRect": [0, 0, 510, 178], "layoutVersion": 1, "contentHash": "2e036b8e28fffd85fb15547ce79fed8f6e63c51950c3d71748651596309960e3"}, "region:e929c9660a66831f5075": {"textureId": "region:e929c9660a66831f5075", "atlasId": "region", "rect": [688, 2, 682, 338], "nativeSize": [697, 345], "storageSize": [682, 338], "trimRect": [0, 0, 682, 338], "layoutVersion": 1, "contentHash": "d8814d4f4582a2c97635f6b9234759b92e43e433485f87a658c2d5c202fa2358"}, "region:febc8b48323949cff6ba": {"textureId": "region:febc8b48323949cff6ba", "atlasId": "region", "rect": [516, 1450, 303, 238], "nativeSize": [303, 238], "storageSize": [303, 238], "trimRect": [0, 0, 303, 238], "layoutVersion": 1, "contentHash": "98333f79c9357a6369d262f36d16080a0b0818dd811226175fcfbe27acde19d3"}};
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
    ],
    "textureId": "region:7556193ebb761d3736c9"
  },
  {
    "id": 49,
    "kind": "mountain",
    "variant": "base",
    "shan": 2,
    "form": "mountain1m_02",
    "shape": "1m",
    "footprintCells": 1,
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
    ],
    "textureId": "region:062eb182be7c08028029"
  },
  {
    "id": 50,
    "kind": "mountain",
    "variant": "base",
    "shan": 3,
    "form": "mountain1m_03",
    "shape": "1m",
    "footprintCells": 1,
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
    ],
    "textureId": "region:062eb182be7c08028029"
  },
  {
    "id": 51,
    "kind": "mountain",
    "variant": "base",
    "shan": 4,
    "form": "mountain1m_04",
    "shape": "1m",
    "footprintCells": 1,
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
    ],
    "textureId": "region:7556193ebb761d3736c9"
  },
  {
    "id": 52,
    "kind": "mountain",
    "variant": "base",
    "shan": 5,
    "form": "mountain2m_x_01",
    "shape": "2m_x",
    "footprintCells": 2,
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
    ],
    "textureId": "region:1bead044d5e9de7750ae"
  },
  {
    "id": 53,
    "kind": "mountain",
    "variant": "base",
    "shan": 6,
    "form": "mountain2m_xy_01",
    "shape": "2m_xy",
    "footprintCells": 2,
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
    ],
    "textureId": "region:febc8b48323949cff6ba"
  },
  {
    "id": 54,
    "kind": "mountain",
    "variant": "base",
    "shan": 7,
    "form": "mountain2m_y_01",
    "shape": "2m_y",
    "footprintCells": 2,
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
    ],
    "textureId": "region:e0f1fa07a63d8c4203fa"
  },
  {
    "id": 55,
    "kind": "mountain",
    "variant": "base",
    "shan": 8,
    "form": "mountain4m_01",
    "shape": "4m",
    "footprintCells": 4,
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
    ],
    "textureId": "region:d0f2ddd81fd1818a6490"
  },
  {
    "id": 57,
    "kind": "mountain",
    "variant": "base",
    "shan": 10,
    "form": "mountain7m_01",
    "shape": "7m",
    "footprintCells": 7,
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
    ],
    "textureId": "region:8c5b6021d07181a3462e"
  },
  {
    "id": 58,
    "kind": "mountain",
    "variant": "base",
    "shan": 11,
    "form": "mountain7m_02",
    "shape": "7m",
    "footprintCells": 7,
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
    ],
    "textureId": "region:d52767b53da59668bac7"
  },
  {
    "id": 59,
    "kind": "mountain",
    "variant": "base",
    "shan": 12,
    "form": "mountain7m_03",
    "shape": "7m",
    "footprintCells": 7,
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
    ],
    "textureId": "region:e929c9660a66831f5075"
  },
  {
    "id": 60,
    "kind": "mountain",
    "variant": "base",
    "shan": 13,
    "form": "mountain19m_01",
    "shape": "19m",
    "footprintCells": 19,
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
    ],
    "textureId": "region:c89f56643ae5dd5c10fc"
  },
  {
    "id": 61,
    "kind": "mountain",
    "variant": "base",
    "shan": 14,
    "form": "mountain19m_02",
    "shape": "19m",
    "footprintCells": 19,
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
    ],
    "textureId": "region:c89f56643ae5dd5c10fc"
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
    ],
    "textureId": "region:46c6d1ed25737a4f944f"
  },
  {
    "id": 49,
    "kind": "mountain",
    "variant": "snow",
    "shan": 2,
    "form": "mountain1m_02",
    "shape": "1m",
    "footprintCells": 1,
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
    ],
    "textureId": "region:46c6d1ed25737a4f944f"
  },
  {
    "id": 50,
    "kind": "mountain",
    "variant": "snow",
    "shan": 3,
    "form": "mountain1m_03",
    "shape": "1m",
    "footprintCells": 1,
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
    ],
    "textureId": "region:46c6d1ed25737a4f944f"
  },
  {
    "id": 51,
    "kind": "mountain",
    "variant": "snow",
    "shan": 4,
    "form": "mountain1m_04",
    "shape": "1m",
    "footprintCells": 1,
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
    ],
    "textureId": "region:46c6d1ed25737a4f944f"
  },
  {
    "id": 52,
    "kind": "mountain",
    "variant": "snow",
    "shan": 5,
    "form": "mountain2m_x_01",
    "shape": "2m_x",
    "footprintCells": 2,
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
    ],
    "textureId": "region:c7a9c2a1d77da868b313"
  },
  {
    "id": 53,
    "kind": "mountain",
    "variant": "snow",
    "shan": 6,
    "form": "mountain2m_xy_01",
    "shape": "2m_xy",
    "footprintCells": 2,
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
    ],
    "textureId": "region:d4b051bf23db28d0b210"
  },
  {
    "id": 54,
    "kind": "mountain",
    "variant": "snow",
    "shan": 7,
    "form": "mountain2m_y_01",
    "shape": "2m_y",
    "footprintCells": 2,
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
    ],
    "textureId": "region:528c6b6ad9067b370030"
  },
  {
    "id": 55,
    "kind": "mountain",
    "variant": "snow",
    "shan": 8,
    "form": "mountain4m_01",
    "shape": "4m",
    "footprintCells": 4,
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
    ],
    "textureId": "region:1a7acf8659f949997299"
  },
  {
    "id": 57,
    "kind": "mountain",
    "variant": "snow",
    "shan": 10,
    "form": "mountain7m_01",
    "shape": "7m",
    "footprintCells": 7,
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
    ],
    "textureId": "region:cbd0d1978f01835c5c49"
  },
  {
    "id": 58,
    "kind": "mountain",
    "variant": "snow",
    "shan": 11,
    "form": "mountain7m_02",
    "shape": "7m",
    "footprintCells": 7,
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
    ],
    "textureId": "region:62165345de620aa91c63"
  },
  {
    "id": 59,
    "kind": "mountain",
    "variant": "snow",
    "shan": 12,
    "form": "mountain7m_03",
    "shape": "7m",
    "footprintCells": 7,
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
    ],
    "textureId": "region:69b0e9d21647a8f820a6"
  },
  {
    "id": 60,
    "kind": "mountain",
    "variant": "snow",
    "shan": 13,
    "form": "mountain19m_01",
    "shape": "19m",
    "footprintCells": 19,
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
    ],
    "textureId": "region:06f42c11f9276985fdb1"
  },
  {
    "id": 61,
    "kind": "mountain",
    "variant": "snow",
    "shan": 14,
    "form": "mountain19m_02",
    "shape": "19m",
    "footprintCells": 19,
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
    ],
    "textureId": "region:06f42c11f9276985fdb1"
  }
];
