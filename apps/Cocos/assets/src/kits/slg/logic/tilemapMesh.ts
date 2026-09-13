/** SLG 瓦片地表几何：按原版 TileChunkData/Ground 层的「格→瓦片」表逐格铺设（渲染图切块路线的替代）。
 *  与原版同构：同纹理瓦片全图复用，文件 = tileset 图集单页 + tiles.json 引用表。 */
import { SLG_CHUNK_SIZE, chunkKey, slgMapIndex, tileIdFromGrid, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_GRID_PIXELS } from "./mapCamera";
import { SLG_OTHER_TILE_COLOR, SLG_SELF_TILE_COLOR, type SlgGroundMeshGeometry, type SlgMeshGeometry } from "./terrainMesh";

/** tiles.json 结构（tools/slg-maps/extract-tileset.py 产出）。 */
export interface SlgTileMeta {
    readonly atlas: number; readonly cell: number;
    readonly w: number; readonly h: number; readonly ppu: number;
    readonly pivotX: number; readonly pivotY: number;
    /** 内容在图集格内的子矩形（0..1，缺省整格）；等比放大装满图集格后非正方瓦片两侧留白。 */
    readonly u0?: number; readonly v0?: number; readonly u1?: number; readonly v1?: number;
}
export interface SlgTileLayer {
    readonly name: string; readonly seq: number;
    /** 宿主 Tilemap 的 m_TileAnchor（渲染格单位）：Unity 把 sprite pivot 钉在 (格+anchor) 处（PartitionLoader.cs:605）。 */
    readonly ax?: number; readonly ay?: number;
    readonly cells: readonly (readonly [number, number, number])[];
}
export interface SlgTilesData {
    readonly id: string; readonly tile: number;
    /** 原版渲染格 → 本 kit 世界格的放大倍数（原版 1 格 = scale×scale 世界格；瓦片世界尺寸按它放大）。 */
    readonly scale: number;
    readonly atlasCols: number; readonly cellPx: number;
    readonly atlas: readonly string[]; readonly layers: readonly SlgTileLayer[]; readonly tiles: readonly SlgTileMeta[];
}

export interface SlgTilemapMeshes {
    readonly ground: SlgGroundMeshGeometry | null;
    readonly ownership: SlgMeshGeometry | null;
    readonly quadCapacity: number;
}

/** 远档（LOD 3）减层：只保留主层（地表+树阵+地表装饰），投影/崖沿/贴花精细层不画。 */
const LOD3_LAYERS: ReadonlySet<string> = new Set(["Ground", "Object", "Dense_Object", "Dense_Object01", "UnderObject", "UnderObject01", "Ground_Above"]);

function writeQuad(positions: Float32Array, uvs: Float32Array, colors: Float32Array, indices: Uint16Array | Uint32Array,
    quad: number, left: number, bottom: number, right: number, top: number,
    u0: number, v0: number, u1: number, v1: number, alpha: number): void {
    positions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], quad * 12);
    uvs.set([u0, v0, u1, v0, u0, v1, u1, v1], quad * 8);
    for (let vertex = 0; vertex < 4; vertex += 1) colors.set([1, 1, 1, alpha], quad * 16 + vertex * 4);
    const v = quad * 4;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], quad * 6);
}

/** chunk 内格分桶索引（按层序排列的层 × 该 chunk 的格）。 */
export interface SlgChunkTileBucket { readonly layer: SlgTileLayer; readonly cells: readonly (readonly [number, number, number])[] }
export function buildSlgTileIndex(data: SlgTilesData): ReadonlyMap<number, readonly SlgChunkTileBucket[]> {
    const buckets = new Map<number, { layer: SlgTileLayer; cells: [number, number, number][] }[]>();
    for (const layer of data.layers) {
        for (const [wx, wy, idx] of layer.cells) {
            const key = chunkKey(Math.floor(wx / SLG_CHUNK_SIZE), Math.floor(wy / SLG_CHUNK_SIZE));
            let list = buckets.get(key);
            if (!list) { list = []; buckets.set(key, list); }
            let bucket = list.find((entry) => entry.layer === layer);
            if (!bucket) { bucket = { layer, cells: [] }; list.push(bucket); }
            bucket.cells.push([wx, wy, idx]);
        }
    }
    return buckets;
}

/**
 * chunk 瓦片网格：层序（管线已按原版 sortLayer/Order 排好）逐格摆 quad，
 * 瓦片世界尺寸 = w/ppu 渲染格 ×48px×scale（原版 1 格 = scale 世界格），pivot 对齐格中心（与 draw_tile_chunks 同规则）。
 * quad 上限钉死：16×16 格 × 层数超 65535 顶点时换 Uint32（MeshUtils 支持）。
 */
