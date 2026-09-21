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
 * 两种形态：
 *  - **有图集**（美术已交付）：整张 256×256 画布的**矩形** + UV，剪影在 alpha 里。
 *    ⛔ 不能套到 topRatio 压窄的占位梯形上 —— 那会把画布连同透明留白一起挤变形。
 *  - **没图集**（首帧 / 资源缺失）：梯形剪影 + 顶色兜底。
 */
import { SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos } from "../../../shared/kits/sgzzmap/api/hexmap/index";

export interface SgzzDecorKind {
    readonly id: number;
    readonly name: string;
    /**
     * **参考框**（世界单位）——美术按它等比放进画布，⚠ 运行时**不直接用它定尺寸**
     * （尺寸由画布 + 3px/单位 决定）。它只用于占位梯形与文档对照。
     */
    readonly width: number;
    readonly height: number;
    /** 顶边宽 / 底边宽。⚠ 只给**占位梯形**用；有图集时剪影在 alpha 里，⛔ 与它无关。 */
    readonly topRatio: number;
    readonly rgba: readonly [number, number, number, number];
}

/**
 * 摆件画布与世界的换算：**3 像素 = 1 世界单位**（美术交付 v1.1 定的基准）。
 * 画布 256×256、锚点在左上原点的 (128, 224) ⇒ 整幅画布相对地面落点的偏移：
 *   左/右 ±128/3、上 +224/3、下 −32/3。⚠ 尺寸抖动对这些偏移**统一**乘同一个 scale。
 * ⛔ 不要把整张带透明留白的画布缩成下表的「参考框」尺寸 —— 那会二次缩小并变形。
 */
export const SGZZ_DECOR_PX_PER_UNIT = 3;
export const SGZZ_DECOR_CANVAS_PX = 256;
export const SGZZ_DECOR_ANCHOR_X_PX = 128;
export const SGZZ_DECOR_ANCHOR_Y_PX = 224;

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

/** 尺寸抖动的幅度（±）。⚠ 真机上不抖的话成排锥体一模一样，一眼假。 */
export const SGZZ_DECOR_JITTER = 0.15;

/**
 * 这一格摆件的尺寸系数。⚠ 同样是**位置的纯函数**（⛔ 随机数会让平移时摆件忽大忽小），
 * 且与「种类」「UV 翻转」用不同的混洗常数 —— ⛔ 否则大小会和种类相关，现出规律。
 */
export function sgzzDecorScale(row: number, col: number): number {
    let h = (row * 668265263) ^ (col * 374761393);
    h = (h ^ (h >>> 16)) * 2246822519;
    h = (h ^ (h >>> 13)) >>> 0;
    return 1 - SGZZ_DECOR_JITTER + (h % 1000) / 1000 * SGZZ_DECOR_JITTER * 2;
}

/** 地面落点：格心略沉。⚠ 4 世界单位 = 半格高的 1/4（整格高 32 的 1/8）—— 规范文案按这个数对齐。 */
export function sgzzDecorBaseY(row: number, col: number): number {
    return sgzzGrid2Pos(row, col).y - SGZZ_TILE_HALF_H * 0.25;
}

/**
 * 有图集时的摆件矩形：整张画布，剪影在 alpha 里。
 *
 * ⚠ 按 3px/世界单位换算画布偏移，⛔ 不用 kind.width/height（那是美术的参考框，
 *   主体未必填满，拿它当画布尺寸会把造型二次缩小并变形）。
 * ⚠ 抖动 scale 对四个偏移统一相乘，⛔ 不能只缩高不缩宽。
 */
