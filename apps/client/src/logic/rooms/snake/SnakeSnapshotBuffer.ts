/**
 * SnakeSnapshotBuffer（docs/snakeoff/04 §6.3）：世界快照的接受/缓冲/插值。
 *
 * 纯 logic（⛔ 不 import cc/fairygui/net）：
 *  - 接受条件：matchId 相等 && seq 严格大于最后接受 && tick 单调不回退；
 *    迟到/旧局快照直接丢弃（⛔ 不回退画面时钟）；
 *  - 缓冲两份快照，渲染按 tick 插值（渲染落后权威一个快照间隔 ≈100ms）；
 *  - 插值按 snake id 对齐；点位数不同时按较短者插值（降采样快照安全）。
 */

/** 快照形态（与 shared wire 的 ISnakeWorldSnapshot 结构对齐，logic 侧只读）。 */
export interface SnakeSnapshotPointLike {
    readonly x: number;
    readonly y: number;
}

export interface SnakeSnapshotSnakeLike {
    readonly id: string;
    readonly name: string;
    readonly skin: number;
    readonly ai: boolean;
    readonly alive: boolean;
    readonly score: number;
    readonly length: number;
    readonly boost: boolean;
    readonly points: readonly SnakeSnapshotPointLike[];
}

export interface SnakeSnapshotLike {
    readonly matchId: string;
    readonly tick: number;
    readonly seq: number;
    readonly snakes: readonly SnakeSnapshotSnakeLike[];
    readonly foods: readonly { readonly id: number; readonly kind: number; readonly x: number; readonly y: number }[];
    readonly wrecks: readonly { readonly id: number; readonly value: number; readonly x: number; readonly y: number }[];
}

/** 插值后的渲染帧（蛇点为世界坐标插值结果）。 */
export interface SnakeRenderSnake {
    readonly id: string;
    readonly name: string;
    readonly skin: number;
    readonly ai: boolean;
    readonly alive: boolean;
    readonly score: number;
    readonly length: number;
    readonly boost: boolean;
    readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>;
}

export interface SnakeRenderFrame {
    readonly tick: number;
    readonly snakes: readonly SnakeRenderSnake[];
    readonly foods: readonly { readonly id: number; readonly kind: number; readonly x: number; readonly y: number }[];
    readonly wrecks: readonly { readonly id: number; readonly value: number; readonly x: number; readonly y: number }[];
}

export class SnakeSnapshotBuffer {
    private matchId: string | null = null;
    private lastSeq = -1;
    private lastTick = -1;
    private previous: SnakeSnapshotLike | null = null;
    private latest: SnakeSnapshotLike | null = null;

    /** 当前对局 matchId（join 时由权威 state 写入；换局必须 reset）。 */
    attach(matchId: string): void {
        if (this.matchId !== matchId) this.reset(matchId);
    }

    reset(matchId: string | null = null): void {
        this.matchId = matchId;
        this.lastSeq = -1;
        this.lastTick = -1;
        this.previous = null;
        this.latest = null;
    }

    get ready(): boolean {
        return this.latest !== null;
    }

    /** 接受条件全过才入缓冲（04 §6.3）；返回是否接受。 */
    offer(snapshot: SnakeSnapshotLike): boolean {
        if (this.matchId === null || snapshot.matchId !== this.matchId) return false;
        if (snapshot.seq <= this.lastSeq) return false;
        if (snapshot.tick < this.lastTick) return false;
        this.previous = this.latest;
        this.latest = snapshot;
        this.lastSeq = snapshot.seq;
        this.lastTick = snapshot.tick;
        return true;
    }

    /**
     * 取渲染帧：在两份快照间按 tick 插值。`renderTick` 通常 = 最新 tick − 快照间隔
     * （10Hz 快照 = 2 tick）；早于前一份则钳在前一份，晚于最新则钳在最新。
     */
    sample(renderTick: number): SnakeRenderFrame | null {
        const latest = this.latest;
        if (!latest) return null;
        const previous = this.previous;
        if (!previous || renderTick >= latest.tick) return frameOf(latest, latest);
        if (renderTick <= previous.tick) return frameOf(previous, previous);
        const span = latest.tick - previous.tick;
        const alpha = span > 0 ? (renderTick - previous.tick) / span : 1;
        return frameOf(latest, latest, previous, alpha);
    }
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function frameOf(
    latest: SnakeSnapshotLike,
    base: SnakeSnapshotLike,
    previous?: SnakeSnapshotLike,
    alpha = 1,
): SnakeRenderFrame {
    const previousById = new Map<string, SnakeSnapshotSnakeLike>();
    if (previous) for (const snake of previous.snakes) previousById.set(snake.id, snake);
    const snakes: SnakeRenderSnake[] = latest.snakes.map((snake) => {
        const prior = previousById.get(snake.id);
        const points = snake.points.map((point, index) => {
            const old = prior?.points[index];
            if (!old || !snake.alive || !prior?.alive) return { x: point.x, y: point.y };
            return { x: lerp(old.x, point.x, alpha), y: lerp(old.y, point.y, alpha) };
        });
        return {
            id: snake.id,
            name: snake.name,
            skin: snake.skin,
            ai: snake.ai,
            alive: snake.alive,
            score: snake.score,
            length: snake.length,
            boost: snake.boost,
            points,
        };
    });
    return {
        tick: base.tick,
        snakes,
        foods: latest.foods,
        wrecks: latest.wrecks,
    };
}
