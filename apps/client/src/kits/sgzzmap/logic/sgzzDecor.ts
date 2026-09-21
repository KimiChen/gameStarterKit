/**
 * 摆件层（decor）：压在地表上、**可以超出菱形**的小造型——树、山峰、礁岩、芦苇……
 *
 * ⚠ 存在的理由：地表片按规范是「从上方看下去的一块地皮」，一切都压在菱形内，
 * 所以参考图里那种有高度的树/城墙/山峰画不出来。摆件是唯一能给地图高度的一层。
 *
 * ⚠ 摆件**不进 shared**：服务端完全不关心它（纯表现），⛔ 不要为了「看起来对称」
 * 去撑大 kit 的 API 面。地形 id → 摆件的映射是位置的纯函数，零额外数据。
 *
 * ⚠ 摆件必须**按画家序**画：菱形网格上「屏幕越低 = 越靠前」，一棵树要挡住它**后面**那些格
 * 而不是相反。序就是 (row+col) 升序、(row−col) 升序 —— 与地表同一套 sgzzPainterCompare。
 *
 * ⛔ 还没有美术：先用梯形剪影 + 顶色，等图集到货换成贴图（同 uv 机制）。
 */
import { SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos } from "../../../shared/kits/sgzzmap/api/hexmap/index";

export interface SgzzDecorKind {
    readonly id: number;
    readonly name: string;
    /** 世界单位。⚠ 高度可以（而且应该）超过菱形的 2×TH = 32。 */
    readonly width: number;
    readonly height: number;
    /** 顶边宽 / 底边宽。1 = 矩形，0.2 = 尖顶。剪影形状靠它区分针叶/阔叶/山峰/矮丘。 */
    readonly topRatio: number;
    readonly rgba: readonly [number, number, number, number];
}

/** ⚠ id 即下标；图集格号也按它排，⛔ 改序要同改美术交付。 */
export const SGZZ_DECOR_KINDS: readonly SgzzDecorKind[] = Object.freeze([
    { id: 0, name: "tree", width: 38, height: 52, topRatio: 0.30, rgba: [0.227, 0.357, 0.208, 0.95] },
    { id: 1, name: "pine", width: 32, height: 62, topRatio: 0.16, rgba: [0.169, 0.310, 0.200, 0.95] },
    { id: 2, name: "rock", width: 34, height: 26, topRatio: 0.55, rgba: [0.435, 0.427, 0.373, 0.92] },
    { id: 3, name: "peak", width: 56, height: 46, topRatio: 0.12, rgba: [0.396, 0.420, 0.427, 0.95] },
    { id: 4, name: "reed", width: 26, height: 24, topRatio: 0.45, rgba: [0.408, 0.478, 0.318, 0.88] },
    { id: 5, name: "dune", width: 40, height: 18, topRatio: 0.70, rgba: [0.694, 0.639, 0.463, 0.85] },
    { id: 6, name: "tuft", width: 22, height: 14, topRatio: 0.60, rgba: [0.408, 0.451, 0.290, 0.75] },
]);
export const SGZZ_DECOR_NONE = -1;

/**
 * 地形 → 可能的摆件与出现率（千分比）。
 * ⚠ 密度要留白：满屏摆件既顶不住顶点预算，也把地形本身盖没了。
 */
const BY_TERRAIN: ReadonlyMap<number, { readonly ids: readonly number[]; readonly per1000: number }> =
    new Map([
        [0, { ids: [6], per1000: 120 }],           // 平原：稀疏草丛
        [1, { ids: [0, 1], per1000: 550 }],        // 森林：阔叶 / 针叶
        [2, { ids: [2], per1000: 340 }],           // 丘陵：礁岩
        [3, { ids: [3], per1000: 700 }],           // 山地：峰
        [6, { ids: [4], per1000: 400 }],           // 湿地：芦苇
        [7, { ids: [5], per1000: 240 }],           // 荒漠：沙丘
    ]);
// 水域(4)/海(5)/图外(8) 没有摆件 —— ⛔ 别往水里种树

/**
 * 这一格摆什么。⚠ 必须是**位置的纯函数**：同一格每帧同一个结果，
 * ⛔ 随机数会让平移时摆件乱跳。
 */
export function sgzzDecorAt(terrainId: number, row: number, col: number): number {
    const rule = BY_TERRAIN.get(terrainId);
    if (!rule) return SGZZ_DECOR_NONE;
    // ⚠ 与 sgzzTileVariant 用不同的混洗常数，⛔ 否则「翻转」和「有没有摆件」会相关，
    //   表现成一条一条的规律带
    let h = (row * 2654435761) ^ (col * 40503);
    h = (h ^ (h >>> 15)) * 2246822519;
    h = (h ^ (h >>> 13)) >>> 0;
    if (h % 1000 >= rule.per1000) return SGZZ_DECOR_NONE;
    return rule.ids[(h >>> 10) % rule.ids.length];
}

/**
 * 摆件的四边形（世界坐标，顺时针：左上、右上、右下、左下）。
 *
 * ⚠ 锚点是**格心略下**，造型从那里往**上**长 —— 所以它必然超出菱形，这正是这一层的意义。
 * ⛔ 不要把它压回菱形内，那就退化成地表片了。
 */
export function sgzzDecorQuad(row: number, col: number, decorId: number):
    { readonly points: readonly (readonly [number, number])[];
      readonly rgba: readonly [number, number, number, number] } | null {
    const kind = SGZZ_DECOR_KINDS[decorId];
    if (!kind) return null;
    const c = sgzzGrid2Pos(row, col);
    const bottom = c.y - SGZZ_TILE_HALF_H * 0.25;      // 略沉进地里，看着是「立在格上」
    const top = bottom + kind.height;
    const halfB = kind.width / 2, halfT = halfB * kind.topRatio;
    return {
        points: [
            [c.x - halfT, top], [c.x + halfT, top],
            [c.x + halfB, bottom], [c.x - halfB, bottom],
        ],
        rgba: kind.rgba,
    };
}

/** 一屏摆件的硬上限（单 mesh 四边形上限之内，留足余量）。超了就整层不画，⛔ 不抛异常。 */
export const SGZZ_MAX_DECOR_QUADS = 12_000;

/** 摆件层的世界高度上界（世界单位），供视口预取多留一圈 —— ⛔ 否则上边缘的树会突然弹出来。 */
export const SGZZ_DECOR_MAX_HEIGHT = SGZZ_DECOR_KINDS.reduce((m, k) => Math.max(m, k.height), 0);
/** 换算成格数（向上取整），可视模板要按它多取几行。 */
export const SGZZ_DECOR_MARGIN_TILES = Math.ceil(SGZZ_DECOR_MAX_HEIGHT / (SGZZ_TILE_HALF_H * 2));
/** ⚠ 引用一下 TILE_HALF_W，免得未来有人以为摆件宽度与格宽无关。 */
export const SGZZ_DECOR_MAX_WIDTH_TILES = SGZZ_DECOR_KINDS.reduce((m, k) => Math.max(m, k.width), 0)
    / (SGZZ_TILE_HALF_W * 2);
