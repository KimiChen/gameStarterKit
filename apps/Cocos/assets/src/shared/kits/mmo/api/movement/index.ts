/**
 * mmo kit · `movement` api 面（shared，docs/MMO.md §7.2；MK1-B1）：移动意图与**双端同源**的权威积分 / 碰撞判定纯函数——服务端 mode 每固定步调
 * `resolveMove`，客户端预测器用同一函数、同一 stepMs 本地推进，再按服务端 `s2c.mmoWorld.pos` 回执的 seq 和解（§4.6-6：⛔ 客户端不上报坐标）。
 * 碰撞：内容包 `IMapDef.collision { cellSize, bitmap }`（'0' 通行 / '1' 阻挡，行优先，长度 = cols × rows）；撞墙先试轴向滑动，仍阻挡即停、清点地目标。
 * 插件只能 import 本门面；本面任何导出变化都要 bump `apps/kits/mmo/kit.json` 的 `api.movement.version`。
 */
import { TICK_MS } from "../../../../constants/game";

export interface IVec2 { readonly x: number; readonly y: number }
export interface IMapSize { readonly w: number; readonly h: number }

/** 移动意图：摇杆方向（分量 ∈ [-1, 1]，超出单位圆按长度归一）或点地目标（钳到图内）；seq 由客户端递增，回执按它和解。 */
export type IMoveIntent = { readonly seq: number; readonly dir: IVec2 } | { readonly seq: number; readonly target: IVec2 };

