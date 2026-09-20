/**
 * mmo kit · `movement` api 面（客户端，docs/MMO.md §7.2；MK1-B1）：摇杆 → dir 意图（死区 + 限频合并）、点地 → target；本地预测
 * （与服务端同一 `resolveMove` / 同一 stepMs 推进）+ 按服务端 `s2c.mmoWorld.pos` 回执的 seq 和解（位置以回执为准；方向 / 目标保持最新意图）。
 * ⛔ 不上报坐标；⛔ 不 import cc（铁律 9）。本面任何导出变化都要 bump `api.movement.version`。
 */
import {
    MMO_MOVE_STEP_MS, applyIntent, normalizeDir, parseCollisionGrid, resolveMove, type CollisionGrid, type IMapSize, type IMoveIntent, type IVec2, type MoveState,
} from "../../../../shared/kits/mmo/api/movement/index";

export { MMO_MOVE_STEP_MS, applyIntent, normalizeDir, parseCollisionGrid, resolveMove };
export type { CollisionGrid, IMapSize, IMoveIntent, IVec2, MoveState };

/** 摇杆死区（归一化半径）。 */
export const JOYSTICK_DEADZONE = 0.15;
/** 方向意图最小发送间隔（ms）；方向变了立即发。 */
export const MOVE_INTENT_MIN_INTERVAL_MS = 100;

/** 摇杆位移（相对半径的 [-1, 1] 分量）→ 方向意图；死区内 = 停（零向量）。 */
export function dirFromJoystick(dx: number, dy: number, deadzone = JOYSTICK_DEADZONE): IVec2 {
    const dir = normalizeDir({ x: dx, y: dy });
    return Math.hypot(dir.x, dir.y) < deadzone ? { x: 0, y: 0 } : dir;
}

const key = (dir: IVec2): string => `${Math.round(dir.x * 100)}/${Math.round(dir.y * 100)}`;

/** 方向意图限频合并：方向（1% 粒度）变了立即发，否则每 minIntervalMs 一次；停（零向量）总是立即发一次。 */
export class IntentThrottle {
    private lastKey: string | null = null;
    private lastSentAt = Number.NEGATIVE_INFINITY;

    constructor(private readonly minIntervalMs = MOVE_INTENT_MIN_INTERVAL_MS) {}

    shouldSend(nowMs: number, dir: IVec2): boolean {
        const next = key(dir);
        const changed = next !== this.lastKey;
        const stopping = dir.x === 0 && dir.y === 0;
        if (!changed && (stopping || nowMs - this.lastSentAt < this.minIntervalMs)) return false;
        this.lastKey = next;
        this.lastSentAt = nowMs;
        return true;
    }

    reset(): void {
        this.lastKey = null;
        this.lastSentAt = Number.NEGATIVE_INFINITY;
    }
}

export interface MovementPredictorOptions {
    readonly speedPerSec: number;
    readonly size: IMapSize;
    readonly grid: CollisionGrid | null;
    readonly stepMs?: number;
}

/**
 * 本地预测器：意图入队并立即施加（dir / target 后者覆盖前者，所以本地状态里永远是最新意图的方向 / 目标）；按固定步用 `resolveMove` 推进；
 * 服务端回执 `{ seq, x, y }` 到达时位置以它为准、方向 / 目标不变（在途意图的效果已折叠在状态里，⛔ 需要重放）、丢弃 seq ≤ 回执的在途意图；
 * 比已确认 seq 更旧的回执忽略。
 */
export class MovementPredictor {
    private state: MoveState;
    private pending: IMoveIntent[] = [];
    private accumulatorMs = 0;
    private confirmedSeq = 0;
    private readonly stepMs: number;

    constructor(start: IVec2, private readonly options: MovementPredictorOptions) {
        this.state = { x: start.x, y: start.y, dirX: 0, dirY: 0, target: null };
        this.stepMs = options.stepMs ?? MMO_MOVE_STEP_MS;
    }

    position(): IVec2 {
        return { x: this.state.x, y: this.state.y };
    }

    get lastConfirmedSeq(): number {
        return this.confirmedSeq;
    }

    get pendingCount(): number {
        return this.pending.length;
    }

    push(intent: IMoveIntent): void {
        this.pending.push(intent);
        this.state = applyIntent(this.state, intent, this.options.size);
    }

    tick(dtMs: number): void {
        if (!Number.isFinite(dtMs) || dtMs <= 0) return;
        this.accumulatorMs += dtMs;
        while (this.accumulatorMs >= this.stepMs) {
            this.accumulatorMs -= this.stepMs;
            const result = resolveMove(this.state, this.options.speedPerSec, this.stepMs, this.options.size, this.options.grid);
            this.state = { ...this.state, x: result.x, y: result.y, target: result.target };
        }
    }

    /** 服务端回执：位置以它为准，方向 / 目标保持最新意图；seq ≤ 回执的在途意图已被服务端消费；比已确认更旧的回执忽略。 */
    reconcile(pos: { readonly seq: number; readonly x: number; readonly y: number }): void {
        if (pos.seq < this.confirmedSeq) return; // 迟到的旧回执
        this.confirmedSeq = pos.seq;
        this.pending = this.pending.filter((intent) => intent.seq > pos.seq);
        this.state = { x: pos.x, y: pos.y, dirX: this.state.dirX, dirY: this.state.dirY, target: this.state.target };
    }
}
