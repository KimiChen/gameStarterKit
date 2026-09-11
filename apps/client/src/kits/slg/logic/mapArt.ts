/** Presentation-only map art. No engine state, network reads or gameplay semantics. */
import { SLG_CHUNK_SIZE, SLG_MAPS, chunkKey, terrainAt, type ISlgChunkRect, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";

export const SLG_ART_ATLAS_COLUMNS = 3;
export const SLG_ART_ATLAS_ROWS = 2;
export const SLG_ART_ATLAS_CELL_SIZE = 512;
export const SLG_MAX_DECORATIONS_PER_CHUNK = 7;

/** Both V and pixel Y increase downwards from the PNG's top-left corner. */
export interface SlgAtlasUv { readonly u0: number; readonly v0: number; readonly u1: number; readonly v1: number }
export interface SlgArtPoint { readonly x: number; readonly y: number }
export interface SlgOverviewRect extends SlgArtPoint { readonly width: number; readonly height: number }

export function slgAtlasUv(index: number): SlgAtlasUv {
    if (!Number.isInteger(index) || index < 0 || index >= SLG_ART_ATLAS_COLUMNS * SLG_ART_ATLAS_ROWS) {
        throw new RangeError("SLG art atlas index outside atlas");
    }
    const column = index % SLG_ART_ATLAS_COLUMNS, row = Math.floor(index / SLG_ART_ATLAS_COLUMNS);
    return { u0: column / SLG_ART_ATLAS_COLUMNS, v0: row / SLG_ART_ATLAS_ROWS,
        u1: (column + 1) / SLG_ART_ATLAS_COLUMNS, v1: (row + 1) / SLG_ART_ATLAS_ROWS };
}

export function slgArtAtlasRect(index: number): SlgOverviewRect {
    slgAtlasUv(index);
    return { x: index % SLG_ART_ATLAS_COLUMNS * SLG_ART_ATLAS_CELL_SIZE,
        y: Math.floor(index / SLG_ART_ATLAS_COLUMNS) * SLG_ART_ATLAS_CELL_SIZE,
        width: SLG_ART_ATLAS_CELL_SIZE, height: SLG_ART_ATLAS_CELL_SIZE };
}

/** Extra valid terrain palette IDs fall back to the grass texture until art is assigned. */
export function slgTerrainUv(terrainId: number): SlgAtlasUv {
    if (!Number.isInteger(terrainId) || terrainId < 0 || terrainId > 15) throw new RangeError("SLG terrain art id invalid");
    return slgAtlasUv(terrainId < 6 ? terrainId : 0);
}

export type SlgDecorationKind = "tree" | "chest" | "portal" | "stele" | "crystal" | "sword";
export interface SlgDecoration extends SlgArtPoint {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly atlasIndex: number;
    readonly kind: SlgDecorationKind;
    readonly landmark: boolean;
    readonly name?: string;
}
export interface SlgLandmark extends SlgDecoration { readonly landmark: true; readonly name: string }

const DECORATION_ATLAS_INDEX: Readonly<Record<SlgDecorationKind, number>> = {
    tree: 0, chest: 1, portal: 2, stele: 3, crystal: 4, sword: 5,
};
/** 地标占地固定 9×9（管线 calibrate --check-landmarks 按此校验 chunk 足迹）。 */
export const SLG_LANDMARK_FOOT = 9;
/** layout.json 的地标条目（管线 tools/slg-maps 产出；x/y 为中心格锚；kind 即图集 kind）。 */
export interface SlgLayoutLandmark { readonly name: string; readonly x: number; readonly y: number; readonly tag: string; readonly kind: SlgDecorationKind }

/** 布局地标 → 运行时装饰（数据驱动；曾硬编码 SLG_LANDMARKS，五图化后从 layout 读）。
 *  坐标为中心格锚（管线 calibrate 按 x−4..x+4 校验 9×9 足迹）。 */
export function slgLandmarkOf(entry: SlgLayoutLandmark): SlgLandmark {
    return {
        id: `landmark-${entry.name}`, name: entry.name, x: entry.x, y: entry.y,
        width: SLG_LANDMARK_FOOT, height: SLG_LANDMARK_FOOT,
        kind: entry.kind, atlasIndex: DECORATION_ATLAS_INDEX[entry.kind], landmark: true,
    };
}

function artHash(cx: number, cy: number, slot: number, salt: number): number {
    let value = Math.imul(cx + 1, 0x9e3779b1) ^ Math.imul(cy + 1, 0x85ebca77) ^ Math.imul(slot + 1, 0xc2b2ae3d) ^ salt;
    value = Math.imul(value ^ value >>> 16, 0x7feb352d);
    value = Math.imul(value ^ value >>> 15, 0x846ca68b);
    return (value ^ value >>> 16) >>> 0;
}
function unitHash(cx: number, cy: number, slot: number, salt: number): number {
    return artHash(cx, cy, slot, salt) / 0x100000000;
}
function bounded(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
function intersects(a: SlgDecoration, b: SlgDecoration): boolean {
    return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 0.2
        && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 0.2;
}

function ordinaryKind(terrain: number, slot: number, roll: number, central: boolean): SlgDecorationKind | null {
    // 五图统一 palette 语义：0 草地主陆 / 1 林地湿地 / 2 水面 / 3 岩石台地 / 4 沙滩浅滩 / 5 裸土；水面不出装饰。
    if (terrain === 2) return null;
    if (terrain === 0) {
        if (slot >= 3 || (!central && roll > 0.55)) return null;
        return central ? slot === 0 ? "tree" : "crystal" : roll < 0.08 ? "crystal" : "tree";
    }
    if (terrain === 1) return "tree";
    if (terrain === 3 && slot < 4 && roll < 0.85) return roll < 0.16 ? "crystal" : "stele";
    if (terrain === 4 && slot < 4) return roll < 0.12 ? "sword" : "chest";
    if (terrain === 5 && slot < 4) return roll < 0.1 ? "crystal" : "sword";
    return null;
}

/**
 * Enumerate at most six fixed slots, never the world's cells. X/Y are center anchors in grid
 * units; complete bounds stay inside their owning chunk. LODs select prefixes of the same
 * candidates, so zooming never moves retained objects or introduces duplicate neighbors.
 *
 * 地标与布局点位全部数据驱动（layout = buildSlgLayoutIndex 产物）；无布局区域维持确定性哈希兜底。
 */
export function slgDecorationsForChunk(terrain: ISlgTerrain, cx: number, cy: number, lod: number,
    layout?: SlgLayoutIndex): readonly SlgDecoration[] {
    chunkKey(cx, cy);
    if (!Number.isInteger(lod) || lod < 0 || lod > 3) throw new RangeError("SLG art LOD invalid");
    const minX = cx * SLG_CHUNK_SIZE, minY = cy * SLG_CHUNK_SIZE;
    const maxX = Math.min(terrain.width, minX + SLG_CHUNK_SIZE), maxY = Math.min(terrain.height, minY + SLG_CHUNK_SIZE);
    const landmarks = (layout?.landmarks ?? []).filter((entry) => entry.x >= minX && entry.x < maxX && entry.y >= minY && entry.y < maxY);
    const bucket = layout?.index.get(chunkKey(cx, cy));
    if (bucket) {
        const limit = [6, 4, 2, 0][lod];
        return [...bucket.slice(0, Math.max(0, limit - landmarks.length)), ...landmarks].sort((a, b) => b.y - a.y || a.x - b.x);
    }
    const ordinary: SlgDecoration[] = [];
    const central = cx === Math.floor(terrain.width / 2 / SLG_CHUNK_SIZE) && cy === Math.floor(terrain.height / 2 / SLG_CHUNK_SIZE);
    const limit = [6, 4, 2, 0][lod];
    for (let slot = 0; slot < 6 && ordinary.length < limit; slot++) {
        const seedX = minX + (slot % 3 + 0.5) * (maxX - minX) / 3;
        const seedY = minY + (Math.floor(slot / 3) + 0.5) * (maxY - minY) / 2;
        const kind = ordinaryKind(terrainAt(terrain, Math.floor(seedX), Math.floor(seedY)).id, slot,
            unitHash(cx, cy, slot, 0x51494e47), central);
        if (!kind) continue;
        const size = kind === "tree" ? 4.5 : kind === "crystal" ? 3.5 : kind === "chest" ? 3 : kind === "portal" ? 5 : kind === "sword" ? 5 : 6;
        const variance = 0.9 + unitHash(cx, cy, slot, 0x41525431) * 0.2;
        const width = size * variance, height = size * variance;
        const entry: SlgDecoration = {
            id: `decor-${cx}-${cy}-${slot}`, kind, atlasIndex: DECORATION_ATLAS_INDEX[kind], landmark: false, width, height,
            // 封界：中心钳进 [块界+半径+ε]；ε 抵消浮点尾差，足迹测试按 ≥ 断言整块内
            x: bounded(seedX + unitHash(cx, cy, slot, 0x584a4954) - 0.5, minX + width / 2 + 1e-9, maxX - width / 2 - 1e-9),
            y: bounded(seedY + unitHash(cx, cy, slot, 0x594a4954) - 0.5, minY + height / 2 + 1e-9, maxY - height / 2 - 1e-9),
        };
        if (!landmarks.some((landmark) => intersects(entry, landmark))) ordinary.push(entry);
    }
    return [...ordinary, ...landmarks].sort((a, b) => b.y - a.y || a.x - b.x);
}

function validateOverview(point: SlgArtPoint, width: number, height: number): void {
    if (![point.x, point.y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        throw new RangeError("SLG overview coordinates or dimensions invalid");
    }
}

/** World space uses the terrain's own bounds; overview uses top-left, north-up pixels. */
export function worldToOverview(terrain: ISlgTerrain, point: SlgArtPoint, width = 1, height = 1): SlgArtPoint {
    validateOverview(point, width, height);
    return { x: bounded(point.x, 0, terrain.width) / terrain.width * width,
        y: (1 - bounded(point.y, 0, terrain.height) / terrain.height) * height };
}

/** Returns continuous world bounds, including width/height. A tile lookup must floor and clamp. */
export function overviewToWorld(terrain: ISlgTerrain, point: SlgArtPoint, width = 1, height = 1): SlgArtPoint {
    validateOverview(point, width, height);
    return { x: bounded(point.x / width, 0, 1) * terrain.width,
        y: (1 - bounded(point.y / height, 0, 1)) * terrain.height };
}

/** Accepts MapCamera.visibleRect(): maxima INCLUDE their last grid cell. Add one exactly here. */
export function overviewViewportRect(terrain: ISlgTerrain, rect: ISlgChunkRect, width = 1, height = 1): SlgOverviewRect {
    if (![rect.minX, rect.minY, rect.maxX, rect.maxY].every(Number.isFinite)
        || rect.minX > rect.maxX || rect.minY > rect.maxY) throw new RangeError("SLG overview viewport invalid");
    const topLeft = worldToOverview(terrain, { x: rect.minX, y: rect.maxY + 1 }, width, height);
    const bottomRight = worldToOverview(terrain, { x: rect.maxX + 1, y: rect.minY }, width, height);
    return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
}

export interface SlgOverviewTerrainRect extends SlgOverviewRect { readonly color: readonly [number, number, number] }
/** Default quad followed by ordered overlays: at most 2049 quads（2048 区域上限 + 默认底）, without sampling world cells. */
export function buildSlgOverviewRects(terrain: ISlgTerrain): readonly SlgOverviewTerrainRect[] {
    const colors = new Map(terrain.palette.map((entry) => [entry.id, entry.color] as const));
    const colorFor = (id: number): readonly [number, number, number] => {
        const color = colors.get(id);
        if (!color) throw new RangeError("SLG overview terrain palette missing");
        return color;
    };
    return [{ x: 0, y: 0, width: terrain.width, height: terrain.height, color: colorFor(0) },
        ...terrain.regions.map((region) => ({ x: region.x, y: region.y, width: region.width, height: region.height,
            color: colorFor(region.terrain) }))];
}


/** <mapId>/layout.json 的运行时形状（五国真实布局复刻，tools/slg-maps 管线产出）。 */
export interface SlgForestLayoutDecoration { readonly x: number; readonly y: number; readonly kind: SlgDecorationKind }
export interface SlgForestLayout {
    readonly source: string;
    readonly id: string;
    /** 方图为单值（森之国 legacy），非方图为 [width, height]。 */
    readonly mapSize: number | readonly [number, number];
    readonly landmarks: readonly SlgLayoutLandmark[];
    readonly decorations: readonly SlgForestLayoutDecoration[];
}

const LAYOUT_KINDS: readonly string[] = ["tree", "chest", "portal", "stele", "crystal", "sword"];

/** 布局文件的 fail-closed 形状闸：id 对照 SLG_MAPS catalog，mapSize 匹配该图尺寸，kind 必须是六类之一。 */
export function validateSlgForestLayout(input: unknown): input is SlgForestLayout {
    if (!input || typeof input !== "object") return false;
    const value = input as { id?: unknown; mapSize?: unknown; landmarks?: unknown; decorations?: unknown };
    if (typeof value.id !== "string") return false;
    const info = SLG_MAPS.find((m) => m.id === value.id);
    if (!info) return false;
    const size = Array.isArray(value.mapSize) ? value.mapSize : [value.mapSize, value.mapSize];
    if (size.length !== 2 || size[0] !== info.width || size[1] !== info.height) return false;
    if (!Array.isArray(value.landmarks) || value.landmarks.length === 0) return false;
    for (const lm of value.landmarks) {
        if (!lm || typeof lm !== "object") return false;
        const { name, x, y, kind } = lm as { name?: unknown; x?: unknown; y?: unknown; kind?: unknown };
        if (typeof name !== "string" || !name || typeof kind !== "string" || !LAYOUT_KINDS.includes(kind)) return false;
        if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
    }
    if (!Array.isArray(value.decorations)) return false;
    for (const entry of value.decorations) {
        if (!entry || typeof entry !== "object") return false;
        const { x, y, kind } = entry as { x?: unknown; y?: unknown; kind?: unknown };
        if (!Number.isInteger(x) || !Number.isInteger(y) || (x as number) < 0 || (x as number) >= info.width
            || (y as number) < 0 || (y as number) >= info.height) return false;
        if (typeof kind !== "string" || !LAYOUT_KINDS.includes(kind)) return false;
    }
    return true;
}

const LAYOUT_SIZE: Readonly<Record<SlgDecorationKind, number>> = {
    tree: 4.5, chest: 3, portal: 5, stele: 6, crystal: 3.5, sword: 5,
};

export interface SlgLayoutIndex {
    readonly index: ReadonlyMap<number, readonly SlgDecoration[]>;
    readonly landmarks: readonly SlgLandmark[];
}

/**
 * 布局点位 → 按 chunk 分桶的索引（chunkKey → 装饰数组）。每 chunk 上限 6（超出按输入序截断），
 * 与确定性哈希路径共用同一上限族。地标从布局 landmarks 构建（数据驱动）。
 */
export function buildSlgLayoutIndex(layout: SlgForestLayout): SlgLayoutIndex {
    if (!validateSlgForestLayout(layout)) throw new RangeError("SLG layout invalid");
    const buckets = new Map<number, SlgDecoration[]>();
    layout.decorations.forEach((entry, index) => {
        const size = LAYOUT_SIZE[entry.kind];
        const decoration: SlgDecoration = {
            id: `layout-${index}`, kind: entry.kind, atlasIndex: DECORATION_ATLAS_INDEX[entry.kind],
            landmark: false, width: size, height: size, x: entry.x, y: entry.y,
        };
        const key = chunkKey(Math.floor(entry.x / SLG_CHUNK_SIZE), Math.floor(entry.y / SLG_CHUNK_SIZE));
        const bucket = buckets.get(key);
        if (bucket) bucket.push(decoration);
        else buckets.set(key, [decoration]);
    });
    for (const bucket of buckets.values()) bucket.sort((a, b) => a.id < b.id ? -1 : 1);
    return { index: buckets, landmarks: layout.landmarks.map(slgLandmarkOf) };
}
