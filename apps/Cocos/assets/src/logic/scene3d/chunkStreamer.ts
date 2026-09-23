/** Bounded chunk streaming without engine, projection or kit dependencies. */
export interface ChunkPoint { readonly x: number; readonly y: number }
/** Inclusive coordinates, in world cells for update() and chunk indices internally. */
export interface ChunkRect {
    readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
}
export interface ChunkLoad { readonly key: number; readonly x: number; readonly y: number; readonly generation: number }
export interface ChunkDelta { readonly added: readonly number[]; readonly removed: readonly number[] }

export interface ChunkStreamerOptions {
    readonly chunkSize: number;
    readonly mapWidth: number;
    readonly mapHeight: number;
    /** Stable, one-to-one numeric encoding of chunk indices; numeric order breaks ring ties. */
    readonly key: (x: number, y: number) => number;
    readonly unkey: (key: number) => ChunkPoint;
    /** Load and retention expansion, both measured from the viewport in world cells. */
    readonly margin: number;
    readonly retainMargin: number;
}

/**
 * Supply fixed positive integer dimensions/chunkSize, 0 <= margin <= retainMargin,
 * and pure inverse key/unkey functions. World cells run from 0 to mapSize - 1.
 * Only a changed load rectangle starts a generation (including retention/diff work).
 * The caller owns request timing: reject drops a failed request; defer requeues it.
 */
export class ChunkStreamer {
    private generation = 0;
    private desired = new Set<number>();
    private loaded = new Set<number>();
    private pending = new Set<number>();
    private queue: number[] = [];
    private signature = "";
    constructor(private readonly options: ChunkStreamerOptions) {}

    private keys(rect: ChunkRect): number[] {
        const result: number[] = [];
        for (let y = rect.minY; y <= rect.maxY; y++) for (let x = rect.minX; x <= rect.maxX; x++) {
            result.push(this.options.key(x, y));
        }
        return result;
    }
    private chunkRect(rect: ChunkRect): ChunkRect {
        const { mapWidth, mapHeight, chunkSize } = this.options;
        return {
            minX: Math.floor(Math.max(0, Math.min(mapWidth - 1, rect.minX)) / chunkSize),
            minY: Math.floor(Math.max(0, Math.min(mapHeight - 1, rect.minY)) / chunkSize),
            maxX: Math.floor(Math.max(0, Math.min(mapWidth - 1, rect.maxX)) / chunkSize),
            maxY: Math.floor(Math.max(0, Math.min(mapHeight - 1, rect.maxY)) / chunkSize),
        };
    }
    private expanded(rect: ChunkRect, margin: number): ChunkRect {
        return { minX: Math.max(0, rect.minX - margin), minY: Math.max(0, rect.minY - margin),
            maxX: Math.min(this.options.mapWidth - 1, rect.maxX + margin), maxY: Math.min(this.options.mapHeight - 1, rect.maxY + margin) };
    }
    update(viewport: ChunkRect): ChunkDelta {
        const loadRect = this.chunkRect(this.expanded(viewport, this.options.margin));
        const signature = [loadRect.minX, loadRect.minY, loadRect.maxX, loadRect.maxY].join(":");
        if (signature === this.signature) return { added: [], removed: [] };
        this.signature = signature;
        this.generation += 1;
        const next = new Set(this.keys(loadRect));
        const retain = new Set(this.keys(this.chunkRect(this.expanded(viewport, this.options.retainMargin))));
        const removed = [...this.loaded].filter((key) => !retain.has(key));
        for (const key of removed) this.loaded.delete(key);
        const added = [...next].filter((key) => !this.desired.has(key));
        this.desired = next;
        this.pending.clear();
        const centerX = (loadRect.minX + loadRect.maxX) / 2;
        const centerY = (loadRect.minY + loadRect.maxY) / 2;
        const distance = (key: number) => {
            const point = this.options.unkey(key);
            return Math.max(Math.abs(point.x - centerX), Math.abs(point.y - centerY));
        };
        this.queue = [...next].filter((key) => !this.loaded.has(key)).sort((a, b) => distance(a) - distance(b) || a - b);
        return { added, removed };
    }
    take(): ChunkLoad | null {
        const key = this.queue.shift();
        if (key === undefined) return null;
        this.pending.add(key);
        return { key, x: this.options.unkey(key).x, y: this.options.unkey(key).y, generation: this.generation };
    }
    /** Pack queued neighbors into a rectangle of at most four chunks, without refetching loaded/pending chunks. */
    takeBatch(): readonly ChunkLoad[] {
        const first = this.take();
        if (!first) return [];
        const candidates: ChunkRect[] = [];
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
            if (rect.minX < 0 || rect.minY < 0 || rect.maxX >= Math.ceil(this.options.mapWidth / this.options.chunkSize)
                || rect.maxY >= Math.ceil(this.options.mapHeight / this.options.chunkSize)) continue;
            const group = this.keys(rect);
            if (!group.every((key) => key === first.key || this.queue.includes(key))) continue;
            const members = new Set(group);
            this.queue = this.queue.filter((key) => !members.has(key));
            for (const key of group) this.pending.add(key);
            return group.map((key) => ({ key, x: this.options.unkey(key).x, y: this.options.unkey(key).y, generation: this.generation }));
        }
        return [first];
    }
    accept(load: ChunkLoad): boolean {
        if (!this.current(load)) return false;
        this.pending.delete(load.key); this.loaded.add(load.key); return true;
    }
    reject(load: ChunkLoad): void { if (this.current(load)) this.pending.delete(load.key); }
    /** A rate-limited batch returns to the queue head; the caller must honor its retry deadline. */
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
