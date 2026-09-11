/** Bounded chunk geometry for separate textured ground and untextured ownership batches. */
import { SLG_CHUNK_SIZE, chunkKey, slgMapIndex, terrainAt, tileIdFromGrid,
    type ISlgTerrain, type ISlgTile } from "../../../shared/kits/slg/api/worldmap/index";
import { SLG_ART_ATLAS_COLUMNS, SLG_ART_ATLAS_ROWS, slgTerrainUv } from "./mapArt";
import { SLG_GRID_PIXELS } from "./mapCamera";
import { visibleMapLayers } from "./mapLayers";

export interface SlgMeshGeometry {
    readonly positions: Float32Array;
    readonly colors: Float32Array;
    readonly indices16: Uint16Array;
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}
export interface SlgGroundMeshGeometry extends SlgMeshGeometry { readonly uvs: Float32Array }
export interface SlgTerrainMeshes {
    readonly ground: SlgGroundMeshGeometry;
    readonly ownership: SlgMeshGeometry | null;
    /** Capacity for each dynamic mesh, independent of the currently owned tile count. */
    readonly quadCapacity: number;
}

const SELF_COLOR: readonly number[] = [65 / 255, 148 / 255, 236 / 255, 0.4];
const OTHER_COLOR: readonly number[] = [220 / 255, 91 / 255, 78 / 255, 0.4];
/** 归属叠加色（近景 overlay 与远档整图层共用，⛔ 不另造第二份常量）：我方蓝 / 敌方红，基础 alpha 0.40。 */
export const SLG_SELF_TILE_COLOR = SELF_COLOR;
export const SLG_OTHER_TILE_COLOR = OTHER_COLOR;

function writeQuad(positions: Float32Array, indices: Uint16Array, quad: number,
    left: number, bottom: number, right: number, top: number): void {
    positions.set([left, top, 0, right, top, 0, left, bottom, 0, right, bottom, 0], quad * 12);
    const v = quad * 4;
    indices.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], quad * 6);
}

/** 贴图在世界里每 4 格一个循环（邻格共享采样边，地表连续）；周期 8 格镜像防重复感。 */
export const SLG_TEXTURE_SPAN = 4;

/**
 * Texture spans SLG_TEXTURE_SPAN grids with mirrored wrap in WORLD coordinates. Thus adjacent
 * tiles of the same terrain sample identical image edges, including across chunk boundaries.
 * The half-texel inset keeps interpolation inside the selected atlas cell. Ownership uses a
 * separate solid-color pass so its blue/red indicator cannot be multiplied by green terrain.
 *
 * groundMode（缺省 = atlas 图集采样，兼容旧行为）：
 * - `{ kind: "tile", tile }`：UV 取「世界格 64 块贴图」的块内子区（块顶=北），顶点色全白（贴图原色）。
 * - `{ kind: "island", rect }`：块贴图未就绪回退——UV 取 island-ground 覆盖矩形同区（rect=terrain.islandRect），
 *   顶点白；矩形外 UV 越界由 clamp-to-edge 取海色边（island-ground 边缘即海）。
 * - `{ kind: "palette" }`：纯 palette 顶点色（无贴图材质下显示地形色，测试/调试用）。
 */
