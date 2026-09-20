/**
 * 鸟瞰聚合色块的几何与配色。⛔ 不碰 cc。
 *
 * ⚠ 一个分块在等距世界里是**平行四边形**（不是轴对齐矩形）：它的四角就是
 * (r0,c0) (r0,c1) (r1,c1) (r1,c0) 四格中心各外扩半格。⛔ 不要拿包围盒去画，
 * 那会让相邻分块互相盖住、边界成锯齿。
 */
import {
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W, sgzzGrid2Pos,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";
import {
    sgzzZoomChunkOrigin, sgzzZoomChunkTiles, type ISgzzChunkSummary,
} from "../../../shared/kits/sgzzmap/api/chunk/index";
import type { SgzzRgba } from "./sgzzPalette";

/** 色块顶点：四角世界坐标 + 颜色。 */
export interface SgzzBirdviewQuad {
    readonly points: readonly (readonly [number, number])[];
    readonly rgba: SgzzRgba;
}

/** 我盟（含我自己的地）。⚠ 分块粒度上「我的」与「我盟的」不再细分——一块 400+ 格里两者必然混着。 */
const UNION: SgzzRgba = [0.247, 0.706, 0.639, 1];
const RIVAL: SgzzRgba = [0.859, 0.322, 0.302, 1];
const NEUTRAL: SgzzRgba = [0.663, 0.639, 0.533, 1];

/**
 * 分块颜色：按**关系**取色，浓淡按「主导同盟占了这块的多少」。
 * ⚠ 与近景领地同一套关系语义，⛔ 不给每个同盟分配色相。
 */
export function sgzzBirdviewColor(summary: ISgzzChunkSummary, alliances: readonly string[],
                                  viewerUid: string, viewerAid: string, level: number): SgzzRgba {
    const aid = summary.alliance >= 0 ? alliances[summary.alliance] : "";
    const base = aid === "" ? NEUTRAL
        : (viewerAid !== "" && aid === viewerAid) ? UNION
        : RIVAL;
    void viewerUid;
    // 占比越高越实；最低也留 0.25，⛔ 不要淡到看不见
    const size = sgzzZoomChunkTiles(level);
    const share = Math.max(0, Math.min(1, summary.top / (size * size)));
    const alpha = 0.25 + Math.min(0.55, Math.sqrt(share) * 0.9);
    return [base[0], base[1], base[2], alpha];
}

/** 分块 → 平行四边形四角（世界坐标，顺时针）。 */
export function sgzzBirdviewCorners(level: number, key: number,
                                    rows: number, cols: number): readonly (readonly [number, number])[] {
    const size = sgzzZoomChunkTiles(level);
    const origin = sgzzZoomChunkOrigin(level, key);
    const r0 = origin.row, c0 = origin.col;
    const r1 = Math.min(rows - 1, r0 + size - 1), c1 = Math.min(cols - 1, c0 + size - 1);
    const a = sgzzGrid2Pos(r0, c0), b = sgzzGrid2Pos(r0, c1);
    const c = sgzzGrid2Pos(r1, c1), d = sgzzGrid2Pos(r1, c0);
    // 各朝外扩半格，块与块之间才严丝合缝
    return [
        [a.x, a.y + SGZZ_TILE_HALF_H],
        [b.x - SGZZ_TILE_HALF_W, b.y],
        [c.x, c.y - SGZZ_TILE_HALF_H],
        [d.x + SGZZ_TILE_HALF_W, d.y],
    ];
}

export function sgzzBirdviewQuads(summaries: Iterable<ISgzzChunkSummary>, alliances: readonly string[],
                                  viewerUid: string, viewerAid: string, level: number,
                                  rows: number, cols: number): SgzzBirdviewQuad[] {
    const out: SgzzBirdviewQuad[] = [];
    for (const s of summaries) {
        out.push({
            points: sgzzBirdviewCorners(level, s.key, rows, cols),
            rgba: sgzzBirdviewColor(s, alliances, viewerUid, viewerAid, level),
        });
    }
    // 画家序：按块原点的 (row+col) —— 与近景同一套规则
    out.sort((p, q) => (p.points[0][1] === q.points[0][1]
        ? p.points[0][0] - q.points[0][0]
        : q.points[0][1] - p.points[0][1]));
    return out;
}
