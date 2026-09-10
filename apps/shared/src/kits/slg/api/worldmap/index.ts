/** SLG worldmap v1：坐标、分块、LOD 与守备规则的零依赖单源。 */
import { assertExactKeys, boundedString, finiteInteger, WireValidationError } from "../../../../protocol/http";
import { rpcRecord as requireRecord } from "../../../../protocol/lobbyRpc/primitives";

// 1500×1500 沿用《三国志·战略版》标准图格数（zlbAllVersion code/script/config/config_3d.lua:11
// 的 MAP_WIDTH/MAP_HEIGHT=1500）；正方形格。
export const SLG_MAP_W = 1500;
export const SLG_MAP_H = 1500;
export const SLG_CHUNK_SIZE = 16;
export const SLG_MAX_GUARD_POWER = 99;
export const SLG_MAX_GUARD = SLG_MAX_GUARD_POWER;
export const SLG_MAX_QUERY_CHUNKS = 4;
export const SLG_LOD_SCALE_THRESHOLDS: readonly number[] = [0.28, 0.5, 0.85];
/** LOD 滞回带（相对比例）：越过「更细档下界 × (1+r)」才升细，跌破「当前档下界 × (1−r)」才降粗。 */
export const SLG_LOD_HYSTERESIS_RATIO = 0.08;
export const SLG_TILE_ID_STRIDE = 65536;

export interface ISlgPoint { readonly x: number; readonly y: number }
/** 两轴均含端点；chunk 与 grid 的矩形共用形状，API 名称区分单位。 */
export interface ISlgChunkRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
export interface ISlgTile { readonly tileId: number; readonly ownerUid: string; readonly guardPower: number }
export type SlgTileOutcome = "captured" | "reinforced" | "damaged";

export function tileIdFromGrid(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SLG_MAP_W || y >= SLG_MAP_H) {
        throw new RangeError("SLG grid outside map");
    }
    return y * SLG_TILE_ID_STRIDE + x;
}
export function isSlgTileId(value: unknown): value is number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return false;
    return value % SLG_TILE_ID_STRIDE < SLG_MAP_W && Math.floor(value / SLG_TILE_ID_STRIDE) < SLG_MAP_H;
}
export function validateSlgTileId(value: unknown, path = "payload.tileId"): number {
    if (!isSlgTileId(value)) throw new WireValidationError("SLG_TILE", path);
    return value;
}
export function gridFromTileId(tileId: number): ISlgPoint {
    validateSlgTileId(tileId);
    return { x: tileId % SLG_TILE_ID_STRIDE, y: Math.floor(tileId / SLG_TILE_ID_STRIDE) };
}
export const tileIdToCoord = gridFromTileId;
export function chunkKey(x: number, y: number): number {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0
        || x >= Math.ceil(SLG_MAP_W / SLG_CHUNK_SIZE) || y >= Math.ceil(SLG_MAP_H / SLG_CHUNK_SIZE)) {
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
        minX: finiteInteger(r.minX, `${path}.minX`, 0, Math.ceil(SLG_MAP_W / SLG_CHUNK_SIZE) - 1),
        minY: finiteInteger(r.minY, `${path}.minY`, 0, Math.ceil(SLG_MAP_H / SLG_CHUNK_SIZE) - 1),
        maxX: finiteInteger(r.maxX, `${path}.maxX`, 0, Math.ceil(SLG_MAP_W / SLG_CHUNK_SIZE) - 1),
        maxY: finiteInteger(r.maxY, `${path}.maxY`, 0, Math.ceil(SLG_MAP_H / SLG_CHUNK_SIZE) - 1),
    };
    if (rect.minX > rect.maxX || rect.minY > rect.maxY || chunkRectArea(rect) > maxChunks) {
        throw new WireValidationError("SLG_CHUNK_RECT", path);
    }
    return rect;
}
export function chunkRectForGridRect(rect: ISlgChunkRect): ISlgChunkRect {
    return {
        minX: Math.floor(Math.max(0, Math.min(SLG_MAP_W - 1, rect.minX)) / SLG_CHUNK_SIZE),
        minY: Math.floor(Math.max(0, Math.min(SLG_MAP_H - 1, rect.minY)) / SLG_CHUNK_SIZE),
        maxX: Math.floor(Math.max(0, Math.min(SLG_MAP_W - 1, rect.maxX)) / SLG_CHUNK_SIZE),
        maxY: Math.floor(Math.max(0, Math.min(SLG_MAP_H - 1, rect.maxY)) / SLG_CHUNK_SIZE),
    };
}
export function gridRectForChunkRect(rect: ISlgChunkRect): ISlgChunkRect {
    return {
        minX: rect.minX * SLG_CHUNK_SIZE, minY: rect.minY * SLG_CHUNK_SIZE,
        maxX: Math.min(SLG_MAP_W - 1, (rect.maxX + 1) * SLG_CHUNK_SIZE - 1),
        maxY: Math.min(SLG_MAP_H - 1, (rect.maxY + 1) * SLG_CHUNK_SIZE - 1),
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
export interface ISlgTerrain {
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly palette: readonly ISlgTerrainColor[];
    readonly regions: readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly terrain: number }[];
}
/** 冻结内容包的 fail-closed 形状闸；无地形速度/阻挡语义。 */
export function validateSlgTerrain(input: unknown): input is ISlgTerrain {
    try {
        const r = requireRecord(input, "terrain");
        assertExactKeys(r, ["name", "width", "height", "palette", "regions"], [], "terrain");
        boundedString(r.name, "terrain.name", 1, 100);
        if (r.width !== SLG_MAP_W || r.height !== SLG_MAP_H || !Array.isArray(r.palette)
            || r.palette.length === 0 || r.palette.length > 16 || !Array.isArray(r.regions) || r.regions.length > 512) return false;
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
            const x = finiteInteger(v.x, "terrain.region.x", 0, SLG_MAP_W - 1);
            const y = finiteInteger(v.y, "terrain.region.y", 0, SLG_MAP_H - 1);
            const w = finiteInteger(v.width, "terrain.region.width", 1, SLG_MAP_W);
            const h = finiteInteger(v.height, "terrain.region.height", 1, SLG_MAP_H);
            if (x + w > SLG_MAP_W || y + h > SLG_MAP_H || !ids.has(finiteInteger(v.terrain, "terrain.region.terrain", 0, 15))) return false;
        }
        return true;
    } catch { return false; }
}
export function terrainAt(data: ISlgTerrain, x: number, y: number): ISlgTerrainColor {
    tileIdFromGrid(x, y);
    let id = 0;
    for (const region of data.regions) {
        if (x >= region.x && y >= region.y && x < region.x + region.width && y < region.y + region.height) id = region.terrain;
    }
    const result = data.palette.find((entry) => entry.id === id);
    if (!result) throw new RangeError("SLG terrain palette missing");
    return result;
}