export function sgzzDecorSpriteQuad(row: number, col: number, decorId: number):
    { readonly points: readonly (readonly [number, number])[] } | null {
    if (!SGZZ_DECOR_KINDS[decorId]) return null;
    const c = sgzzGrid2Pos(row, col);
    const scale = sgzzDecorScale(row, col);
    const baseY = sgzzDecorBaseY(row, col);
    const u = SGZZ_DECOR_PX_PER_UNIT;
    const half = (SGZZ_DECOR_ANCHOR_X_PX / u) * scale;
    const up = ((SGZZ_DECOR_CANVAS_PX - SGZZ_DECOR_ANCHOR_Y_PX) / u) * scale;   // 224 以下那 32px
    const down = (SGZZ_DECOR_ANCHOR_Y_PX / u) * scale;                          // 锚点以上的 224px
    // 左上、右上、右下、左下（世界 y 向上 ⇒ 「上」= baseY + down）
    return {
        points: [
            [c.x - half, baseY + down], [c.x + half, baseY + down],
            [c.x + half, baseY - up], [c.x - half, baseY - up],
        ],
    };
}

/**
 * 占位摆件的四边形（梯形剪影，⛔ 仅在图集缺席时用）。
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
    const scale = sgzzDecorScale(row, col);
    const bottom = sgzzDecorBaseY(row, col);
    const top = bottom + kind.height * scale;
    const halfB = kind.width * scale / 2, halfT = halfB * kind.topRatio;
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

/**
 * 摆件层的世界高度上界（世界单位），供视口预取多留一圈 —— ⛔ 否则下边缘的树会突然弹出来。
 * ⚠ 必须算上尺寸抖动的上限，⛔ 不能只取 kind.height。
 */
export const SGZZ_DECOR_MAX_HEIGHT = Math.max(
    SGZZ_DECOR_KINDS.reduce((m, k) => Math.max(m, k.height), 0),
    // ⚠ 有图集时高度由**画布**决定（锚点以上 224px ÷ 3），⛔ 不是参考框的 height
    SGZZ_DECOR_ANCHOR_Y_PX / SGZZ_DECOR_PX_PER_UNIT,
) * (1 + SGZZ_DECOR_JITTER);
/** 换算成格数（向上取整），可视模板要按它多取几行。 */
export const SGZZ_DECOR_MARGIN_TILES = Math.ceil(SGZZ_DECOR_MAX_HEIGHT / (SGZZ_TILE_HALF_H * 2));
/** ⚠ 引用一下 TILE_HALF_W，免得未来有人以为摆件宽度与格宽无关。 */
export const SGZZ_DECOR_MAX_WIDTH_TILES = SGZZ_DECOR_KINDS.reduce((m, k) => Math.max(m, k.width), 0)
    / (SGZZ_TILE_HALF_W * 2);

// ── 摆件图集布局（与 tools/sgzzmap-maps/pack-atlas.py 的 DECOR_* 一一对应） ──────
// ⚠ 与地表图集**不是同一张**：摆件是 256×256 方格、3×3 排布、1024×1024 表。
export const SGZZ_DECOR_ATLAS_GUTTER = 4;
export const SGZZ_DECOR_ATLAS_COLS = 3;
export const SGZZ_DECOR_ATLAS_SIZE = 1024;

/** 第 id 个摆件在图集里的归一化 UV [u0, v0, uw, vh]。⚠ v 原点在**上**。 */
export function sgzzDecorAtlasUv(decorId: number): readonly [number, number, number, number] {
    const row = Math.floor(decorId / SGZZ_DECOR_ATLAS_COLS), col = decorId % SGZZ_DECOR_ATLAS_COLS;
    const pitch = SGZZ_DECOR_CANVAS_PX + SGZZ_DECOR_ATLAS_GUTTER * 2;
    const x = SGZZ_DECOR_ATLAS_GUTTER + col * pitch, y = SGZZ_DECOR_ATLAS_GUTTER + row * pitch;
    const s = SGZZ_DECOR_ATLAS_SIZE;
    return [x / s, y / s, SGZZ_DECOR_CANVAS_PX / s, SGZZ_DECOR_CANVAS_PX / s];
}
/** 摆件矩形四角对应的 UV 角（左上、右上、右下、左下）—— 与 sgzzDecorSpriteQuad 的点序一致。 */
export function sgzzDecorSpriteUvs(decorId: number): readonly (readonly [number, number])[] {
    const [u0, v0, uw, vh] = sgzzDecorAtlasUv(decorId);
    return [[u0, v0], [u0 + uw, v0], [u0 + uw, v0 + vh], [u0, v0 + vh]];
}
