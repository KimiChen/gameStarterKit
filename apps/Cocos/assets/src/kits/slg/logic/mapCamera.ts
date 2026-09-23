/** UI-space projection of CameraRig; world coordinates are grid units, input is design pixels. */
import { CameraRig } from "../../../logic/scene3d/cameraRig";
import { slgLodForScale, slgLodForScaleStable } from "../../../shared/kits/slg/api/worldmap/index";

export const SLG_GRID_PIXELS = 48;
export interface MapPoint { readonly x: number; readonly y: number }
export interface MapRect { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

export const mapLod = slgLodForScale;

/** Keeps the SLG API, projection and LOD policy; gesture state belongs to CameraRig. */
export class MapCamera {
    private readonly rig: CameraRig;
    /** 滞回后的当前 LOD（初始化取裸映射；之后只随越带迁移，不随阈值抖动）。 */
    private currentLod = mapLod(0.85);
    constructor(readonly width: number, readonly height: number,
        readonly mapWidth: number, readonly mapHeight: number, initialX?: number, initialY?: number) {
        this.rig = new CameraRig({
            center: { x: mapWidth / 2, y: mapHeight / 2 }, zoom: 0.85, minZoom: 0.12, maxZoom: 2,
            bounds: { minX: 0, minY: 0, maxX: mapWidth, maxY: mapHeight },
            projection: {
                offsetAt: (x, y, scale) => ({ x: x / (scale * SLG_GRID_PIXELS), y: y / (scale * SLG_GRID_PIXELS) }),
                panOffset: (dx, dy, scale) => ({ x: dx / (scale * SLG_GRID_PIXELS), y: dy / (scale * SLG_GRID_PIXELS) }),
                halfExtents: (scale) => ({ x: width / (scale * SLG_GRID_PIXELS) / 2, y: height / (scale * SLG_GRID_PIXELS) / 2 }),
            },
            motion: { dragThresholdPx: 8, minPinchDistancePx: 1, minMoveMs: 8, inertiaReleaseMs: 100,
                inertiaMinSpeedPx: 5, inertiaDecay: 8, maxStepSeconds: 0.05 },
            onChange: ({ zoom }) => { this.currentLod = slgLodForScaleStable(this.currentLod, zoom); },
        });
        if (Number.isFinite(initialX) && Number.isFinite(initialY)) this.rig.locate(initialX!, initialY!);
    }

    // Preserve the writable legacy fields (direct assignments historically bypass commit/LOD).
    get x(): number { return this.rig.x; }
    set x(value: number) { this.rig.x = value; }
    get y(): number { return this.rig.y; }
    set y(value: number) { this.rig.y = value; }
    get scale(): number { return this.rig.zoom; }
    set scale(value: number) { this.rig.zoom = value; }
    get version(): number { return this.rig.version; }
    set version(value: number) { this.rig.version = value; }
    /** 用户拖/滚过即置位；首开「落首个地标」只在未触碰时发生。 */
    get touched(): boolean { return this.rig.touched; }
    set touched(value: boolean) { this.rig.touched = value; }
    get lod(): number { return this.currentLod; }
    get pixelsPerGrid(): number { return this.scale * SLG_GRID_PIXELS; }
    get pointerCount(): number { return this.rig.pointerCount; }
    worldAt(x: number, y: number): MapPoint { return this.rig.worldAt(x, y); }
    visibleRect(): MapRect {
        const halfW = this.width / this.pixelsPerGrid / 2;
        const halfH = this.height / this.pixelsPerGrid / 2;
        return { minX: Math.max(0, Math.floor(this.x - halfW)), minY: Math.max(0, Math.floor(this.y - halfH)),
            maxX: Math.min(this.mapWidth - 1, Math.floor(this.x + halfW)), maxY: Math.min(this.mapHeight - 1, Math.floor(this.y + halfH)) };
    }
    pan(dx: number, dy: number): void { this.rig.pan(dx, dy); }
    locate(x: number, y: number): void { this.rig.locate(x, y); }
    zoom(factor: number, anchorX = 0, anchorY = 0): void { this.rig.zoomBy(factor, anchorX, anchorY); }
    start(id: number, x: number, y: number, now: number): void { this.rig.start(id, x, y, now); }
    move(id: number, x: number, y: number, now: number): void { this.rig.move(id, x, y, now); }
    end(id: number, now: number): MapPoint | null { return this.rig.end(id, now); }
    cancel(): void { this.rig.cancel(); }
    step(dt: number): void { this.rig.step(dt); }
}