export function buildSlgTerrainMeshes(terrain: ISlgTerrain, cx: number, cy: number, lod: number,
    tiles: ReadonlyMap<number, ISlgTile>, selfUid: string, atlasWidth = 1536, atlasHeight = 1024,
    alpha = 1, hiddenLayers?: ReadonlySet<string>,
    groundMode?: { kind: "tile"; tile: number } | { kind: "island"; rect: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } } | { kind: "palette" }): SlgTerrainMeshes {
    chunkKey(cx, cy);
    if (!Number.isInteger(lod) || lod < 0 || lod > 3) throw new RangeError("SLG terrain mesh LOD invalid");
    if (!Number.isInteger(atlasWidth) || !Number.isInteger(atlasHeight)
        || atlasWidth < SLG_ART_ATLAS_COLUMNS || atlasHeight < SLG_ART_ATLAS_ROWS) {
        throw new RangeError("SLG terrain atlas dimensions invalid");
    }
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new RangeError("SLG terrain mesh alpha invalid");
    const startX = cx * SLG_CHUNK_SIZE, startY = cy * SLG_CHUNK_SIZE;
    const width = Math.min(SLG_CHUNK_SIZE, terrain.width - startX);
    const height = Math.min(SLG_CHUNK_SIZE, terrain.height - startY);
    const mapIndex = slgMapIndex(terrain.id);
    const quadCapacity = width * height;
    const positions = new Float32Array(quadCapacity * 12);
    const uvs = new Float32Array(quadCapacity * 8);
    const colors = new Float32Array(quadCapacity * 16).fill(1);
    for (let channel = 3; channel < colors.length; channel += 4) colors[channel] = alpha;
    const indices16 = new Uint16Array(quadCapacity * 6);
    const ownerPositions = new Float32Array(quadCapacity * 12);
    const ownerColors = new Float32Array(quadCapacity * 16);
    const ownerIndices = new Uint16Array(quadCapacity * 6);
    const gap = visibleMapLayers(lod, hiddenLayers).includes("grid") ? 0.65 : 0;
    const insetU = 0.5 / atlasWidth, insetV = 0.5 / atlasHeight;
    let ownerCount = 0;
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
        const x = startX + dx, y = startY + dy, quad = dy * width + dx;
        const left = x * SLG_GRID_PIXELS + gap, right = (x + 1) * SLG_GRID_PIXELS - gap;
        const bottom = y * SLG_GRID_PIXELS + gap, top = (y + 1) * SLG_GRID_PIXELS - gap;
        writeQuad(positions, indices16, quad, left, bottom, right, top);
        const ground = terrainAt(terrain, x, y);
        // groundMode 分支：tile = 块贴图 UV + 顶点白；palette = 顶点染地形色（回退）；缺省 = 图集 span 采样。
        if (groundMode?.kind === "palette") {
            for (let vertex = 0; vertex < 4; vertex++) for (let channel = 0; channel < 3; channel++) {
                colors[quad * 16 + vertex * 4 + channel] = ground.color[channel] / 255;
            }
            uvs.set([0, 0, 0, 0, 0, 0, 0, 0], quad * 8);
        } else if (groundMode?.kind === "tile") {
            // 块贴图子区：块 = 世界格 tile×tile，块图顶=北（世界 y 大）→ v 翻转
            const u = (x % groundMode.tile) / groundMode.tile;
            const u1v = ((x + 1) % groundMode.tile || groundMode.tile) / groundMode.tile;
            const vNorth = 1 - (y % groundMode.tile) / groundMode.tile;
            const vSouth = 1 - (((y + 1) % groundMode.tile || groundMode.tile) / groundMode.tile);
            uvs.set([u, vNorth, u1v, vNorth, u, vSouth, u1v, vSouth], quad * 8);
        } else if (groundMode?.kind === "island") {
            // island-ground 同区：覆盖矩形 rect（世界格）→ UV，顶=北采 v=0；界外 clamp-to-edge 取海色边
            const rect = groundMode.rect;
            const uw = rect.maxX - rect.minX, vh = rect.maxY - rect.minY;
            const uA = (x - rect.minX) / uw, uB = (x + 1 - rect.minX) / uw;
            const vNorth = 1 - (y + 1 - rect.minY) / vh, vSouth = 1 - (y - rect.minY) / vh;
            uvs.set([uA, vNorth, uB, vNorth, uA, vSouth, uB, vSouth], quad * 8);
        } else {
            if (ground.id >= 6) {
                for (let vertex = 0; vertex < 4; vertex++) for (let channel = 0; channel < 3; channel++) {
                    colors[quad * 16 + vertex * 4 + channel] = ground.color[channel] / 255;
                }
            }
            const uv = slgTerrainUv(ground.id);
            const u0 = uv.u0 + insetU, u1 = uv.u1 - insetU;
            const v0 = uv.v0 + insetV, v1 = uv.v1 - insetV;
            // 世界连续采样：同一地形的贴图每 SPAN 格一个循环、按 2*SPAN 周期镜像——相邻格共享采样边，
            // 地面读作连续地表而不是逐格印花（格子观感来自网格线层，不来自贴图重启）。
            const spanU = (value: number): number => {
                const phase = value % (SLG_TEXTURE_SPAN * 2);
                const t = phase < SLG_TEXTURE_SPAN ? phase / SLG_TEXTURE_SPAN : (SLG_TEXTURE_SPAN * 2 - phase) / SLG_TEXTURE_SPAN;
                return u0 + t * (u1 - u0);
            };
            const spanV = (value: number): number => {
                const phase = value % (SLG_TEXTURE_SPAN * 2);
                const t = phase < SLG_TEXTURE_SPAN ? 1 - phase / SLG_TEXTURE_SPAN : (phase - SLG_TEXTURE_SPAN) / SLG_TEXTURE_SPAN;
                return v0 + t * (v1 - v0);
            };
            uvs.set([spanU(x), spanV(y + 1), spanU(x + 1), spanV(y + 1), spanU(x), spanV(y), spanU(x + 1), spanV(y)], quad * 8);
        }
        const tile = tiles.get(tileIdFromGrid(mapIndex, x, y));
        if (tile?.ownerUid) {
            writeQuad(ownerPositions, ownerIndices, ownerCount, left, bottom, right, top);
            const base = tile.ownerUid === selfUid ? SELF_COLOR : OTHER_COLOR;
            const color = alpha === 1 ? base : [base[0], base[1], base[2], base[3] * alpha];
            for (let vertex = 0; vertex < 4; vertex++) ownerColors.set(color, ownerCount * 16 + vertex * 4);
            ownerCount += 1;
        }
    }
    const bounds = { minX: startX * SLG_GRID_PIXELS + gap, minY: startY * SLG_GRID_PIXELS + gap,
        maxX: (startX + width) * SLG_GRID_PIXELS - gap, maxY: (startY + height) * SLG_GRID_PIXELS - gap };
    return { ground: { positions, uvs, colors, indices16, ...bounds },
        ownership: ownerCount === 0 ? null : { positions: ownerPositions.subarray(0, ownerCount * 12),
            colors: ownerColors.subarray(0, ownerCount * 16), indices16: ownerIndices.subarray(0, ownerCount * 6), ...bounds },
        quadCapacity };
}