export function buildSlgTilemapMeshes(terrain: ISlgTerrain, data: SlgTilesData,
    tileIndex: ReadonlyMap<number, readonly SlgChunkTileBucket[]>, cx: number, cy: number, lod: number,
    tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, alpha = 1): SlgTilemapMeshes {
    chunkKey(cx, cy);
    if (!Number.isInteger(lod) || lod < 0 || lod > 3) throw new RangeError("SLG tilemap LOD invalid");
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("SLG tilemap alpha invalid");
    const buckets = tileIndex.get(chunkKey(cx, cy)) ?? [];
    const visible = buckets.filter((b) => lod < 3 || LOD3_LAYERS.has(b.layer.name));

    const quadCount = visible.reduce((n, b) => n + b.cells.length, 0);
    const startX = cx * SLG_CHUNK_SIZE, startY = cy * SLG_CHUNK_SIZE;
    const width = Math.min(SLG_CHUNK_SIZE, terrain.width - startX);
    const height = Math.min(SLG_CHUNK_SIZE, terrain.height - startY);
    const bounds = { minX: startX * SLG_GRID_PIXELS, minY: startY * SLG_GRID_PIXELS,
        maxX: (startX + SLG_CHUNK_SIZE) * SLG_GRID_PIXELS, maxY: (startY + SLG_CHUNK_SIZE) * SLG_GRID_PIXELS };
    // 归属 overlay（与 terrainMesh 同款：稀疏有主格整格 quad，我方蓝/敌方红 alpha 0.40）
    const mapIndex = slgMapIndex(terrain.id);
    const ownerCapacity = width * height;
    const ownerPositions = new Float32Array(ownerCapacity * 12);
    const ownerColors = new Float32Array(ownerCapacity * 16);
    const ownerIndices = new Uint16Array(ownerCapacity * 6);
    let ownerCount = 0;
    for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) {
        const x = startX + dx, y = startY + dy;
        const tile = tiles.get(tileIdFromGrid(mapIndex, x, y));
        if (!tile?.ownerUid) continue;
        const left = x * SLG_GRID_PIXELS, bottom = y * SLG_GRID_PIXELS;
        const right = (x + 1) * SLG_GRID_PIXELS, top = (y + 1) * SLG_GRID_PIXELS;
        ownerPositions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], ownerCount * 12);
        const base = tile.ownerUid === selfUid ? SLG_SELF_TILE_COLOR : SLG_OTHER_TILE_COLOR;
        const color = alpha === 1 ? base : [base[0], base[1], base[2], base[3] * alpha];
        for (let vertex = 0; vertex < 4; vertex += 1) ownerColors.set(color, ownerCount * 16 + vertex * 4);
        const v = ownerCount * 4;
        ownerIndices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], ownerCount * 6);
        ownerCount += 1;
    }
    const ownership: SlgMeshGeometry | null = ownerCount === 0 ? null : {
        positions: ownerPositions.subarray(0, ownerCount * 12),
        colors: ownerColors.subarray(0, ownerCount * 16),
        indices16: ownerIndices.subarray(0, ownerCount * 6), ...bounds,
    };
    if (quadCount === 0) {
        return { ground: null, ownership, quadCapacity: 0 };
    }
    const positions = new Float32Array(quadCount * 12);
    const uvs = new Float32Array(quadCount * 8);
    const colors = new Float32Array(quadCount * 16).fill(1);
    const indices = new Uint16Array(quadCount * 6);
    const cols = data.atlasCols, cell = data.cellPx;
    const grid = SLG_GRID_PIXELS * data.scale;  // 一渲染格的世界像素边长
    const insetU = 0.5 / (cols * cell), insetV = insetU;
    let quad = 0;
    for (const bucket of visible) {
        // 锚点 = 格 + anchor×scale（原版 m_TileAnchor 语义）；pivot 自底向底。
        const anchorDx = (bucket.layer.ax ?? 0) * data.scale;
        const anchorDy = (bucket.layer.ay ?? 0) * data.scale;
        for (const [wx, wy, tileIdx] of bucket.cells) {
            const meta = data.tiles[tileIdx];
            if (!meta) continue;
            const w = meta.w / meta.ppu * grid;
            const h = meta.h / meta.ppu * grid;
            const axp = (wx + anchorDx) * SLG_GRID_PIXELS;
            const ayp = (wy + anchorDy) * SLG_GRID_PIXELS;
            const left = axp - w * meta.pivotX, right = left + w;
            const bottom = ayp - h * meta.pivotY, top = bottom + h;
            const col = meta.cell % cols, row = Math.floor(meta.cell / cols);
            const u0 = (col + (meta.u0 ?? 0)) / cols + insetU;
            const u1 = (col + (meta.u1 ?? 1)) / cols - insetU;
            // v 轴与 far 层同约定：v=0 = PNG 顶（island 远档实证），quad 顶边采内容子矩形顶。
            const v0 = (row + (meta.v0 ?? 0)) / cols + insetV;
            const v1 = (row + (meta.v1 ?? 1)) / cols - insetV;
            writeQuad(positions, uvs, colors, indices, quad, left, bottom, right, top, u0, v0, u1, v1, alpha);
            quad += 1;
        }
    }
    const ground: SlgGroundMeshGeometry = {
        positions: positions.subarray(0, quad * 12), uvs: uvs.subarray(0, quad * 8),
        colors: colors.subarray(0, quad * 16),
        indices16: indices.subarray(0, quad * 6) as Uint16Array, ...bounds,
    };
    return { ground, ownership, quadCapacity: quad };
}
