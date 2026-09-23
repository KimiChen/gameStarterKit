/** Engine-free gestures on a camera's two-dimensional movement plane. */
export interface CameraRigPoint { readonly x: number; readonly y: number }
export interface CameraRigBounds {
    readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
}

/**
 * The consumer maps zoom to its projection (pixels per grid, camera height/FOV, etc.).
 * Input uses design pixels relative to the viewport center. offsetAt is the world offset
 * from the center on the movement plane; halfExtents encloses the projected footprint.
 * The projection can be nonlinear in both input coordinates and zoom, but must translate
 * with the center. No engine or grid units live in the rig.
 */
export interface CameraRigProjection {
    offsetAt(x: number, y: number, zoom: number): CameraRigPoint;
    halfExtents(zoom: number): CameraRigPoint;
    /** Optional equivalent of offsetAt(anchor + delta) - offsetAt(anchor).
     * Affine adapters may compute directly from delta to preserve their rounding. */
    panOffset?(dx: number, dy: number, zoom: number, anchorX: number, anchorY: number): CameraRigPoint;
}

export interface CameraRigMotion {
    readonly dragThresholdPx: number;
    readonly minPinchDistancePx: number;
    readonly minMoveMs: number;
    readonly inertiaReleaseMs: number;
    readonly inertiaMinSpeedPx: number;
    readonly inertiaDecay: number;
    readonly maxStepSeconds: number;
}

export interface CameraRigState {
    readonly center: CameraRigPoint;
    readonly zoom: number;
    readonly version: number;
}

export interface CameraRigOptions {
    readonly center: CameraRigPoint;
    readonly zoom: number;
    readonly minZoom: number;
    readonly maxZoom: number;
    readonly projection: CameraRigProjection;
    readonly bounds?: CameraRigBounds;
    readonly motion: CameraRigMotion;
    /** Runs after each actual movement; e.g. a consumer can update its own LOD hysteresis. */
    readonly onChange?: (state: CameraRigState) => void;
}

interface Pointer { x: number; y: number; startX: number; startY: number; moved: boolean }

/**
 * Callers supply valid projection/configuration and explicit times (start/move/end in ms,
 * step in seconds). State fields stay writable for legacy camera adapters; gesture methods
 * alone perform clamping, change notification and version increments.
 */
export class CameraRig implements CameraRigState {
    x: number;
    y: number;
    zoom: number;
    version = 0;
    /** Pan/zoom intent sets this even at a bound; taps, locate and follow do not. */
    touched = false;
    private velocityX = 0;
    private velocityY = 0;
    private lastMoveAt = 0;
    private readonly pointers = new Map<number, Pointer>();
    private followTarget: CameraRigPoint | null = null;

    constructor(private readonly options: CameraRigOptions) {
        this.x = options.center.x;
        this.y = options.center.y;
        this.zoom = options.zoom;
    }

    get center(): CameraRigPoint { return { x: this.x, y: this.y }; }
    get pointerCount(): number { return this.pointers.size; }
    get following(): boolean { return this.followTarget !== null; }

    worldAt(x: number, y: number): CameraRigPoint {
        const offset = this.options.projection.offsetAt(x, y, this.zoom);
        return { x: this.x + offset.x, y: this.y + offset.y };
    }

    pan(dx: number, dy: number): void {
        this.panFrom(dx, dy, 0, 0);
    }

    private panFrom(dx: number, dy: number, anchorX: number, anchorY: number): void {
        this.touched = true;
        this.followTarget = null;
        const projection = this.options.projection;
        let offset: CameraRigPoint;
        if (projection.panOffset) offset = projection.panOffset(dx, dy, this.zoom, anchorX, anchorY);
        else {
            const before = projection.offsetAt(anchorX, anchorY, this.zoom);
            const after = projection.offsetAt(anchorX + dx, anchorY + dy, this.zoom);
            offset = { x: after.x - before.x, y: after.y - before.y };
        }
        this.commit(this.x - offset.x, this.y - offset.y, this.zoom);
    }

    /** Navigation preserves zoom, clears gestures/inertia and leaves follow mode. */
    locate(x: number, y: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.cancel();
        this.commit(x, y, this.zoom);
    }

    /** Wheel adapters pass their chosen factor here; pinch uses the same anchored path. */
    zoomBy(factor: number, anchorX = 0, anchorY = 0): void {
        if (!Number.isFinite(factor) || factor <= 0) return;
        this.touched = true;
        this.followTarget = null;
        const anchor = this.worldAt(anchorX, anchorY);
        const zoom = Math.min(this.options.maxZoom, Math.max(this.options.minZoom, this.zoom * factor));
        const offset = this.options.projection.offsetAt(anchorX, anchorY, zoom);
        this.commit(anchor.x - offset.x, anchor.y - offset.y, zoom);
    }

