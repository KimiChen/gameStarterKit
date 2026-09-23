import { mapoWorldBounds } from "../../../shared/kits/mapOriginal/api/hexmap/index";
import type { IMapoGroundRect } from "./mapoGround";

/** RGBA8 + depth/stencil 各 4 字节；包含正在烘焙的那张，不能只算颜色纹理。 */
export const MAPO_CACHE_BYTES = 48 * 1024 * 1024;
export const MAPO_CACHE_PADDING = 2;
export interface MapoCacheTile {
    readonly key: string;
    readonly lod: 1 | 2;
    readonly pixels: number;
    readonly bytes: number;
    readonly rect: IMapoGroundRect;
    readonly capture: IMapoGroundRect;
    readonly details: boolean;
}

/** 分块数量受视口约束；按屏幕采样密度挑纹理尺寸，大视口自动降采样而不删资源格。 */
export function mapoCacheTiles(rect: IMapoGroundRect, lod: 1 | 2, scale: number, details = true): MapoCacheTile[] {
    const size = lod === 1 ? 1024 : 4096;
    const b = mapoWorldBounds();
    const x0 = Math.floor(Math.max(b.minX, rect.left) / size), x1 = Math.ceil(Math.min(b.maxX, rect.right) / size) - 1;
    const y0 = Math.floor(Math.max(b.minY, rect.bottom) / size), y1 = Math.ceil(Math.min(b.maxY, rect.top) / size) - 1;
    const count = Math.max(0, x1 - x0 + 1) * Math.max(0, y1 - y0 + 1);
    let pixels = size * scale > 256 ? 512 : 256;
    while (count * pixels * pixels * 8 > MAPO_CACHE_BYTES && pixels > 32) pixels /= 2;
    const pad = size * MAPO_CACHE_PADDING / (pixels - MAPO_CACHE_PADDING * 2);
    const out: MapoCacheTile[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const left = x * size, bottom = y * size, right = left + size, top = bottom + size;
        out.push({ key: `${lod}/${pixels}/${details ? 1 : 0}/${x}/${y}`, lod, pixels, bytes: pixels * pixels * 8, details,
            rect: { left, right, bottom, top }, capture: { left: left - pad, right: right + pad, bottom: bottom - pad, top: top + pad } });
    }
    const cx = (rect.left + rect.right) / 2, cy = (rect.bottom + rect.top) / 2;
    const distance = (t: MapoCacheTile) => (t.rect.left + size / 2 - cx) ** 2 + (t.rect.bottom + size / 2 - cy) ** 2;
    return out.sort((a, c) => distance(a) - distance(c));
}

/** 有界 LRU，销毁语义集中在这里；被当前画面引用的条目不逐出。 */
export class MapoLodCache<T> {
    private readonly entries = new Map<string, { value: T; bytes: number }>();
    bytes = 0;
    constructor(private readonly destroy: (value: T) => void, readonly budget = MAPO_CACHE_BYTES) {}
    get(key: string): T | undefined {
        const item = this.entries.get(key);
        if (!item) return undefined;
        this.entries.delete(key); this.entries.set(key, item);
        return item.value;
    }
    reserve(bytes: number, pinned: ReadonlySet<string>): boolean {
        for (const [key, item] of this.entries) {
            if (this.bytes + bytes <= this.budget) break;
            if (pinned.has(key)) continue;
            this.entries.delete(key); this.bytes -= item.bytes; this.destroy(item.value);
        }
        return this.bytes + bytes <= this.budget;
    }
    put(key: string, value: T, bytes: number): void {
        const old = this.entries.get(key);
        if (old) { this.bytes -= old.bytes; this.destroy(old.value); this.entries.delete(key); }
        this.entries.set(key, { value, bytes }); this.bytes += bytes;
    }
    forEach(visit: (value: T, key: string) => void): void {
        for (const [key, item] of this.entries) visit(item.value, key);
    }
    clear(): void {
        for (const item of this.entries.values()) this.destroy(item.value);
        this.entries.clear(); this.bytes = 0;
    }
}
