/** SLG 瓦片地表几何：按原版 TileChunkData/Ground 层的「格→瓦片」表逐格铺设（渲染图切块路线的替代）。
 *  与原版同构：同纹理瓦片全图复用，文件 = tileset 图集单页 + tiles.json 引用表。 */
import { SLG_CHUNK_SIZE, SLG_TILE_ID_STRIDE, chunkKey, slgMapIndex, tileIdFromGrid, type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
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

/** 瓦片 quad 的世界矩形与图集 UV（per-chunk 与合并层两个构建器共用的摆放数学，勿漂移）。 */
function tileQuadRect(data: SlgTilesData, layer: SlgTileLayer, meta: SlgTileMeta, wx: number, wy: number):
    { left: number; bottom: number; right: number; top: number; u0: number; v0: number; u1: number; v1: number } {
    // 瓦片世界尺寸 = w/ppu 渲染格 ×48px×scale（原版 1 格 = scale 世界格），pivot 对齐格中心。
    const grid = SLG_GRID_PIXELS * data.scale;
    const w = meta.w / meta.ppu * grid;
    const h = meta.h / meta.ppu * grid;
    // 锚点 = 格 + anchor×scale（原版 m_TileAnchor 语义）；pivot 自底向底。
    const axp = (wx + (layer.ax ?? 0) * data.scale) * SLG_GRID_PIXELS;
    const ayp = (wy + (layer.ay ?? 0) * data.scale) * SLG_GRID_PIXELS;
    const left = axp - w * meta.pivotX, right = left + w;
    const bottom = ayp - h * meta.pivotY, top = bottom + h;
    const cols = data.atlasCols;
    const inset = 0.5 / (cols * data.cellPx);
    const col = meta.cell % cols, row = Math.floor(meta.cell / cols);
    const u0 = (col + (meta.u0 ?? 0)) / cols + inset;
    const u1 = (col + (meta.u1 ?? 1)) / cols - inset;
    // v 轴与 far 层同约定：v=0 = PNG 顶（island 远档实证），quad 顶边采内容子矩形顶。
    const v0 = (row + (meta.v0 ?? 0)) / cols + inset;
    const v1 = (row + (meta.v1 ?? 1)) / cols - inset;
    return { left, bottom, right, top, u0, v0, u1, v1 };
}

/** 稀疏归属 overlay 几何（与 terrainMesh 同款：有主格整格 quad，我方蓝/敌方红 alpha 0.40）。 */
export function buildSlgOwnershipMesh(terrain: ISlgTerrain, cx: number, cy: number,
    tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, alpha = 1): SlgMeshGeometry | null {
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("SLG tilemap alpha invalid");
    const startX = cx * SLG_CHUNK_SIZE, startY = cy * SLG_CHUNK_SIZE;
    const width = Math.min(SLG_CHUNK_SIZE, terrain.width - startX);
    const height = Math.min(SLG_CHUNK_SIZE, terrain.height - startY);
    const bounds = { minX: startX * SLG_GRID_PIXELS, minY: startY * SLG_GRID_PIXELS,
        maxX: (startX + SLG_CHUNK_SIZE) * SLG_GRID_PIXELS, maxY: (startY + SLG_CHUNK_SIZE) * SLG_GRID_PIXELS };
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
    return ownerCount === 0 ? null : {
        positions: ownerPositions.subarray(0, ownerCount * 12),
        colors: ownerColors.subarray(0, ownerCount * 16),
        indices16: ownerIndices.subarray(0, ownerCount * 6), ...bounds,
    };
}

/** 可见 chunk 集合上的「每层一张合并瓦片网格」（与原版单 Tilemap 同构：跨 chunk 按层内 y 降 x 升全局绘制序，
 *  高/宽瓦片（树/崖沿 2-3 格）与相邻 chunk 的交叠按基格 y 正确互叠——per-chunk 网格做不到这一点）。
 *  keys = 可见 chunkKey 集合；alphaOf = chunk 淡出 alpha（顶点色，默认值恒 1）。 */
export interface SlgTileLayerMesh { readonly layer: SlgTileLayer; readonly geometry: SlgGroundMeshGeometry; readonly quadCount: number }
/** Uint16 索引上限：65535 顶点 / 4 顶点每 quad。可见集由视口限定，正常远低于此（超限即视口 bug，红比糊好）。 */
const SLG_LAYER_QUAD_LIMIT = 16383;

export function buildSlgTileLayerMeshes(data: SlgTilesData,
    tileIndex: ReadonlyMap<number, readonly SlgChunkTileBucket[]>, keys: readonly number[], lod: number,
    alphaOf: (key: number) => number = () => 1): SlgTileLayerMesh[] {
    if (!Number.isInteger(lod) || lod < 0 || lod > 3) throw new RangeError("SLG tilemap LOD invalid");
    const ordered = [...keys].sort((a, b) => a - b);
    if (ordered.length === 0) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const key of ordered) {
        const cx = key % SLG_TILE_ID_STRIDE, cy = Math.floor(key / SLG_TILE_ID_STRIDE);
        minX = Math.min(minX, cx * SLG_CHUNK_SIZE * SLG_GRID_PIXELS);
        minY = Math.min(minY, cy * SLG_CHUNK_SIZE * SLG_GRID_PIXELS);
        maxX = Math.max(maxX, (cx + 1) * SLG_CHUNK_SIZE * SLG_GRID_PIXELS);
        maxY = Math.max(maxY, (cy + 1) * SLG_CHUNK_SIZE * SLG_GRID_PIXELS);
    }
    const bounds = { minX, minY, maxX, maxY };
    const out: SlgTileLayerMesh[] = [];
    // 层顺序 = data.layers（管线已按原版 seq 排序；同 seq 保持出现序），节点序即绘制序。
    for (const layer of data.layers) {
        if (lod >= 3 && !LOD3_LAYERS.has(layer.name)) continue;
        let count = 0;
        for (const key of ordered) {
            const bucket = tileIndex.get(key)?.find((entry) => entry.layer === layer);
            count += bucket?.cells.length ?? 0;
        }
        if (count === 0) continue;
        if (count > SLG_LAYER_QUAD_LIMIT) throw new RangeError(`SLG tile layer ${layer.name} quads ${count} exceed Uint16`);
        const merged: [number, number, number, number][] = [];
        for (const key of ordered) {
            const bucket = tileIndex.get(key)?.find((entry) => entry.layer === layer);
            if (!bucket) continue;
            for (const [wx, wy, idx] of bucket.cells) merged.push([wx, wy, idx, key]);
        }
        // 层内全局绘制序：y 降 x 升（稳定排序，同位格保留原版出现序）。
        merged.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
        const positions = new Float32Array(count * 12);
        const uvs = new Float32Array(count * 8);
        const colors = new Float32Array(count * 16).fill(1);
        const indices = new Uint16Array(count * 6);
        let quad = 0;
        for (const [wx, wy, idx, key] of merged) {
            const meta = data.tiles[idx];
            if (!meta) continue;
            const r = tileQuadRect(data, layer, meta, wx, wy);
            writeQuad(positions, uvs, colors, indices, quad, r.left, r.bottom, r.right, r.top, r.u0, r.v0, r.u1, r.v1, alphaOf(key));
            quad += 1;
        }
        const geometry: SlgGroundMeshGeometry = {
            positions: positions.subarray(0, quad * 12), uvs: uvs.subarray(0, quad * 8),
            colors: colors.subarray(0, quad * 16),
            indices16: indices.subarray(0, quad * 6) as Uint16Array, ...bounds,
        };
        out.push({ layer, geometry, quadCount: quad });
    }
    return out;
}

