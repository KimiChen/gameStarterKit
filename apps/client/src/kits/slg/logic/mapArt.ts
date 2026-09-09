/** Presentation-only map art. No engine state, network reads or gameplay semantics. */
import { SLG_CHUNK_SIZE, SLG_MAP_H, SLG_MAP_W, chunkKey, terrainAt, type ISlgChunkRect, type ISlgTerrain } from "../../../shared/kits/slg/api/worldmap/index";

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

export type SlgDecorationKind = "tree" | "mountain" | "snowMountain" | "sect" | "ruin" | "crystal";
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
    tree: 0, mountain: 1, snowMountain: 2, sect: 3, ruin: 4, crystal: 5,
};
/** Centers and complete footprints belong to different chunks; all five are on dry land. */
export const SLG_LANDMARKS: readonly SlgLandmark[] = [
    { id: "qingyun-sect", name: "青云宗", x: 5005, y: 5005, width: 6, height: 6, kind: "sect", atlasIndex: 3, landmark: true },
    { id: "chiyan-ruin", name: "赤岩遗迹", x: 1688, y: 5688, width: 6, height: 6, kind: "ruin", atlasIndex: 4, landmark: true },
    { id: "nanzhu-sect", name: "南竹洞天", x: 3256, y: 2008, width: 6, height: 6, kind: "sect", atlasIndex: 3, landmark: true },
    { id: "beiling-ruin", name: "北岭遗迹", x: 5480, y: 8584, width: 6, height: 6, kind: "ruin", atlasIndex: 4, landmark: true },
    { id: "linhu-crystal", name: "临湖灵晶", x: 7144, y: 5016, width: 6, height: 6, kind: "crystal", atlasIndex: 5, landmark: true },
];

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
    if (terrain === 0) {
        if (slot >= 2 || (!central && roll > 0.42)) return null;
        return central ? slot === 0 ? "tree" : "crystal" : roll < 0.06 ? "crystal" : "tree";
    }
    if (terrain === 1) return "tree";
    if (terrain === 3 && slot < 3 && roll < 0.75) return roll < 0.16 ? "crystal" : "mountain";
    if (terrain === 4 && slot < 4) return roll < 0.12 ? "crystal" : "mountain";
    if (terrain === 5 && slot < 4) return roll < 0.1 ? "crystal" : "snowMountain";
    return null;
}

/**
 * Enumerate at most six fixed slots, never the world's cells. X/Y are center anchors in grid
 * units; complete bounds stay inside their owning chunk. LODs select prefixes of the same
 * candidates, so zooming never moves retained objects or introduces duplicate neighbors.
 */
export function slgDecorationsForChunk(terrain: ISlgTerrain, cx: number, cy: number, lod: number): readonly SlgDecoration[] {
    chunkKey(cx, cy);
    if (!Number.isInteger(lod) || lod < 0 || lod > 3) throw new RangeError("SLG art LOD invalid");
    const minX = cx * SLG_CHUNK_SIZE, minY = cy * SLG_CHUNK_SIZE;
    const maxX = Math.min(SLG_MAP_W, minX + SLG_CHUNK_SIZE), maxY = Math.min(SLG_MAP_H, minY + SLG_CHUNK_SIZE);
    const landmarks = SLG_LANDMARKS.filter((entry) => entry.x >= minX && entry.x < maxX && entry.y >= minY && entry.y < maxY);
    const ordinary: SlgDecoration[] = [];
    const central = cx === Math.floor(5005 / SLG_CHUNK_SIZE) && cy === Math.floor(5005 / SLG_CHUNK_SIZE);
    const limit = [6, 4, 2, 0][lod];
    for (let slot = 0; slot < 6 && ordinary.length < limit; slot++) {
        const seedX = minX + (slot % 3 + 0.5) * (maxX - minX) / 3;
        const seedY = minY + (Math.floor(slot / 3) + 0.5) * (maxY - minY) / 2;
        const kind = ordinaryKind(terrainAt(terrain, Math.floor(seedX), Math.floor(seedY)).id, slot,
            unitHash(cx, cy, slot, 0x51494e47), central);
        if (!kind) continue;
        const size = kind === "tree" ? 2.5 : kind === "crystal" ? 2.25 : 4;
        const variance = 0.9 + unitHash(cx, cy, slot, 0x41525431) * 0.2;
        const width = size * variance, height = size * variance;
        const entry: SlgDecoration = {
            id: `decor-${cx}-${cy}-${slot}`, kind, atlasIndex: DECORATION_ATLAS_INDEX[kind], landmark: false, width, height,
            x: bounded(seedX + unitHash(cx, cy, slot, 0x584a4954) - 0.5, minX + width / 2, maxX - width / 2),
            y: bounded(seedY + unitHash(cx, cy, slot, 0x594a4954) - 0.5, minY + height / 2, maxY - height / 2),
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

/** World space uses continuous outer bounds 0..10000; overview uses top-left, north-up pixels. */
export function worldToOverview(point: SlgArtPoint, width = 1, height = 1): SlgArtPoint {
    validateOverview(point, width, height);
    return { x: bounded(point.x, 0, SLG_MAP_W) / SLG_MAP_W * width,
        y: (1 - bounded(point.y, 0, SLG_MAP_H) / SLG_MAP_H) * height };
}

/** Returns continuous world bounds, including 10000. A tile lookup must floor and clamp to 9999. */
export function overviewToWorld(point: SlgArtPoint, width = 1, height = 1): SlgArtPoint {
    validateOverview(point, width, height);
    return { x: bounded(point.x / width, 0, 1) * SLG_MAP_W,
        y: (1 - bounded(point.y / height, 0, 1)) * SLG_MAP_H };
}

/** Accepts MapCamera.visibleRect(): maxima INCLUDE their last grid cell. Add one exactly here. */
export function overviewViewportRect(rect: ISlgChunkRect, width = 1, height = 1): SlgOverviewRect {
    if (![rect.minX, rect.minY, rect.maxX, rect.maxY].every(Number.isFinite)
        || rect.minX > rect.maxX || rect.minY > rect.maxY) throw new RangeError("SLG overview viewport invalid");
    const topLeft = worldToOverview({ x: rect.minX, y: rect.maxY + 1 }, width, height);
    const bottomRight = worldToOverview({ x: rect.maxX + 1, y: rect.minY }, width, height);
    return { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y };
}

export interface SlgOverviewTerrainRect extends SlgOverviewRect { readonly color: readonly [number, number, number] }
/** Default quad followed by ordered overlays: at most 513 quads, without sampling world cells. */
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
