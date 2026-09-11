/** SLG worldmap v1：坐标、分块、LOD 与守备规则的零依赖单源。 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

// 五国多图化（2026-09-12）：地图目录 + tileId 打包（mapIndex 4bit + y/x 各 11bit）。
// 森之国 1500×1500 沿用《三国志·战略版》标准图格数（zlbAllVersion code/script/config/config_3d.lua:11
// 的 MAP_WIDTH/MAP_HEIGHT=1500）；其余四图按 zjcs-1.2.6 实际内容尺寸（tools/slg-maps 管线产出）。
export const SLG_CHUNK_SIZE = 16;
export const SLG_MAX_GUARD_POWER = 99;
export const SLG_MAX_GUARD = SLG_MAX_GUARD_POWER;
export const SLG_MAX_QUERY_CHUNKS = 4;
export const SLG_LOD_SCALE_THRESHOLDS: readonly number[] = [0.28, 0.5, 0.85];
/** LOD 滞回带（相对比例）：越过「更细档下界 × (1+r)」才升细，跌破「当前档下界 × (1−r)」才降粗。 */
export const SLG_LOD_HYSTERESIS_RATIO = 0.08;
/** tileId 打包：mapIndex×2^22 + y×2048 + x（每轴 11bit，地图 4bit；INT UNSIGNED 列宽兼容）。 */
export const SLG_TILE_ID_STRIDE = 2048;
export const SLG_TILE_MAP_SHIFT = 22;
/** 单图任一边长上限（tileId 11bit/轴）；catalog 登记的每图 width/height 均须 ≤ 此值。 */
export const SLG_MAP_DIM_MAX = SLG_TILE_ID_STRIDE;
/** 地形 regions 上限（羽之国直读 GroundType 5908 条实测，留余量）。 */
export const SLG_TERRAIN_MAX_REGIONS = 8192;

/** 五国地图目录。尺寸与 tools/slg-maps 管线产出（terrain.json）一一对应，validateSlgTerrain 对照校验。 */
export interface ISlgMapInfo {
    readonly id: string;
    readonly name: string;
    readonly classId: number;
    readonly width: number;
    readonly height: number;
}
export const SLG_MAPS: readonly ISlgMapInfo[] = [
    { id: "senzhiguo", name: "森之国", classId: 11, width: 1500, height: 1500 },
    { id: "shanzhiguo", name: "山之国", classId: 12, width: 1148, height: 983 },
    { id: "zezhiguo", name: "泽之国", classId: 13, width: 1044, height: 1080 },
    { id: "jingbeidao", name: "鲸背岛", classId: 16, width: 940, height: 850 },
    { id: "yuzhiguo", name: "羽之国", classId: 17, width: 1325, height: 1166 },
];
export const SLG_DEFAULT_MAP_ID = "senzhiguo";
export function slgMapIndex(mapId: string): number {
    const index = SLG_MAPS.findIndex((m) => m.id === mapId);
    if (index < 0) throw new RangeError("SLG map unknown");
    return index;
}
export function slgMapInfo(mapId: string): ISlgMapInfo {
    return SLG_MAPS[slgMapIndex(mapId)];
}
export function isSlgMapId(value: unknown): value is string {
    return typeof value === "string" && SLG_MAPS.some((m) => m.id === value);
}
export function validateSlgMapId(value: unknown, path = "payload.mapId"): string {
    if (!isSlgMapId(value)) throw new WireValidationError("SLG_MAP", path);
    return value;
}

export interface ISlgPoint { readonly x: number; readonly y: number }
/** 两轴均含端点；chunk 与 grid 的矩形共用形状，API 名称区分单位。 */
export interface ISlgChunkRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
export interface ISlgTile { readonly tileId: number; readonly ownerUid: string; readonly guardPower: number }
export type SlgTileOutcome = "captured" | "reinforced" | "damaged";

