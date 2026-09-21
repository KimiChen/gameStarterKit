/**
 * 等距六边形地图相机。世界坐标是**世界像素**（float64，96k 量级精度绰绰有余），
 * 输入是设计像素。⛔ 不依赖引擎，⛔ 不依赖全局时钟。
 *
 * ⚠ 可玩区是世界包围盒的**内接菱形**，所以钳位不能只钳包围盒：
 * 每次提交都把中心换算成格、钳进 [0,rows)×[0,cols)、再换算回世界像素，
 * 这样相机永远悬在一个合法格上，⛔ 不会飘到菱形外的四角。
 */
import {
    SGZZ_MAP_COLS, SGZZ_MAP_ROWS, SGZZ_SCALE_INITIAL, SGZZ_SCALE_MAX, SGZZ_SCALE_MIN,
    SGZZ_TILE_HALF_H, SGZZ_TILE_HALF_W,
    sgzzClampGrid, sgzzGrid2Pos, sgzzLodForScale, sgzzLodForScaleStable, sgzzPos2GridRaw,
} from "../../../shared/kits/sgzzmap/api/hexmap/index";

export interface SgzzPoint { readonly x: number; readonly y: number }
export interface SgzzCellRef { readonly row: number; readonly col: number }
interface Pointer { x: number; y: number; startX: number; startY: number; moved: boolean }

/** 判定「拖动」而非「点击」的位移阈值（设计像素）。 */
export const SGZZ_TAP_SLOP = 8;

export class SgzzCamera {
    /** 视口中心所在的世界坐标。 */
    x = 0;
    y = 0;
    scale = SGZZ_SCALE_INITIAL;
    /** 只有真的移动过才自增；渲染层据此决定要不要重建。 */
    version = 0;
    touched = false;
    private currentLod = sgzzLodForScale(SGZZ_SCALE_INITIAL);
    private velocityX = 0;
    private velocityY = 0;
    private lastMoveAt = 0;
    private readonly pointers = new Map<number, Pointer>();

    constructor(
        public width: number, public height: number,
        readonly rows = SGZZ_MAP_ROWS, readonly cols = SGZZ_MAP_COLS,
    ) {
        const centre = sgzzGrid2Pos(Math.floor(rows / 2), Math.floor(cols / 2));
        this.x = centre.x;
        this.y = centre.y;
    }

    get lod(): number { return this.currentLod; }
    get pointerCount(): number { return this.pointers.size; }

    /** 屏幕像素（左上原点，y 向下）→ 世界坐标（y 向上）。 */
    worldAt(sx: number, sy: number): SgzzPoint {
        return {
            x: this.x + (sx - this.width / 2) / this.scale,
            y: this.y - (sy - this.height / 2) / this.scale,
        };
    }
    /** 世界坐标 → 屏幕像素。 */
    screenAt(wx: number, wy: number): SgzzPoint {
        return {
            x: (wx - this.x) * this.scale + this.width / 2,
            y: (this.y - wy) * this.scale + this.height / 2,
        };
    }
    /** 屏幕像素落在哪一格（已钳进图内）。 */
    cellAt(sx: number, sy: number): SgzzCellRef {
        const w = this.worldAt(sx, sy);
        const raw = sgzzPos2GridRaw(w.x, w.y);
        return sgzzClampGrid(raw.row, raw.col, this.rows, this.cols);
    }
    /** 视口中心所在的格。 */
    centreCell(): SgzzCellRef {
        const raw = sgzzPos2GridRaw(this.x, this.y);
        return sgzzClampGrid(raw.row, raw.col, this.rows, this.cols);
    }

    resize(width: number, height: number): void {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
        if (width === this.width && height === this.height) return;
        this.width = width; this.height = height;
        this.commit(this.x, this.y, this.scale, true);
    }

    pan(dx: number, dy: number): void {
        this.touched = true;
        this.commit(this.x - dx / this.scale, this.y + dy / this.scale, this.scale);
    }

    /** 跳转到某格：保持缩放，并且⛔ 不能让上一段拖拽的惯性继续跑。 */
    locate(row: number, col: number): void {
        const clamped = sgzzClampGrid(row, col, this.rows, this.cols);
        const p = sgzzGrid2Pos(clamped.row, clamped.col);
        this.cancel();
        this.commit(p.x, p.y, this.scale);
    }

    /** 以屏幕某点为锚缩放：锚点下的世界位置保持不动。 */
    zoom(factor: number, anchorX = this.width / 2, anchorY = this.height / 2): void {
        if (!Number.isFinite(factor) || factor <= 0) return;
        this.touched = true;
        const anchor = this.worldAt(anchorX, anchorY);
        const scale = Math.min(SGZZ_SCALE_MAX, Math.max(SGZZ_SCALE_MIN, this.scale * factor));
        this.commit(
            anchor.x - (anchorX - this.width / 2) / scale,
            anchor.y + (anchorY - this.height / 2) / scale,
            scale,
        );
    }

    start(id: number, x: number, y: number, now: number): void {
        if (this.pointers.has(id) || this.pointers.size >= 2) return;
        this.velocityX = this.velocityY = 0;
        this.lastMoveAt = now;
        this.pointers.set(id, { x, y, startX: x, startY: y, moved: false });
        // 第二指按下的瞬间，两指都不再算「点击」
        if (this.pointers.size > 1) for (const p of this.pointers.values()) p.moved = true;
    }

