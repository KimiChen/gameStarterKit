/**
 * sgzzmap chunk v1：鸟瞰分块聚合契约的零依赖单源。
 *
 * ⚠ 这是**最会变**的一个面（加缩放档 / 改 top-K / 给摘要加字段），所以从 hexmap 里拆出来单独版本化：
 * 否则每加一档缩放都要破坏「人人依赖、永不变」的 hexmap 面。见 docs/KIT.md §4。
 *
 * 取自原作 `script/logic/map/birdview/cfg/map_birdview_cfg.lua`：
 *   chunk_lod_to_grid_size = {10,20,30,40,50,60}、ZOOM_AOI_LEVEL 三档。
 * 本实现取其中三档做聚合（10 那一档是近景 chunk，由 view 直接发逐格数据）。
 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

import { SGZZ_MAP_COLS, SGZZ_MAP_ROWS, type ISgzzRect } from "../hexmap/index";
import { SGZZ_MAX_AID } from "../territory/index";

/** 三档鸟瞰聚合边长（格）。⛔ 下标即线型 level，追加只能往后加。 */
export const SGZZ_ZOOM_CHUNK_TILES: readonly number[] = Object.freeze([20, 40, 60]);
export const SGZZ_MAX_ZOOM_LEVEL = SGZZ_ZOOM_CHUNK_TILES.length - 1;
/** 单次 zoom 请求的分块数上限——同时是响应体积闸。最粗档整张图 25×25=625 块，进得来。 */
export const SGZZ_MAX_ZOOM_CHUNKS = 1024;

export function sgzzZoomChunkTiles(level: number): number {
    if (!Number.isInteger(level) || level < 0 || level > SGZZ_MAX_ZOOM_LEVEL) {
        throw new RangeError("SGZZ zoom level invalid");
    }
    return SGZZ_ZOOM_CHUNK_TILES[level];
}
export function sgzzZoomChunkRows(level: number): number {
    return Math.ceil(SGZZ_MAP_ROWS / sgzzZoomChunkTiles(level));
}
export function sgzzZoomChunkCols(level: number): number {
    return Math.ceil(SGZZ_MAP_COLS / sgzzZoomChunkTiles(level));
}
/** 某档下 (row,col) 落在哪个分块。 */
export function sgzzZoomChunkKey(level: number, row: number, col: number): number {
    const size = sgzzZoomChunkTiles(level);
    if (!Number.isInteger(row) || !Number.isInteger(col)
        || row < 0 || col < 0 || row >= SGZZ_MAP_ROWS || col >= SGZZ_MAP_COLS) {
        throw new RangeError("SGZZ grid outside map");
    }
    return Math.floor(row / size) * sgzzZoomChunkCols(level) + Math.floor(col / size);
}
export function sgzzZoomChunkOrigin(level: number, key: number): { row: number; col: number } {
    const size = sgzzZoomChunkTiles(level);
    const cols = sgzzZoomChunkCols(level);
    return { row: Math.floor(key / cols) * size, col: (key % cols) * size };
}

/** 以某格为中心、半径 radius 个分块的矩形（已按该档边界收口）。 */
export function sgzzZoomRectForCenter(level: number, row: number, col: number, radius: number): ISgzzRect {
    const cols = sgzzZoomChunkCols(level), rows = sgzzZoomChunkRows(level);
    const size = sgzzZoomChunkTiles(level);
    const cr = Math.floor(Math.max(0, Math.min(SGZZ_MAP_ROWS - 1, row)) / size);
    const cc = Math.floor(Math.max(0, Math.min(SGZZ_MAP_COLS - 1, col)) / size);
    const r = Math.max(0, Math.trunc(radius));
    return {
        minRow: Math.max(0, cr - r), minCol: Math.max(0, cc - r),
        maxRow: Math.min(rows - 1, cr + r), maxCol: Math.min(cols - 1, cc + r),
    };
}

export function validateSgzzZoomLevel(value: unknown, path = "payload.level"): number {
    return finiteInteger(value, path, 0, SGZZ_MAX_ZOOM_LEVEL);
}
export function validateSgzzZoomRect(value: unknown, level: number, path = "payload.rect"): ISgzzRect {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["minRow", "minCol", "maxRow", "maxCol"], [], path);
    const rows = sgzzZoomChunkRows(level), cols = sgzzZoomChunkCols(level);
    const rect: ISgzzRect = {
        minRow: finiteInteger(r.minRow, `${path}.minRow`, 0, rows - 1),
        minCol: finiteInteger(r.minCol, `${path}.minCol`, 0, cols - 1),
        maxRow: finiteInteger(r.maxRow, `${path}.maxRow`, 0, rows - 1),
        maxCol: finiteInteger(r.maxCol, `${path}.maxCol`, 0, cols - 1),
    };
    const area = (rect.maxRow - rect.minRow + 1) * (rect.maxCol - rect.minCol + 1);
    if (rect.minRow > rect.maxRow || rect.minCol > rect.maxCol || area > SGZZ_MAX_ZOOM_CHUNKS) {
        throw new WireValidationError("SGZZMAP_ZOOM_RECT", path);
    }
    return rect;
}

/**
 * 一个分块的摘要：占了多少格、由哪个同盟主导。
 * `alliance` 是响应里 alliances[] 的下标；-1 = 有主但无盟主导。
 */
export interface ISgzzChunkSummary {
    readonly key: number;
    readonly tiles: number;
    readonly alliance: number;
    /** 主导同盟占了这块里的多少格（≤ tiles）；用来画「争夺中」的浓淡。 */
    readonly top: number;
}

export function validateSgzzChunkSummary(value: unknown, allianceCount: number, maxTiles: number,
                                         path = "chunk"): ISgzzChunkSummary {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["key", "tiles", "alliance", "top"], [], path);
    const summary: ISgzzChunkSummary = {
        key: finiteInteger(r.key, `${path}.key`, 0),
        tiles: finiteInteger(r.tiles, `${path}.tiles`, 1, maxTiles),
        alliance: finiteInteger(r.alliance, `${path}.alliance`, -1, allianceCount - 1),
        top: finiteInteger(r.top, `${path}.top`, 1, maxTiles),
    };
    if (summary.top > summary.tiles) throw new WireValidationError("SGZZMAP_CHUNK_TOP", `${path}.top`);
    return summary;
}

export function validateSgzzAllianceId(value: unknown, path: string): string {
    return boundedString(value, path, 1, SGZZ_MAX_AID);
}