export function tileIdFromGrid(mapIndex: number, x: number, y: number): number {
    if (!Number.isInteger(mapIndex) || mapIndex < 0 || mapIndex >= SLG_MAPS.length
        || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0
        || x >= SLG_TILE_ID_STRIDE || y >= SLG_TILE_ID_STRIDE) {
        throw new RangeError("SLG grid outside map");
    }
    return mapIndex * 2 ** SLG_TILE_MAP_SHIFT + y * SLG_TILE_ID_STRIDE + x;
}
export function isSlgTileId(value: unknown): value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return false;
    return Math.floor(value / 2 ** SLG_TILE_MAP_SHIFT) < SLG_MAPS.length;
}
export function validateSlgTileId(value: unknown, path = "payload.tileId"): number {
    if (!isSlgTileId(value)) throw new WireValidationError("SLG_TILE", path);
    return value;
}
export interface ISlgGridPoint extends ISlgPoint { readonly mapIndex: number }
export function gridFromTileId(tileId: number): ISlgGridPoint {
    validateSlgTileId(tileId);
    return {
        mapIndex: Math.floor(tileId / 2 ** SLG_TILE_MAP_SHIFT),
        y: Math.floor(tileId / SLG_TILE_ID_STRIDE) % SLG_TILE_ID_STRIDE,
        x: tileId % SLG_TILE_ID_STRIDE,
    };
}
export const tileIdToCoord = gridFromTileId;
/** chunk 坐标的合法上界（任何图）：2048/16=128 chunk/维。图内边界用该图 width/height 另判。 */
const SLG_CHUNK_DIM_MAX = SLG_MAP_DIM_MAX / SLG_CHUNK_SIZE;
export function chunkKey(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0
        || x >= SLG_CHUNK_DIM_MAX || y >= SLG_CHUNK_DIM_MAX) {
        throw new RangeError("SLG chunk outside map");
    }
    return y * SLG_TILE_ID_STRIDE + x;
}
export function chunkRectArea(rect: ISlgChunkRect): number {
    return (rect.maxX - rect.minX + 1) * (rect.maxY - rect.minY + 1);
}
export function validateSlgChunkRect(value: unknown, path = "payload.rect", maxChunks = SLG_MAX_QUERY_CHUNKS): ISlgChunkRect {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["minX", "minY", "maxX", "maxY"], [], path);
    const rect = {
        minX: finiteInteger(r.minX, `${path}.minX`, 0, SLG_CHUNK_DIM_MAX - 1),
        minY: finiteInteger(r.minY, `${path}.minY`, 0, SLG_CHUNK_DIM_MAX - 1),
        maxX: finiteInteger(r.maxX, `${path}.maxX`, 0, SLG_CHUNK_DIM_MAX - 1),
        maxY: finiteInteger(r.maxY, `${path}.maxY`, 0, SLG_CHUNK_DIM_MAX - 1),
    };
    if (rect.minX > rect.maxX || rect.minY > rect.maxY || chunkRectArea(rect) > maxChunks) {
        throw new WireValidationError("SLG_CHUNK_RECT", path);
    }
    return rect;
}
export function chunkRectForGridRect(rect: ISlgChunkRect, mapW: number, mapH: number): ISlgChunkRect {
    return {
        minX: Math.floor(Math.max(0, Math.min(mapW - 1, rect.minX)) / SLG_CHUNK_SIZE),
        minY: Math.floor(Math.max(0, Math.min(mapH - 1, rect.minY)) / SLG_CHUNK_SIZE),
        maxX: Math.floor(Math.max(0, Math.min(mapW - 1, rect.maxX)) / SLG_CHUNK_SIZE),
        maxY: Math.floor(Math.max(0, Math.min(mapH - 1, rect.maxY)) / SLG_CHUNK_SIZE),
    };
}
export function gridRectForChunkRect(rect: ISlgChunkRect, mapW: number, mapH: number): ISlgChunkRect {
    return {
        minX: rect.minX * SLG_CHUNK_SIZE, minY: rect.minY * SLG_CHUNK_SIZE,
        maxX: Math.min(mapW - 1, (rect.maxX + 1) * SLG_CHUNK_SIZE - 1),
        maxY: Math.min(mapH - 1, (rect.maxY + 1) * SLG_CHUNK_SIZE - 1),
    };
}
export function slgLodForScale(scale: number): number {
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("SLG scale must be positive");
    if (scale >= SLG_LOD_SCALE_THRESHOLDS[2]) return 0;
    if (scale >= SLG_LOD_SCALE_THRESHOLDS[1]) return 1;
    if (scale >= SLG_LOD_SCALE_THRESHOLDS[0]) return 2;
    return 3;
}
/**
 * 滞回分档：以上一档 prevLod 为基准，scale 必须明确越过更细档下界（×1+r）才升细、明确跌破当前档
 * 下界（×1−r）才降粗——阈值附近往复缩放不再让图层反复闪现。跨多档的大幅缩放一次循环到位。
 */
