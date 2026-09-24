/**
 * 摆件层：把**原版切片**立在格上。纯逻辑，⛔ 不碰 cc。
 *
 * ★ **按原游戏的参数摆放**：原作近档是「底图 + 逐格一个 res_field 单位」，那个单位由该格的
 *   `res` 值（资源类型 + 等级）唯一决定。所以这里是**纯查表**：
 *   摆件图集的**格 id 就是原版值**（2..46）⇒ 值 → 图，⛔ 没有概率、没有哈希撒件。
 *   （早先按 16 类 + 哈希概率撒件，近档会出现「同样的 3 级粮田有的有有的没有」的穿帮。）
 * ★ **季/地貌变体（N1）**：先判带再选件 —— 格在雪带用 `MAPO_DECOR_SNOW_CELLS`、
 *   沙带用 `MAPO_DECOR_DESERT_CELLS`、否则基础季（`MAPO_DECOR_CELLS`）。
 *   带归属 = `mapoBandAt`（cell 级 `logic_background`，原版 `check_ground_type` 同一条数据链；
 *   ⛔ 别拿雪/沙**块**层当判据 —— 块带 489 块双挂、粒度粗，见 mapoBands.ts 抬头）。
 *   原版没配变体件的值在**打包期**已回退基础季件（变体表里照样有一格），⛔ 运行时零补救。
 *   ⚠ `autumn_*` 不接（M0-B3 已拍板山体换回基础季）。
 * ⚠ 摆件**超出菱形**（往上长），所以必须按**画家序**排（屏幕越低越靠前），
 * ⛔ 顺着可视模板的遍历序画会前后颠倒。
 * ⚠ 城址**不归这一层管**：2026-09-23 起由 `mapoCities` 画**原版真件**（`base.cw` 的两级配置
 *   直给，15 个件 / 249 座）。本层早先按「面积前 8 大 + 位置散列」挑城址件 —— 那是本仓
 *   自创的启发式，⛔ 已删，别改回来。
 * ★ **第 4 道门（M0-B4）**：原版 `ViewModelResField:check_validate` 最后一筛是
 *   「该格有 build 且 `is_show_res_field()` 为假 ⇒ 不画」（MAPORIGINAL-2D §2.1）——
 *   即**城/营占的格不叠资源件**。城占的是 2,689 格（249 座 × 4/6/7/11/23），
 *   ⛔ 不是只有 249 个中心格；而 2,689 格 100% 是 `res==1` 平地 ⇒ 抑制**只能靠占格表**，
 *   ⛔ 没法从地形值推出来。
 */
import {
 MAPO_DECOR_CELLS,
    MAPO_DECOR_DESERT_CELLS, MAPO_DECOR_SNOW_CELLS,
    type IMapoDecorCell,
} from "../../../shared/kits/mapOriginal/content/decor.data";
import { MAPO_CITY_CELL_KEYS } from "../../../shared/kits/mapOriginal/content/labels.data";
import {
    MAPO_BAND_DESERT, MAPO_BAND_SNOW,
} from "../../../shared/kits/mapOriginal/content/bands.data";
import {
    mapoGrid2Pos,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";
import { mapoBandAt } from "./mapoBands";

/** 值/城址 id → 图集格。一次算好，⛔ 不要每格 find。 */
const BY_ID: ReadonlyMap<number, IMapoDecorCell> =
    new Map(MAPO_DECOR_CELLS.map((c) => [c.id, c]));

/** 变体套：值 → 图集格（N1）。⚠ 键同样是**原版 res 值**，表不同而已。 */
const SNOW_BY_ID: ReadonlyMap<number, IMapoDecorCell> =
    new Map(MAPO_DECOR_SNOW_CELLS.map((c) => [c.id, c]));
const DESERT_BY_ID: ReadonlyMap<number, IMapoDecorCell> =
    new Map(MAPO_DECOR_DESERT_CELLS.map((c) => [c.id, c]));

/** 城**占**的全部格（2,689 格，含中心格）：这些格一律不画资源件（第 4 道门）。 */
const CITY_OCCUPIED = new Set<number>(MAPO_CITY_CELL_KEYS);

export interface IMapoDecorPlacement {
    readonly row: number;
    readonly col: number;
    readonly cell: IMapoDecorCell;
    readonly x: number;
    readonly y: number;
}

/**
 * 这一格放什么摆件；不放回 null。
 *
 * @param value   该格的**原版 res 值**（`mapoValueAt`）。
 * @param enabled 画质档是否建这层（`mapoDecorEnabledFor`）。
 *
 * ⚠ 这一层是**全有或全无**：原版每个资源格都有自己的 res_field，砍掉一部分就穿帮，
 * ⛔ 所以别再加「密度系数」。要省开销请整层关掉（流畅档），或靠 LOD 门控。
 *   近档一屏只有几十格（一格 300×150 世界像素），这层的预算本来就很小。
 */
export function mapoDecorAt(row: number, col: number, value: number,
                            enabled: boolean, bandAt: (row: number, col: number) => number = mapoBandAt): IMapoDecorPlacement | null {
    if (!enabled) return null;
    const pos = mapoGrid2Pos(row, col);
    // ★ 第 4 道门：城占的格一律不叠资源件（2,689 格，**含中心格** ——
    //   中心格由 `mapoCities` 画真件，⛔ 这里不能再放摆件，否则会与城重叠）
    if (CITY_OCCUPIED.has(row * 10000 + col)) return null;
    // ★ 资源格：值即格 id，一一对应，⛔ 零猜测
    // ★ 先判带再选件（N1）：雪带 → 雪件表，沙带 → 沙件表，否则基础季表
    const band = bandAt(row, col);
    const table = band === MAPO_BAND_SNOW ? SNOW_BY_ID
        : band === MAPO_BAND_DESERT ? DESERT_BY_ID : BY_ID;
    const cell = table.get(value) ?? BY_ID.get(value);
    if (!cell || cell.kind !== "res") return null;
    return { row, col, cell, x: pos.x, y: pos.y };
}
