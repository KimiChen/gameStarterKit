/** Bounded chunk streaming: center-out loads, retention band, generation-fenced completions. */
import { SLG_CHUNK_SIZE, chunkKey, chunkRectForGridRect, gridFromTileId, type ISlgChunkRect } from "../../../shared/kits/slg/api/worldmap/index";
import type { MapRect } from "./mapCamera";

export interface ChunkLoad { readonly key: number; readonly x: number; readonly y: number; readonly generation: number }
export interface ChunkDelta { readonly added: readonly number[]; readonly removed: readonly number[] }
function keys(rect: ISlgChunkRect): number[] {
    const result: number[] = [];
    for (let y = rect.minY; y <= rect.maxY; y++) for (let x = rect.minX; x <= rect.maxX; x++) result.push(chunkKey(x, y));
    return result;
}

export class MapStreamer {
    private generation = 0;
    private desired = new Set<number>();
    private loaded = new Set<number>();
    private pending = new Set<number>();
    private queue: number[] = [];
    private signature = "";
    constructor(readonly mapWidth: number, readonly mapHeight: number) {}
    private expanded(rect: MapRect, margin: number): MapRect {
        return { minX: Math.max(0, rect.minX - margin), minY: Math.max(0, rect.minY - margin),
            maxX: Math.min(this.mapWidth - 1, rect.maxX + margin), maxY: Math.min(this.mapHeight - 1, rect.maxY + margin) };
    }
    update(viewport: MapRect): ChunkDelta {
        const loadRect = chunkRectForGridRect(this.expanded(viewport, 4), this.mapWidth, this.mapHeight);
        const signature = [loadRect.minX, loadRect.minY, loadRect.maxX, loadRect.maxY].join(":");
        if (signature === this.signature) return { added: [], removed: [] };
        this.signature = signature;
        this.generation += 1;
        const next = new Set(keys(loadRect));
        const retain = new Set(keys(chunkRectForGridRect(this.expanded(viewport, SLG_CHUNK_SIZE + 4), this.mapWidth, this.mapHeight)));
        const removed = [...this.loaded].filter((key) => !retain.has(key));
        for (const key of removed) this.loaded.delete(key);
        const added = [...next].filter((key) => !this.desired.has(key));
        this.desired = next;
        this.pending.clear();
        const centerX = (loadRect.minX + loadRect.maxX) / 2;
        const centerY = (loadRect.minY + loadRect.maxY) / 2;
        const distance = (key: number) => {
            const point = gridFromTileId(key);
            return Math.max(Math.abs(point.x - centerX), Math.abs(point.y - centerY));
        };
        this.queue = [...next].filter((key) => !this.loaded.has(key)).sort((a, b) => distance(a) - distance(b) || a - b);
        return { added, removed };
    }
    take(): ChunkLoad | null {
        const key = this.queue.shift();
        if (key === undefined) return null;
        this.pending.add(key);
        return { key, x: gridFromTileId(key).x, y: gridFromTileId(key).y, generation: this.generation };
    }
    /** Pack pending neighbors into a rectangle of at most four chunks without fetching loaded chunks again. */
    takeBatch(): readonly ChunkLoad[] {
        const first = this.take();
        if (!first) return [];
        const candidates: ISlgChunkRect[] = [];
        for (const x of [first.x, first.x - 1]) for (const y of [first.y, first.y - 1]) {
            candidates.push({ minX: x, minY: y, maxX: x + 1, maxY: y + 1 });
        }
        candidates.push(
            { minX: first.x, minY: first.y, maxX: first.x + 1, maxY: first.y },
            { minX: first.x - 1, minY: first.y, maxX: first.x, maxY: first.y },
            { minX: first.x, minY: first.y, maxX: first.x, maxY: first.y + 1 },
            { minX: first.x, minY: first.y - 1, maxX: first.x, maxY: first.y },
        );
        for (const rect of candidates) {
            if (rect.minX < 0 || rect.minY < 0 || rect.maxX >= Math.ceil(this.mapWidth / SLG_CHUNK_SIZE)
                || rect.maxY >= Math.ceil(this.mapHeight / SLG_CHUNK_SIZE)) continue;
            const group = keys(rect);
            if (!group.every((key) => key === first.key || this.queue.includes(key))) continue;
            const members = new Set(group);
            this.queue = this.queue.filter((key) => !members.has(key));
            for (const key of group) this.pending.add(key);
            return group.map((key) => ({ key, x: gridFromTileId(key).x, y: gridFromTileId(key).y, generation: this.generation }));
        }
        return [first];
    }
    accept(load: ChunkLoad): boolean {
        if (!this.current(load)) return false;
        this.pending.delete(load.key); this.loaded.add(load.key); return true;
    }
    reject(load: ChunkLoad): void { if (this.current(load)) this.pending.delete(load.key); }
    /** A rate-limited batch returns to the queue, but the caller must honor its retry deadline. */
    defer(load: ChunkLoad): void {
        if (!this.current(load)) return;
        this.pending.delete(load.key); this.queue.unshift(load.key);
    }
    current(load: ChunkLoad): boolean {
        return load.generation === this.generation && this.desired.has(load.key) && this.pending.has(load.key);
    }
    loadedKeys(): readonly number[] { return [...this.loaded]; }
    reset(): void {
        this.generation += 1; this.desired.clear(); this.loaded.clear(); this.pending.clear(); this.queue = []; this.signature = "";
    }
}