export function slgLodForScaleStable(prevLod: number, scale: number): number {
    if (!Number.isInteger(prevLod) || prevLod < 0 || prevLod > 3) throw new RangeError("SLG prev LOD invalid");
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("SLG scale must be positive");
    let lod = prevLod;
    // 档 L（L<3）的下界 = THRESHOLDS[2-L]；lod 3 无下界。
    while (lod > 0 && scale >= SLG_LOD_SCALE_THRESHOLDS[2 - (lod - 1)] * (1 + SLG_LOD_HYSTERESIS_RATIO)) lod -= 1;
    while (lod < 3 && scale < SLG_LOD_SCALE_THRESHOLDS[2 - lod] * (1 - SLG_LOD_HYSTERESIS_RATIO)) lod += 1;
    return lod;
}
export function validateSlgTile(value: unknown, path = "tile"): ISlgTile {
    const r = requireRecord(value, path);
    assertExactKeys(r, ["tileId", "ownerUid", "guardPower"], [], path);
    const tile = {
        tileId: validateSlgTileId(r.tileId, `${path}.tileId`),
        ownerUid: boundedString(r.ownerUid, `${path}.ownerUid`, 0, 32),
        guardPower: finiteInteger(r.guardPower, `${path}.guardPower`, 0, SLG_MAX_GUARD_POWER),
    };
    if ((tile.ownerUid === "") !== (tile.guardPower === 0)) throw new WireValidationError("SLG_TILE_OWNER", path);
    return tile;
}
export function canCaptureTile(tile: ISlgTile, uid: string): boolean {
    return tile.ownerUid === "" || tile.ownerUid === uid || tile.guardPower <= 1;
}
/** 即时操作与到达共用；扣到零的当次即改主，不留下中性守备行。 */
export function applySlgTileAction(tile: ISlgTile, uid: string): { tile: ISlgTile; outcome: SlgTileOutcome } {
    if (!uid || uid.length > 32) throw new RangeError("SLG uid invalid");
    if (tile.ownerUid === uid) return {
        tile: { ...tile, guardPower: Math.min(SLG_MAX_GUARD_POWER, tile.guardPower + 1) }, outcome: "reinforced",
    };
    if (tile.ownerUid !== "" && tile.guardPower > 1) return {
        tile: { ...tile, guardPower: tile.guardPower - 1 }, outcome: "damaged",
    };
    return { tile: { tileId: tile.tileId, ownerUid: uid, guardPower: 1 }, outcome: "captured" };
}

export interface ISlgTerrainColor { readonly id: number; readonly color: readonly [number, number, number] }
/** 岛区矩形（远档烘图覆盖范围，世界格坐标，含端点）。 */
export interface ISlgIslandRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
export interface ISlgTerrain {
    readonly id: string;
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly islandRect: ISlgIslandRect;
    readonly palette: readonly ISlgTerrainColor[];
    readonly regions: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly terrain: number }[];
}
/** 冻结内容包的 fail-closed 形状闸；id/尺寸对照 SLG_MAPS catalog；无地形速度/阻挡语义。 */
export function validateSlgTerrain(input: unknown): input is ISlgTerrain {
    try {
        const r = requireRecord(input, "terrain");
        assertExactKeys(r, ["id", "name", "width", "height", "islandRect", "palette", "regions"], [], "terrain");
        const mapId = boundedString(r.id, "terrain.id", 1, 64);
        boundedString(r.name, "terrain.name", 1, 100);
        const info = SLG_MAPS.find((m) => m.id === mapId);
        if (!info || r.width !== info.width || r.height !== info.height || !Array.isArray(r.palette)
            || r.palette.length === 0 || r.palette.length > 16 || !Array.isArray(r.regions)
            || r.regions.length === 0 || r.regions.length > SLG_TERRAIN_MAX_REGIONS) return false;
        const island = requireRecord(r.islandRect, "terrain.islandRect");
        assertExactKeys(island, ["minX", "minY", "maxX", "maxY"], [], "terrain.islandRect");
        const ix0 = finiteInteger(island.minX, "terrain.islandRect.minX", 0, info.width - 1);
        const iy0 = finiteInteger(island.minY, "terrain.islandRect.minY", 0, info.height - 1);
        const ix1 = finiteInteger(island.maxX, "terrain.islandRect.maxX", 0, info.width - 1);
        const iy1 = finiteInteger(island.maxY, "terrain.islandRect.maxY", 0, info.height - 1);
        if (ix0 > ix1 || iy0 > iy1) return false;
        const ids = new Set<number>();
        for (const p of r.palette) {
            const v = requireRecord(p, "terrain.palette");
            assertExactKeys(v, ["id", "color"], [], "terrain.palette");
            const id = finiteInteger(v.id, "terrain.palette.id", 0, 15);
            if (ids.has(id) || !Array.isArray(v.color) || v.color.length !== 3) return false;
            for (const c of v.color) finiteInteger(c, "terrain.palette.color", 0, 255);
            ids.add(id);
        }
        if (!ids.has(0)) return false;
        for (const region of r.regions) {
            const v = requireRecord(region, "terrain.region");
            assertExactKeys(v, ["x", "y", "width", "height", "terrain"], [], "terrain.region");
            const x = finiteInteger(v.x, "terrain.region.x", 0, info.width - 1);
            const y = finiteInteger(v.y, "terrain.region.y", 0, info.height - 1);
            const w = finiteInteger(v.width, "terrain.region.width", 1, info.width);
            const h = finiteInteger(v.height, "terrain.region.height", 1, info.height);
            if (x + w > info.width || y + h > info.height || !ids.has(finiteInteger(v.terrain, "terrain.region.terrain", 0, 15))) return false;
        }
        return true;
    } catch { return false; }
}
export function terrainAt(data: ISlgTerrain, x: number, y: number): ISlgTerrainColor {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= data.width || y >= data.height) {
        throw new RangeError("SLG grid outside map");
    }
    let id = 0;
    for (const region of data.regions) {
        if (x >= region.x && y >= region.y && x < region.x + region.width && y < region.y + region.height) id = region.terrain;
    }
    const result = data.palette.find((entry) => entry.id === id);
    if (!result) throw new RangeError("SLG terrain palette missing");
    return result;
}
