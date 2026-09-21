/**
 * 摆件层：把**原版切片**（城/营/建筑/资源地物）立在格上。纯逻辑，⛔ 不碰 cc。
 *
 * ⚠ 这是打散「铺地砖」观感最直接的一层 —— 原版的近档地貌本来就主要靠这些**互相叠压的
 * 有机地物**撑起来的，底下那层菱形只是垫底。
 * ⚠ 摆件**超出菱形**（往上长），所以必须按**画家序**排（屏幕越低越靠前），
 * ⛔ 顺着可视模板的遍历序画会前后颠倒。
 * ⚠ 放置必须是**位置的纯函数**：同一格每帧给同一件，⛔ 随机数会让平移时闪。
 */
import {
    MAPO_DECOR_ATLAS_H, MAPO_DECOR_ATLAS_W, MAPO_DECOR_CELLS, type IMapoDecorCell,
} from "../../../shared/kits/mapOriginal/content/decor.data";
import { MAPO_CITY_SITES } from "../../../shared/kits/mapOriginal/content/labels.data";
import { mapoGrid2Pos } from "../../../shared/kits/mapOriginal/api/hexmap/index";

/** 显示类 id（与 content/display.data.ts 对齐）。 */
const CLS = {
    plain: 0, wood: 1, stone: 2, food: 3, iron: 4, gold: 5, water: 6, forest: 7,
    wetland: 8, desert: 9, hill: 10, river: 11, mountain: 12, grove: 13,
    scatter: 14, special: 15,
} as const;

/** 每个显示类的摆件概率与偏好类别。⛔ 水/河/山不放（水里不种树，山本身就是地貌）。 */
const RULES: Readonly<Record<number, { p: number; kinds: readonly string[] }>> = {
    [CLS.plain]: { p: 0.04, kinds: ["build"] },
    [CLS.wood]: { p: 0.30, kinds: ["resource", "build"] },
    [CLS.stone]: { p: 0.30, kinds: ["resource", "build"] },
    [CLS.food]: { p: 0.30, kinds: ["resource", "build"] },
    [CLS.iron]: { p: 0.30, kinds: ["resource", "build"] },
    [CLS.gold]: { p: 0.30, kinds: ["resource", "build"] },
    [CLS.forest]: { p: 0.22, kinds: ["build", "camp"] },
    [CLS.wetland]: { p: 0.12, kinds: ["build"] },
    [CLS.desert]: { p: 0.10, kinds: ["camp"] },
    [CLS.hill]: { p: 0.16, kinds: ["camp", "build"] },
    [CLS.grove]: { p: 0.18, kinds: ["build", "camp"] },
    [CLS.scatter]: { p: 0.10, kinds: ["build"] },
    [CLS.special]: { p: 0.60, kinds: ["camp", "city"] },
};

/** 按类别分组的图集件，一次算好。⛔ 不要每格 filter。 */
const BY_KIND = ((): ReadonlyMap<string, readonly IMapoDecorCell[]> => {
    const m = new Map<string, IMapoDecorCell[]>();
    for (const c of MAPO_DECOR_CELLS) {
        const list = m.get(c.kind) ?? [];
        list.push(c);
        m.set(c.kind, list);
    }
    return m;
})();

/** 城址集合：原版 `city_center.lua` 的真坐标，这些格恒放 city 件。 */
const CITY_AT = new Set<number>(MAPO_CITY_SITES.map((s) => s.row * 10000 + s.col));

/** 位置的纯函数散列（与 mapoTileVariant 同族，⛔ 不用随机数）。 */
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
    /** 城址上的件画得大一点。 */
    readonly scale: number;
}

/**
 * 这一格放什么摆件；不放回 null。
 * @param density 0..1，来自画质档（`mapoDecorDensityFor`）；0 = 整层不建。
 */
export function mapoDecorAt(row: number, col: number, classId: number,
                            density: number): IMapoDecorPlacement | null {
    if (!(density > 0)) return null;
    const pos = mapoGrid2Pos(row, col);
    // ★ 城址：原版真坐标，恒放且放大 —— ⛔ 不参与概率
    if (CITY_AT.has(row * 10000 + col)) {
        const list = BY_KIND.get("city") ?? [];
        if (list.length > 0) {
            return { row, col, cell: list[hash(row, col, 7) % list.length],
                     x: pos.x, y: pos.y, scale: 1.35 };
        }
    }
    const rule = RULES[classId];
    if (!rule) return null;
    const roll = hash(row, col, 1) / 0xffffffff;
    if (roll >= rule.p * density) return null;
    const kind = rule.kinds[hash(row, col, 2) % rule.kinds.length];
    const list = BY_KIND.get(kind) ?? [];
    if (list.length === 0) return null;
    return { row, col, cell: list[hash(row, col, 3) % list.length], x: pos.x, y: pos.y, scale: 1 };
}

/** 图集格 → 归一化 UV [u0, v0, uw, vh]（v 原点在上）。 */
export function mapoDecorUv(cell: IMapoDecorCell): readonly [number, number, number, number] {
    const [x, y, w, h] = cell.art;
    const [cx, cy] = cell.cell;
    return [(cx + x) / MAPO_DECOR_ATLAS_W, (cy + y) / MAPO_DECOR_ATLAS_H,
            w / MAPO_DECOR_ATLAS_W, h / MAPO_DECOR_ATLAS_H];
}

/**
 * 摆件在世界里的尺寸。图集格宽 = 一格菱形宽的 `WIDTH_TILES` 倍（原版地物本来就压邻格）。
 * ⚠ 高度按原始像素比例算，⛔ 不要拉伸（拉伸会让塔楼变矮胖）。
 */
export const MAPO_DECOR_WIDTH_TILES = 1.6;

export function mapoDecorSize(cell: IMapoDecorCell, tileHalfW: number,
                              scale: number): { w: number; h: number } {
    const [, , aw, ah] = cell.art;
    const w = tileHalfW * 2 * MAPO_DECOR_WIDTH_TILES * scale;
    return { w, h: w * (ah / Math.max(aw, 1)) };
}
