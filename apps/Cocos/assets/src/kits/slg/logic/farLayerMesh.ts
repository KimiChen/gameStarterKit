/** 远档（LOD 3）整图层几何：静态区域色块 + 地标 + 稀疏归属，draw call 与缩放出图脱钩。 */
import { gridFromTileId, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { slgAtlasUv, type SlgLandmark } from "./mapArt";
import { SLG_GRID_PIXELS } from "./mapCamera";
import { SLG_OTHER_TILE_COLOR, SLG_SELF_TILE_COLOR, type SlgGroundMeshGeometry, type SlgMeshGeometry } from "./terrainMesh";

/** 远档切换档：lod >= SLG_FAR_LOD 时整图层替代逐 chunk 网格（含调试强制档）。 */
export const SLG_FAR_LOD = 3;

/** 世界像素边界（当前图尺寸 × 48px/格）。 */
function worldBounds(terrain: ISlgTerrain) {
    return { minX: 0, minY: 0, maxX: terrain.width * SLG_GRID_PIXELS, maxY: terrain.height * SLG_GRID_PIXELS };
}

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

export interface SlgFarGround { readonly sea: SlgMeshGeometry; readonly island: SlgGroundMeshGeometry }

/**
 * 远档地表 = 海面整幅平铺贴图（sea-tile，原版渲染水面含浪边）+ 原版纯地表烘图一张（island-ground）。
 * 有机细节由烘图承载；palette 矩形只用于玩法标签与测试，不再在远档逐块描边。
 * 烘图覆盖矩形 = terrain.islandRect（管线 classify-terrain 产出，与 island-ground.png 同帧）。
 */
export function buildSlgFarGround(terrain: ISlgTerrain, alpha = 1): SlgFarGround {
    assertAlpha(alpha);
    const bounds = worldBounds(terrain);
    // 海面 UV 平铺：sea-tile 512² 对应 16 世界格一张；v 与 island 同约定（北顶采小 v=图顶）
    const span = 16 * SLG_GRID_PIXELS;
    const positions = new Float32Array(12);
    const indices16 = new Uint16Array(6);
    writeRect(positions, indices16, 0, bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
    const u0 = bounds.minX / span, u1 = bounds.maxX / span;
    const vNorth = bounds.minY / span, vSouth = bounds.maxY / span;
    const uvs = new Float32Array([u0, vNorth, u1, vNorth, u0, vSouth, u1, vSouth]);
    const sea: SlgGroundMeshGeometry = { positions, uvs, colors: solidColors(1, alpha), indices16, ...bounds };
    const rect = terrain.islandRect;
    const left = rect.minX * SLG_GRID_PIXELS, bottom = rect.minY * SLG_GRID_PIXELS;
    const right = rect.maxX * SLG_GRID_PIXELS, top = rect.maxY * SLG_GRID_PIXELS;
    const islandPositions = new Float32Array(12);
    const islandIndices = new Uint16Array(6);
    writeRect(islandPositions, islandIndices, 0, left, bottom, right, top);
    // PNG 顶 = 世界北（本图 y 大）：底边采 v=1、顶边采 v=0
    const islandUvs = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);
    const island: SlgGroundMeshGeometry = { positions: islandPositions, uvs: islandUvs, colors: solidColors(1, alpha),
        indices16: islandIndices, minX: left, minY: bottom, maxX: right, maxY: top };
    return { sea, island };
}

/** 静态地标一张网格（远处仍保留的最后内容层），装饰图集 UV + 半像素内缩。地标数据驱动（layout.landmarks）。 */
export function buildSlgFarLandmarks(atlasWidth: number, atlasHeight: number, terrain: ISlgTerrain,
    landmarks: readonly SlgLandmark[], alpha = 1): SlgGroundMeshGeometry {
    assertAlpha(alpha);
    if (!Number.isInteger(atlasWidth) || !Number.isInteger(atlasHeight) || atlasWidth <= 0 || atlasHeight <= 0) {
        throw new RangeError("SLG far landmarks atlas dimensions invalid");
    }
    const bounds = worldBounds(terrain);
    const insetU = 0.5 / atlasWidth, insetV = 0.5 / atlasHeight;
    const sorted = [...landmarks].sort((a, b) => b.y - a.y || a.x - b.x);
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
    return { positions, uvs, colors: solidColors(sorted.length, alpha), indices16, ...bounds };
}

/**
 * 稀疏归属：tiles 里每个有主格一个整格 quad（近景 overlay 同款色），按 tileId 排序保证重建稳定。
 * 数据仍来自既有的逐 chunk mapTiles 管线——远档只换渲染形态，不改数据粒度。
 */
export function buildSlgFarOwnership(terrain: ISlgTerrain, tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, alpha = 1): SlgMeshGeometry | null {
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
    return { positions, colors, indices16, ...worldBounds(terrain) };
}

/** 归属重建签名：稀疏数据版次（tiles 规模 + 各 chunk 版本和），远档每帧算一次成本可忽略。 */
export function slgFarOwnershipVersion(tiles: ReadonlyMap<number, ISlgTile>, chunkVersions: ReadonlyMap<number, number>): number {
    let signature = tiles.size;
    for (const version of chunkVersions.values()) signature = signature * 31 + version;
    return signature;
}
