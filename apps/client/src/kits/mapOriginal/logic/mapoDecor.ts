/**
 * 摆件层：把**原版切片**立在格上。纯逻辑，⛔ 不碰 cc。
 *
 * ★ **按原游戏的参数摆放**：原作近档是「底图 + 逐格一个 res_field 单位」，那个单位由该格的
 *   `res` 值（资源类型 + 等级）唯一决定。所以这里是**纯查表**：
 *   摆件图集的**格 id 就是原版值**（2..46）⇒ 值 → 图，⛔ 没有概率、没有哈希撒件。
 *   （早先按 16 类 + 哈希概率撒件，近档会出现「同样的 3 级粮田有的有有的没有」的穿帮。）
 * ⚠ 摆件**超出菱形**（往上长），所以必须按**画家序**排（屏幕越低越靠前），
 * ⛔ 顺着可视模板的遍历序画会前后颠倒。
 * ⚠ 城址不在 `res` 值空间里（城建在平地上），它走 `city_center.lua` 的真坐标另开一段格 id。
 * ★ **第 4 道门（M0-B4）**：原版 `ViewModelResField:check_validate` 最后一筛是
 *   「该格有 build 且 `is_show_res_field()` 为假 ⇒ 不画」（MAPORIGINAL-2D §2.1）——
 *   即**城/营占的格不叠资源件**。城占的是 2,689 格（249 座 × 4/6/7/11/23），
 *   ⛔ 不是只有 249 个中心格；而 2,689 格 100% 是 `res==1` 平地 ⇒ 抑制**只能靠占格表**，
 *   ⛔ 没法从地形值推出来。
 */
import {
    MAPO_DECOR_ATLAS_H, MAPO_DECOR_ATLAS_W, MAPO_DECOR_CELLS, MAPO_DECOR_CITY_BASE,
    type IMapoDecorCell,
} from "../../../shared/kits/mapOriginal/content/decor.data";
import {
    MAPO_CITY_CELL_KEYS, MAPO_CITY_SITES,
} from "../../../shared/kits/mapOriginal/content/labels.data";
import {
    mapoGrid2Pos, mapoOriginalPxToWorld,
} from "../../../shared/kits/mapOriginal/api/hexmap/index";

/** 值/城址 id → 图集格。一次算好，⛔ 不要每格 find。 */
const BY_ID: ReadonlyMap<number, IMapoDecorCell> =
    new Map(MAPO_DECOR_CELLS.map((c) => [c.id, c]));

/** 城址件（id ≥ CITY_BASE），按位置稳定挑一件。 */
const CITY_CELLS: readonly IMapoDecorCell[] =
    MAPO_DECOR_CELLS.filter((c) => c.id >= MAPO_DECOR_CITY_BASE);

/** 城**中心**格：原版 `city_center.lua` 的真坐标，城址件画在这里。 */
const CITY_AT = new Set<number>(MAPO_CITY_SITES.map((s) => s.row * 10000 + s.col));

/** 城**占**的全部格（2,689 格）：这些格一律不画资源件（第 4 道门）。 */
const CITY_OCCUPIED = new Set<number>(MAPO_CITY_CELL_KEYS);

/** 位置的纯函数散列 —— **只用来在城址件里挑一件**，⛔ 不再决定「放不放」。 */
function hash(row: number, col: number, salt: number): number {
    let h = (row * 374761393) ^ (col * 668265263) ^ (salt * 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
}

export interface IMapoDecorPlacement {
    readonly row: number;
    readonly col: number;
    readonly cell: IMapoDecorCell;
    /** 世界坐标（菱形中心）。摆件**底边中点**对齐到这里。 */
    readonly x: number;
    readonly y: number;
    /** 额外放大系数。⚠ 常态是 1：件的大小由原图像素定（见 `mapoDecorSize`）。 */
    readonly scale: number;
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
                            enabled: boolean): IMapoDecorPlacement | null {
    if (!enabled) return null;
    const pos = mapoGrid2Pos(row, col);
    // ★ 城址：原版真坐标，恒放且放大
    if (CITY_AT.has(row * 10000 + col) && CITY_CELLS.length > 0) {
        return { row, col, cell: CITY_CELLS[hash(row, col, 7) % CITY_CELLS.length],
                 x: pos.x, y: pos.y, scale: 1 };
    }
    // ★ 第 4 道门：城占的格不叠资源件（⚠ 中心格已在上面 return，这里挡的是其余 2,440 格）
    if (CITY_OCCUPIED.has(row * 10000 + col)) return null;
    // ★ 资源格：值即格 id，一一对应，⛔ 零猜测
    const cell = BY_ID.get(value);
    if (!cell || cell.id >= MAPO_DECOR_CITY_BASE) return null;
    return { row, col, cell, x: pos.x, y: pos.y, scale: 1 };
}

/** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
export function mapoDecorUv(cell: IMapoDecorCell): readonly [number, number, number, number] {
    const [x, y, w, h] = cell.art;
    const [cx, cy] = cell.cell;
    return [(cx + x) / MAPO_DECOR_ATLAS_W, (cy + y) / MAPO_DECOR_ATLAS_H,
            w / MAPO_DECOR_ATLAS_W, h / MAPO_DECOR_ATLAS_H];
}

/**
 * 摆件在世界里的尺寸 —— **按原图像素换算**，⛔ 不按格宽拉伸。
 *
 * ★ 原版 2D 一格 300 px 宽（`config_2d` 的 TILE_WIDTH=150 是半宽），所以一张 220 px 的
 *   3 级木材图在原版里就占 0.73 格。照这个比例还原，**件的大小也成了原版参数**：
 *   等级差本来就体现在件的大小上（资源件实测 0.53~1.10 格）。
 * ⚠ 早先按固定 1.0 格宽拉伸，把等级差抹平了，⛔ 别改回去。
 * ⚠ 高度按原图纵横比算，⛔ 不要单独拉高（会让塔楼变矮胖）。
 */
export function mapoDecorSize(cell: IMapoDecorCell, scale: number): { w: number; h: number } {
    const [nw, nh] = cell.native;
    const w = mapoOriginalPxToWorld(nw) * scale;
    return { w, h: w * (nh / Math.max(nw, 1)) };
}