    move(id: number, x: number, y: number, now: number): void {
        const pointer = this.pointers.get(id);
        if (!pointer) return;
        const previous = [...this.pointers.values()].map((v) => ({ x: v.x, y: v.y }));
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        pointer.x = x; pointer.y = y;
        if (Math.hypot(x - pointer.startX, y - pointer.startY) > SGZZ_TAP_SLOP) pointer.moved = true;
        if (this.pointers.size === 2) {
            const next = [...this.pointers.values()];
            const before = Math.hypot(previous[1].x - previous[0].x, previous[1].y - previous[0].y);
            const after = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
            const oldX = (previous[0].x + previous[1].x) / 2;
            const oldY = (previous[0].y + previous[1].y) / 2;
            this.zoom(before > 1 ? after / before : 1, oldX, oldY);
            this.pan((next[0].x + next[1].x) / 2 - oldX, (next[0].y + next[1].y) / 2 - oldY);
            this.velocityX = this.velocityY = 0;   // 捏合不留惯性
        } else if (pointer.moved) {
            this.pan(dx, dy);
            const elapsed = Math.max(8, now - this.lastMoveAt) / 1000;
            this.velocityX = dx / elapsed; this.velocityY = dy / elapsed;
        }
        this.lastMoveAt = now;
    }

    /** 抬指：没拖动过就当点击，返回那一格；否则 null。 */
    end(id: number, now: number): SgzzCellRef | null {
        const pointer = this.pointers.get(id);
        if (!pointer) return null;
        this.pointers.delete(id);
        if (now - this.lastMoveAt > 100 || this.pointers.size > 0) this.velocityX = this.velocityY = 0;
        return pointer.moved ? null : this.cellAt(pointer.x, pointer.y);
    }

    cancel(): void { this.pointers.clear(); this.velocityX = this.velocityY = 0; }

    /** 惯性。⚠ dt 要钳住：切后台回来一次 dt 可能是好几秒。 */
    step(dt: number): void {
        if (this.pointers.size > 0 || !Number.isFinite(dt) || dt <= 0) return;
        const elapsed = Math.min(0.05, dt);
        if (Math.hypot(this.velocityX, this.velocityY) < 5) { this.velocityX = this.velocityY = 0; return; }
        this.pan(this.velocityX * elapsed, this.velocityY * elapsed);
        const decay = Math.exp(-8 * elapsed);
        this.velocityX *= decay; this.velocityY *= decay;
    }

    private commit(x: number, y: number, scale: number, force = false): void {
        if (![x, y, scale].every(Number.isFinite)) return;
        // ★ 钳位走「世界→格→钳→世界」，保证中心永远在可玩菱形内
        const raw = sgzzPos2GridRaw(x, y);
        const cell = sgzzClampGrid(raw.row, raw.col, this.rows, this.cols);
        const snapped = sgzzGrid2Pos(cell.row, cell.col);
        const dx = x - sgzzGrid2Pos(raw.row, raw.col).x;
        const dy = y - sgzzGrid2Pos(raw.row, raw.col).y;
        const nextX = cell.row === raw.row && cell.col === raw.col ? x : snapped.x + Math.max(-SGZZ_TILE_HALF_W, Math.min(SGZZ_TILE_HALF_W, dx));
        const nextY = cell.row === raw.row && cell.col === raw.col ? y : snapped.y + Math.max(-SGZZ_TILE_HALF_H, Math.min(SGZZ_TILE_HALF_H, dy));
        if (!force && nextX === this.x && nextY === this.y && scale === this.scale) return;
        this.x = nextX; this.y = nextY; this.scale = scale;
        this.currentLod = sgzzLodForScaleStable(this.currentLod, scale);
        this.version += 1;
    }
}

/**
 * 根节点局部坐标 ↔ 相机坐标。⚠ 这一段曾经写错过，真机上表现为「点哪都选到屏幕外的格」。
 *
 * 三套坐标系，⛔ 别混：
 *  - **UI 坐标**（`event.getUILocation()`）：原点在**左下**，x∈[0,W]、y∈[0,H]，y 向上；
 *  - **根局部**（`UITransform.convertToNodeSpaceAR`）：原点在**屏幕中心**，y 向上；
 *  - **相机坐标**（`SgzzCamera.worldAt/screenAt`）：原点在**地图区左上**，y 向**下**，
 *    尺寸是地图区的 (layerWidth, mapTop−mapBottom)。
 */
export function sgzzRootLocalToCamera(lx: number, ly: number,
                                      layerWidth: number, mapTop: number, mapBottom: number): SgzzPoint {
    const centre = (mapTop + mapBottom) / 2;
    return { x: lx + layerWidth / 2, y: (mapTop - mapBottom) / 2 - (ly - centre) };
}
/** 相机坐标 → 根局部（摆选中框、浮层用）。与 sgzzRootLocalToCamera 互逆。 */
export function sgzzCameraToRootLocal(sx: number, sy: number,
                                      layerWidth: number, mapTop: number, mapBottom: number): SgzzPoint {
    const centre = (mapTop + mapBottom) / 2;
    return { x: sx - layerWidth / 2, y: centre + (mapTop - mapBottom) / 2 - sy };
}