/** 点地到达阈值（世界单位）。 */
export const MMO_ARRIVE_EPSILON = 0.5;
/** 客户端预测步长 = 服务端固定步（WorldRoom 缺省 fixedStepMs = 框架 TICK_MS）；同源常量，⛔ 各自手写。 */
export const MMO_MOVE_STEP_MS = TICK_MS;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** 摇杆方向规范化：分量钳到 [-1, 1]，长度 > 1 归一；零向量原样（= 停）。 */
export function normalizeDir(dir: IVec2): IVec2 {
    const x = clamp(Number.isFinite(dir.x) ? dir.x : 0, -1, 1);
    const y = clamp(Number.isFinite(dir.y) ? dir.y : 0, -1, 1);
    const length = Math.hypot(x, y);
    if (length === 0) return { x: 0, y: 0 };
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** 常量速度积分（dir 按长度归一，零向量原地）。 */
export function integrate(pos: IVec2, dir: IVec2, speedPerSec: number, dtMs: number): IVec2 {
    const length = Math.hypot(dir.x, dir.y);
    if (length === 0 || speedPerSec <= 0 || dtMs <= 0) return { x: pos.x, y: pos.y };
    const step = (speedPerSec * dtMs) / 1000;
    return { x: pos.x + (dir.x / length) * step, y: pos.y + (dir.y / length) * step };
}

/** 钳到地图范围 [0, w] × [0, h]。 */
export function clampToMap(pos: IVec2, size: IMapSize): IVec2 {
    return { x: clamp(pos.x, 0, size.w), y: clamp(pos.y, 0, size.h) };
}

/** 碰撞网格（只读）。 */
export interface CollisionGrid {
    readonly cellSize: number;
    readonly cols: number;
    readonly rows: number;
    /** 世界坐标所在格是否阻挡（图边缘的最大坐标落在最后一格）。 */
    blocked(x: number, y: number): boolean;
}

export function collisionGridDims(size: IMapSize, cellSize: number): { readonly cols: number; readonly rows: number } {
    return { cols: Math.max(1, Math.ceil(size.w / cellSize)), rows: Math.max(1, Math.ceil(size.h / cellSize)) };
}

/** 解析内容包的碰撞位图；形态不合抛 RangeError（content validator 与启动期都会拦）；缺省（无 collision）= null（全图通行）。 */
export function parseCollisionGrid(collision: { readonly cellSize: number; readonly bitmap: string } | null | undefined, size: IMapSize): CollisionGrid | null {
    if (!collision) return null;
    const { cellSize, bitmap } = collision;
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError(`collision.cellSize ${cellSize} 非法`);
    const { cols, rows } = collisionGridDims(size, cellSize);
    if (bitmap.length !== cols * rows) throw new RangeError(`collision.bitmap 长度 ${bitmap.length} ≠ cols × rows = ${cols} × ${rows}`);
    if (!/^[01]*$/u.test(bitmap)) throw new RangeError("collision.bitmap 只允许 '0' / '1'");
    return {
        cellSize, cols, rows,
        blocked(x: number, y: number): boolean {
            const col = clamp(Math.floor(x / cellSize), 0, cols - 1);
            const row = clamp(Math.floor(y / cellSize), 0, rows - 1);
            return bitmap.charCodeAt(row * cols + col) === 49; // '1'
        },
    };
}

export interface MoveState {
    readonly x: number;
    readonly y: number;
    readonly dirX: number;
    readonly dirY: number;
    readonly target: IVec2 | null;
}

export interface MoveResult {
    readonly x: number;
    readonly y: number;
    /** 剩余点地目标（到达 / 被阻挡即清） */
    readonly target: IVec2 | null;
    readonly moved: boolean;
    readonly arrived: boolean;
    readonly blocked: boolean;
}

/** 把一条意图施加到状态：dir ⇒ 规范化方向、清目标；target ⇒ 钳到图内、清方向。 */
export function applyIntent(state: MoveState, intent: IMoveIntent, size: IMapSize): MoveState {
    if ("dir" in intent) {
        const dir = normalizeDir(intent.dir);
        return { x: state.x, y: state.y, dirX: dir.x, dirY: dir.y, target: null };
    }
    return { x: state.x, y: state.y, dirX: 0, dirY: 0, target: clampToMap(intent.target, size) };
}

/**
 * 一个固定步的权威积分（双端同源）：点地 ⇒ 朝目标直线走，reach 内即到达；摇杆 ⇒ 常量速度；钳图；撞墙 ⇒ 先试只走 x / 只走 y（滑动），
 * 仍阻挡 ⇒ 原地（点地目标随之清除，⛔ 撞墙空转）。
 */
export function resolveMove(state: MoveState, speedPerSec: number, dtMs: number, size: IMapSize, grid: CollisionGrid | null): MoveResult {
    const stay = (blocked: boolean, target: IVec2 | null): MoveResult => ({ x: state.x, y: state.y, target, moved: false, arrived: false, blocked });
    let desired: IVec2 | null = null;
    let arrived = false;
    let target = state.target;
    if (target) {
        const dx = target.x - state.x;
        const dy = target.y - state.y;
        const distance = Math.hypot(dx, dy);
        const reach = (speedPerSec * dtMs) / 1000;
        if (distance <= reach + MMO_ARRIVE_EPSILON) {
            desired = { x: target.x, y: target.y };
            arrived = true;
            target = null;
        } else {
            desired = integrate(state, { x: dx, y: dy }, speedPerSec, dtMs);
        }
    } else if (state.dirX !== 0 || state.dirY !== 0) {
        desired = integrate(state, { x: state.dirX, y: state.dirY }, speedPerSec, dtMs);
    }
    if (desired === null) return stay(false, target);
    const next = clampToMap(desired, size);
    const candidates = grid && grid.blocked(next.x, next.y)
        ? [{ x: next.x, y: state.y }, { x: state.x, y: next.y }].filter((candidate) => !grid.blocked(candidate.x, candidate.y))
        : [next];
    const chosen = candidates.find((candidate) => candidate.x !== state.x || candidate.y !== state.y);
    if (!chosen) return stay(true, null);
    const blocked = chosen !== next;
    return { x: chosen.x, y: chosen.y, target: blocked ? null : target, moved: true, arrived: arrived && !blocked, blocked };
}
