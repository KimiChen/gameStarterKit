/** 远档（LOD 3）整图层几何：静态区域色块 + 地标 + 稀疏归属，draw call 与缩放出图脱钩。 */
import { SLG_MAP_H, SLG_MAP_W, gridFromTileId, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { buildSlgOverviewRects, SLG_LANDMARKS, slgAtlasUv } from "./mapArt";
import { SLG_GRID_PIXELS } from "./mapCamera";
import { SLG_OTHER_TILE_COLOR, SLG_SELF_TILE_COLOR, type SlgGroundMeshGeometry, type SlgMeshGeometry } from "./terrainMesh";

/** 远档切换档：lod >= SLG_FAR_LOD 时整图层替代逐 chunk 网格（含调试强制档）。 */
export const SLG_FAR_LOD = 3;

const WORLD_BOUNDS = { minX: 0, minY: 0, maxX: SLG_MAP_W * SLG_GRID_PIXELS, maxY: SLG_MAP_H * SLG_GRID_PIXELS };

function assertAlpha(alpha: number): void {
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("SLG far layer alpha invalid");
}

function solidColors(count: number, alpha: number): Float32Array {
    const colors = new Float32Array(count * 16).fill(1);
    for (let channel = 3; channel < colors.length; channel += 4) colors[channel] = alpha;
    return colors;
}

function writeRect(positions: Float32Array, indices: Uint16Array, quad: number,
    left: number, bottom: number, right: number, top: number): void {
    positions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], quad * 12);
    const v = quad * 4;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], quad * 6);
}

/**
 * 静态地表：与总览同一份区域矩形（≤513 quads、不枚举格），按像素缩放成世界尺寸网格。
 * 矩形按 terrain.json 登记顺序叠加，与 terrainAt 的「后者覆盖前者」一致。
 */
export function buildSlgFarGround(terrain: ISlgTerrain, alpha = 1): SlgMeshGeometry {
    assertAlpha(alpha);
    const rects = buildSlgOverviewRects(terrain);
    const positions = new Float32Array(rects.length * 12);
    const indices16 = new Uint16Array(rects.length * 6);
    const colors = new Float32Array(rects.length * 16);
    rects.forEach((rect, quad) => {
        writeRect(positions, indices16, quad,
            rect.x * SLG_GRID_PIXELS, rect.y * SLG_GRID_PIXELS,
            (rect.x + rect.width) * SLG_GRID_PIXELS, (rect.y + rect.height) * SLG_GRID_PIXELS);
        for (let vertex = 0; vertex < 4; vertex += 1) {
            const offset = quad * 16 + vertex * 4;
            colors[offset] = rect.color[0] / 255;
            colors[offset + 1] = rect.color[1] / 255;
            colors[offset + 2] = rect.color[2] / 255;
            colors[offset + 3] = alpha;
        }
    });
    return { positions, colors, indices16, ...WORLD_BOUNDS };
}

/** 静态地标：全部 SLG_LANDMARKS 一张网格（远处仍保留的最后内容层），装饰图集 UV + 半像素内缩。 */
export function buildSlgFarLandmarks(atlasWidth: number, atlasHeight: number, alpha = 1): SlgGroundMeshGeometry {
    assertAlpha(alpha);
    if (!Number.isInteger(atlasWidth) || !Number.isInteger(atlasHeight) || atlasWidth <= 0 || atlasHeight <= 0) {
        throw new RangeError("SLG far landmarks atlas dimensions invalid");
    }
    const insetU = 0.5 / atlasWidth, insetV = 0.5 / atlasHeight;
    const sorted = [...SLG_LANDMARKS].sort((a, b) => b.y - a.y || a.x - b.x);
    const positions = new Float32Array(sorted.length * 12);
    const uvs = new Float32Array(sorted.length * 8);
    const indices16 = new Uint16Array(sorted.length * 6);
    sorted.forEach((landmark, quad) => {
        writeRect(positions, indices16, quad,
            (landmark.x - landmark.width / 2) * SLG_GRID_PIXELS, (landmark.y - landmark.height / 2) * SLG_GRID_PIXELS,
            (landmark.x + landmark.width / 2) * SLG_GRID_PIXELS, (landmark.y + landmark.height / 2) * SLG_GRID_PIXELS);
        const uv = slgAtlasUv(landmark.atlasIndex);
        uvs.set([uv.u0 + insetU, uv.v0 + insetV, uv.u1 - insetU, uv.v0 + insetV,
            uv.u0 + insetU, uv.v1 - insetV, uv.u1 - insetU, uv.v1 - insetV], quad * 8);
    });
    return { positions, uvs, colors: solidColors(sorted.length, alpha), indices16, ...WORLD_BOUNDS };
}

/**
 * 稀疏归属：tiles 里每个有主格一个整格 quad（近景 overlay 同款色），按 tileId 排序保证重建稳定。
 * 数据仍来自既有的逐 chunk mapTiles 管线——远档只换渲染形态，不改数据粒度。
 */
export function buildSlgFarOwnership(tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, alpha = 1): SlgMeshGeometry | null {
    assertAlpha(alpha);
    const owned = [...tiles.keys()].sort((a, b) => a - b);
    if (owned.length === 0) return null;
    const positions = new Float32Array(owned.length * 12);
    const indices16 = new Uint16Array(owned.length * 6);
    const colors = new Float32Array(owned.length * 16);
    owned.forEach((tileId, quad) => {
        const point = gridFromTileId(tileId);
        writeRect(positions, indices16, quad,
            point.x * SLG_GRID_PIXELS, point.y * SLG_GRID_PIXELS,
            (point.x + 1) * SLG_GRID_PIXELS, (point.y + 1) * SLG_GRID_PIXELS);
        const base = tiles.get(tileId)?.ownerUid === selfUid ? SLG_SELF_TILE_COLOR : SLG_OTHER_TILE_COLOR;
        for (let vertex = 0; vertex < 4; vertex += 1) {
            const offset = quad * 16 + vertex * 4;
            colors[offset] = base[0];
            colors[offset + 1] = base[1];
            colors[offset + 2] = base[2];
            colors[offset + 3] = base[3] * alpha;
        }
    });
    return { positions, colors, indices16, ...WORLD_BOUNDS };
}

/** 归属重建签名：稀疏数据版次（tiles 规模 + 各 chunk 版本和），远档每帧算一次成本可忽略。 */
export function slgFarOwnershipVersion(tiles: ReadonlyMap<number, ISlgTile>, chunkVersions: ReadonlyMap<number, number>): number {
    let signature = tiles.size;
    for (const version of chunkVersions.values()) signature = signature * 31 + version;
    return signature;
}