/**
 * chunk 瓦片网格：层序（管线已按原版 sortLayer/Order 排好）逐格摆 quad（保留给单 chunk 消费方与测试；
 * 渲染器用 buildSlgTileLayerMeshes 合并层网格拿跨 chunk 全局绘制序）。
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
    const ownership = buildSlgOwnershipMesh(terrain, cx, cy, tiles, selfUid, alpha);
    const startX = cx * SLG_CHUNK_SIZE, startY = cy * SLG_CHUNK_SIZE;
    const bounds = { minX: startX * SLG_GRID_PIXELS, minY: startY * SLG_GRID_PIXELS,
        maxX: (startX + SLG_CHUNK_SIZE) * SLG_GRID_PIXELS, maxY: (startY + SLG_CHUNK_SIZE) * SLG_GRID_PIXELS };
    if (quadCount === 0) {
        return { ground: null, ownership, quadCapacity: 0 };
    }
    const positions = new Float32Array(quadCount * 12);
    const uvs = new Float32Array(quadCount * 8);
    const colors = new Float32Array(quadCount * 16).fill(1);
    const indices = new Uint16Array(quadCount * 6);
    let quad = 0;
    for (const bucket of visible) {
        for (const [wx, wy, tileIdx] of bucket.cells) {
            const meta = data.tiles[tileIdx];
            if (!meta) continue;
            const r = tileQuadRect(data, bucket.layer, meta, wx, wy);
            writeQuad(positions, uvs, colors, indices, quad, r.left, r.bottom, r.right, r.top, r.u0, r.v0, r.u1, r.v1, alpha);
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
