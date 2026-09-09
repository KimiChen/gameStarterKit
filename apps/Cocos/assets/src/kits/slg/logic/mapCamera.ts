/** UI-space camera; world coordinates are grid units, input is design pixels. */
import { SLG_MAP_W, SLG_MAP_H, slgLodForScale } from "../../../shared/kits/slg/api/worldmap/index";

export const SLG_GRID_PIXELS = 48;
export interface MapPoint { readonly x: number; readonly y: number }
export interface MapRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }
interface Pointer { x: number; y: number; startX: number; startY: number; moved: boolean }

export const mapLod = slgLodForScale;

/** Version changes only when the camera actually moves; no engine/global clock dependencies. */
export class MapCamera {
    x = SLG_MAP_W / 2;
    y = SLG_MAP_H / 2;
    scale = 0.85;
    version = 0;
    private velocityX = 0;
    private velocityY = 0;
    private lastMoveAt = 0;
    private readonly pointers = new Map<number, Pointer>();
    constructor(readonly width: number, readonly height: number) {}

    get lod(): number { return mapLod(this.scale); }
    get pixelsPerGrid(): number { return this.scale * SLG_GRID_PIXELS; }
    get pointerCount(): number { return this.pointers.size; }
    worldAt(x: number, y: number): MapPoint {
        return { x: this.x + x / this.pixelsPerGrid, y: this.y + y / this.pixelsPerGrid };
    }
    visibleRect(): MapRect {
        const halfW = this.width / this.pixelsPerGrid / 2;
        const halfH = this.height / this.pixelsPerGrid / 2;
        return { minX: Math.max(0, Math.floor(this.x - halfW)), minY: Math.max(0, Math.floor(this.y - halfH)),
            maxX: Math.min(SLG_MAP_W - 1, Math.floor(this.x + halfW)), maxY: Math.min(SLG_MAP_H - 1, Math.floor(this.y + halfH)) };
    }
    pan(dx: number, dy: number): void {
        this.commit(this.x - dx / this.pixelsPerGrid, this.y - dy / this.pixelsPerGrid, this.scale);
    }
    /** Overview navigation preserves zoom and cannot leave an old drag/inertia running. */
    locate(x: number, y: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.cancel();
        this.commit(x, y, this.scale);
    }
    zoom(factor: number, anchorX = 0, anchorY = 0): void {
        if (!Number.isFinite(factor) || factor <= 0) return;
        const anchor = this.worldAt(anchorX, anchorY);
        const scale = Math.min(2, Math.max(0.12, this.scale * factor));
        this.commit(anchor.x - anchorX / (scale * SLG_GRID_PIXELS), anchor.y - anchorY / (scale * SLG_GRID_PIXELS), scale);
    }
    start(id: number, x: number, y: number, now: number): void {
        if (this.pointers.has(id) || this.pointers.size >= 2) return;
        this.velocityX = this.velocityY = 0;
        this.lastMoveAt = now;
        this.pointers.set(id, { x, y, startX: x, startY: y, moved: false });
        if (this.pointers.size > 1) for (const pointer of this.pointers.values()) pointer.moved = true;
    }
    move(id: number, x: number, y: number, now: number): void {
        const pointer = this.pointers.get(id);
        if (!pointer) return;
        const previous = [...this.pointers.values()].map((value) => ({ x: value.x, y: value.y }));
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        pointer.x = x; pointer.y = y;
        if (Math.hypot(x - pointer.startX, y - pointer.startY) > 8) pointer.moved = true;
        if (this.pointers.size === 2) {
            const next = [...this.pointers.values()];
            const before = Math.hypot(previous[1].x - previous[0].x, previous[1].y - previous[0].y);
            const after = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
            const oldX = (previous[0].x + previous[1].x) / 2;
            const oldY = (previous[0].y + previous[1].y) / 2;
            this.zoom(before > 1 ? after / before : 1, oldX, oldY);
            this.pan((next[0].x + next[1].x) / 2 - oldX, (next[0].y + next[1].y) / 2 - oldY);
            this.velocityX = this.velocityY = 0;
        } else if (pointer.moved) {
            this.pan(dx, dy);
            const elapsed = Math.max(8, now - this.lastMoveAt) / 1000;
            this.velocityX = dx / elapsed; this.velocityY = dy / elapsed;
        }
        this.lastMoveAt = now;
    }
    end(id: number, now: number): MapPoint | null {
        const pointer = this.pointers.get(id);
        if (!pointer) return null;
        this.pointers.delete(id);
        if (now - this.lastMoveAt > 100 || this.pointers.size > 0) this.velocityX = this.velocityY = 0;
        return pointer.moved ? null : this.worldAt(pointer.x, pointer.y);
    }
    cancel(): void { this.pointers.clear(); this.velocityX = this.velocityY = 0; }
    step(dt: number): void {
        if (this.pointers.size > 0 || !Number.isFinite(dt) || dt <= 0) return;
        const elapsed = Math.min(0.05, dt);
        if (Math.hypot(this.velocityX, this.velocityY) < 5) { this.velocityX = this.velocityY = 0; return; }
        this.pan(this.velocityX * elapsed, this.velocityY * elapsed);
        const decay = Math.exp(-8 * elapsed);
        this.velocityX *= decay; this.velocityY *= decay;
    }
    private commit(x: number, y: number, scale: number): void {
        if (![x, y, scale].every(Number.isFinite)) return;
        const halfW = this.width / (scale * SLG_GRID_PIXELS) / 2;
        const halfH = this.height / (scale * SLG_GRID_PIXELS) / 2;
        const nextX = halfW * 2 >= SLG_MAP_W ? SLG_MAP_W / 2 : Math.min(SLG_MAP_W - halfW, Math.max(halfW, x));
        const nextY = halfH * 2 >= SLG_MAP_H ? SLG_MAP_H / 2 : Math.min(SLG_MAP_H - halfH, Math.max(halfH, y));
        if (nextX === this.x && nextY === this.y && scale === this.scale) return;
        this.x = nextX; this.y = nextY; this.scale = scale; this.version += 1;
    }
}
