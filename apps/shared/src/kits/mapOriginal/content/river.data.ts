/**
 * mapOriginal 河流层常量（s1）—— **生成物，⛔ 勿手改**。
 *
 * ★ 机制见 docs/MAPORIGINAL-2D.md §4.1：`river.bytes` 是「河格 → `river_path.json` 下标」的
 *   单字节图，**选片在制图期就烘死在字节值里**，运行时 ⛔ 不做任何邻接判断。
 * ★ 一个「河格」= **3×3 逻辑格**；起点偏移 **−6**（logic row = 3·i − 6）是实测定死的：
 *   河格覆盖了 235290 / 235292 个 `res==47` 格（100.0%）。
 * ★ 水面几何可用于原版静态填充与 normal_river；颜色蒙版/法线另由 build_surface.py 导出。
 */

export interface IMapoRiverSystem {
    readonly system: number;
    readonly name: string;
    /** 原版填充图的平色（本仓只取其相对明度）。 */
    readonly rgb: readonly [number, number, number];
}

/** 河格边长（河格数）。 */
export const MAPO_RIVER_SIDE = 504;
/** 一个河格 = 几个逻辑格。 */
export const MAPO_RIVER_TILES = 3;
/** logic row = MAPO_RIVER_TILES × i + MAPO_RIVER_ORIGIN。 */
export const MAPO_RIVER_ORIGIN = -6;
export const MAPO_RIVER_S_BIAS = 16;
export const MAPO_RIVER_D_BIAS = 1500;
/** 摆放表单条长度（u16 s, u16 d, u8 geo, u8 保留）。 */
export const MAPO_RIVER_RECORD_BYTES = 6;
export const MAPO_RIVER_HEADER_BYTES = 4;
/** 几何库条数（= `river_path.json` 的长度）。 */
export const MAPO_RIVER_GEO_COUNT = 102;
/** 三条水系；次序即 `river-fill.png` 里三个 2×2 色块的次序。 */
export const MAPO_RIVER_SYSTEMS: readonly IMapoRiverSystem[] = [{"system": 0, "name": "river", "rgb": [78, 88, 94]}, {"system": 1, "name": "river_yellowriver", "rgb": [148, 154, 155]}, {"system": 2, "name": "river_longriver", "rgb": [99, 108, 113]}];