    start(id: number, x: number, y: number, now: number): void {
        if (this.pointers.has(id) || this.pointers.size >= 2) return;
        this.followTarget = null;
        this.velocityX = this.velocityY = 0;
        this.lastMoveAt = now;
        this.pointers.set(id, { x, y, startX: x, startY: y, moved: false });
        if (this.pointers.size > 1) for (const pointer of this.pointers.values()) pointer.moved = true;
    }

    move(id: number, x: number, y: number, now: number): void {
        const pointer = this.pointers.get(id);
        if (!pointer) return;
        const previous = [...this.pointers.values()].map((value) => ({ x: value.x, y: value.y }));
        const previousX = pointer.x, previousY = pointer.y;
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        pointer.x = x; pointer.y = y;
        if (Math.hypot(x - pointer.startX, y - pointer.startY) > this.options.motion.dragThresholdPx) pointer.moved = true;
        if (this.pointers.size === 2) {
            const next = [...this.pointers.values()];
            const before = Math.hypot(previous[1].x - previous[0].x, previous[1].y - previous[0].y);
            const after = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
            const oldX = (previous[0].x + previous[1].x) / 2;
            const oldY = (previous[0].y + previous[1].y) / 2;
            this.zoomBy(before > this.options.motion.minPinchDistancePx ? after / before : 1, oldX, oldY);
            this.panFrom((next[0].x + next[1].x) / 2 - oldX, (next[0].y + next[1].y) / 2 - oldY, oldX, oldY);
            this.velocityX = this.velocityY = 0;
        } else if (pointer.moved) {
            this.panFrom(dx, dy, previousX, previousY);
            const elapsed = Math.max(this.options.motion.minMoveMs, now - this.lastMoveAt) / 1000;
            this.velocityX = dx / elapsed; this.velocityY = dy / elapsed;
        }
        this.lastMoveAt = now;
    }

    end(id: number, now: number): CameraRigPoint | null {
        const pointer = this.pointers.get(id);
        if (!pointer) return null;
        this.pointers.delete(id);
        if (now - this.lastMoveAt > this.options.motion.inertiaReleaseMs || this.pointers.size > 0) {
            this.velocityX = this.velocityY = 0;
        }
        return pointer.moved ? null : this.worldAt(pointer.x, pointer.y);
    }

    /** Full stop for lifecycle cancellation, including any live follow target. */
    cancel(): void {
        this.pointers.clear();
        this.velocityX = this.velocityY = 0;
        this.followTarget = null;
    }

    /**
     * Follow a live point by reference: snap now, then sample it on each positive step.
     * No smoothing or zoom changes. null stops following; manual gestures/locate/cancel
     * also exit. Invalid samples leave the last valid center intact without losing target.
     */
    follow(target: CameraRigPoint | null): void {
        this.cancel();
        this.followTarget = target;
        if (target) this.commit(target.x, target.y, this.zoom);
    }

    step(dt: number): void {
        if (this.pointers.size > 0 || !Number.isFinite(dt) || dt <= 0) return;
        if (this.followTarget) {
            this.commit(this.followTarget.x, this.followTarget.y, this.zoom);
            return;
        }
        const elapsed = Math.min(this.options.motion.maxStepSeconds, dt);
        if (Math.hypot(this.velocityX, this.velocityY) < this.options.motion.inertiaMinSpeedPx) {
            this.velocityX = this.velocityY = 0;
            return;
        }
        this.pan(this.velocityX * elapsed, this.velocityY * elapsed);
        const decay = Math.exp(-this.options.motion.inertiaDecay * elapsed);
        this.velocityX *= decay; this.velocityY *= decay;
    }

    private commit(x: number, y: number, zoom: number): void {
        if (![x, y, zoom].every(Number.isFinite)) return;
        const bounds = this.options.bounds;
        if (bounds) {
            const half = this.options.projection.halfExtents(zoom);
            const width = bounds.maxX - bounds.minX, height = bounds.maxY - bounds.minY;
            x = half.x * 2 >= width ? bounds.minX + width / 2 : Math.min(bounds.maxX - half.x, Math.max(bounds.minX + half.x, x));
            y = half.y * 2 >= height ? bounds.minY + height / 2 : Math.min(bounds.maxY - half.y, Math.max(bounds.minY + half.y, y));
        }
        if (x === this.x && y === this.y && zoom === this.zoom) return;
        this.x = x; this.y = y; this.zoom = zoom;
        this.version += 1;
        this.options.onChange?.(this);
    }
}
