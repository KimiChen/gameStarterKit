/**
 * RefreshCoordinator（Non-intrusive §7.2/§7.3 阶段 5b）：合并 foreground、reconnect、
 * reopen 等并发刷新原因，只刷新当前 authenticated base feature/session controller。
 *
 * flight key 四维（§7.3）：**app generation** + route-handle generation +
 * session generation + connection/recovery epoch。同 key 并发只合流**当前 flight**；
 * flight settle 后允许下一次正常刷新。
 *
 * dirty 位三条硬语义（§7.3，逐字落实）：
 *  1. dirty 只能在**实际发出请求的那一刻**清除——提前清会冒领之后的变更，延后清
 *     会抹掉窗口内的变更；
 *  2. 「最多一次 trailing」按 **flight 计且递归**：每个 flight（trailing 自身也算）
 *     settle 时若 dirty 仍置位，必须再排一次刷新；
 *  3. 刷新失败必须把 dirty 重新置位，由下一次 ready/foreground（trigger）触发重试，
 *     ⛔ 不允许静默丢弃。
 *
 * 背压：同 key 连续刷新有最小间隔 + 失败指数退避；退避期内变脏只置 dirty 不开新
 * flight；退避上限内仍失败 → 标记 stale + 只接受手动重试（retryStale），⛔ 不静默
 * 空转。本模块不自建定时器轮询——所有推进都由显式调用（request/trigger/settle 的
 * trailing 调度）驱动，trailing 的最小间隔经可注入 scheduler 延迟执行。
 */

export interface RefreshFlightKey {
    readonly appGeneration: number;
    readonly routeGeneration: number;
    readonly sessionGeneration: number;
    readonly connectionEpoch: number;
}

export type RefreshTask<T> = () => Promise<T>;

interface KeyState {
    flight: Promise<unknown> | null;
    /** 当前 flight 结算后是否需要 trailing 的任务（markDirty 保存最新任务）。 */
    task: RefreshTask<unknown> | null;
    dirty: boolean;
    lastStartAt: number;
    failureStreak: number;
    backoffUntil: number;
    stale: boolean;
    /** 已排定但尚未启动的 trailing 定时器取消器。 */
    cancelTrailing: (() => void) | null;
}

export interface RefreshCoordinatorOptions {
    readonly now?: () => number;
    /** 同 key 两次刷新的最小间隔（毫秒）。 */
    readonly minIntervalMs?: number;
    readonly backoffBaseMs?: number;
    readonly backoffMaxMs?: number;
    /** 连续失败达到该值 → stale（手动重试才恢复）。 */
    readonly maxFailureStreak?: number;
    /** trailing 延迟调度 seam（默认 setTimeout；测试注入手动 scheduler）。 */
    readonly schedule?: (callback: () => void, delayMs: number) => () => void;
}

const DEFAULT_MIN_INTERVAL_MS = 1_000;
const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_MAX_MS = 30_000;
const DEFAULT_MAX_FAILURE_STREAK = 3;

function keyOf(key: RefreshFlightKey): string {
    return `${key.appGeneration}/${key.routeGeneration}/${key.sessionGeneration}/${key.connectionEpoch}`;
}

export class RefreshCoordinator {
    private readonly states = new Map<string, KeyState>();
    private readonly now: () => number;
    private readonly minIntervalMs: number;
    private readonly backoffBaseMs: number;
    private readonly backoffMaxMs: number;
    private readonly maxFailureStreak: number;
    private readonly schedule: (callback: () => void, delayMs: number) => () => void;

    constructor(options: RefreshCoordinatorOptions = {}) {
        this.now = options.now ?? (() => Date.now());
        this.minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
        this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
        this.backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
        this.maxFailureStreak = options.maxFailureStreak ?? DEFAULT_MAX_FAILURE_STREAK;
        this.schedule = options.schedule ?? ((callback, delayMs) => {
            const timer = setTimeout(callback, delayMs);
            return () => clearTimeout(timer);
        });
    }

    private stateOf(key: RefreshFlightKey): KeyState {
        const id = keyOf(key);
        let state = this.states.get(id);
        if (!state) {
            state = {
                flight: null,
                task: null,
                dirty: false,
                lastStartAt: -Infinity,
                failureStreak: 0,
                backoffUntil: -Infinity,
                stale: false,
                cancelTrailing: null,
            };
            this.states.set(id, state);
        }
        return state;
    }

    /**
     * 显式请求一次刷新（如断线对账的 GetInfo）：同 key 已有 flight 直接合流返回；
     * 否则立即启动。显式请求不受 dirty 门控（它自己就是刷新原因）。
     */
    request<T>(key: RefreshFlightKey, task: RefreshTask<T>): Promise<T> {
        const state = this.stateOf(key);
        if (state.flight) return state.flight as Promise<T>;
        return this.startFlight(key, state, task);
    }

    /**
     * 变脏：flight 进行中只置位（settle 时 trailing）；空闲时置位待 trigger。
     * 保存最新任务供 trailing/trigger 复用。
     */
    markDirty<T>(key: RefreshFlightKey, task?: RefreshTask<T>): void {
        const state = this.stateOf(key);
        state.dirty = true;
        if (task) state.task = task as RefreshTask<unknown>;
    }

    /**
     * 外部触发（ready/foreground/reconnected）：只有 dirty 且不在退避/最小间隔窗口
     * 且非 stale 时才启动新 flight。窗口内的变脏保持 dirty，⛔ 不丢弃。
     */
    trigger(key: RefreshFlightKey): Promise<unknown> | null {
        const state = this.stateOf(key);
        if (!state.dirty || state.stale || state.flight) return state.flight;
        const task = state.task;
        if (!task) return null;
        const now = this.now();
        if (now < state.backoffUntil) return null;
        if (now - state.lastStartAt < this.minIntervalMs) return null;
        return this.startFlight(key, state, task);
    }

    isStale(key: RefreshFlightKey): boolean {
        return this.stateOf(key).stale;
    }

    /** 手动重试（stale 占位的重试按钮）：清 stale/退避后立即启动。 */
    retryStale<T>(key: RefreshFlightKey, task?: RefreshTask<T>): Promise<T> {
        const state = this.stateOf(key);
        state.stale = false;
        state.failureStreak = 0;
        state.backoffUntil = -Infinity;
        const effective = (task ?? state.task) as RefreshTask<T> | null;
        if (!effective) return Promise.reject(new Error("[RefreshCoordinator] 没有可重试的刷新任务"));
        if (state.flight) return state.flight as Promise<T>;
        return this.startFlight(key, state, effective);
    }

    private startFlight<T>(key: RefreshFlightKey, state: KeyState, task: RefreshTask<T>): Promise<T> {
        state.cancelTrailing?.();
        state.cancelTrailing = null;
        // 语义 1：dirty 在实际发出请求的那一刻清除（任务同步启动之前的置位归本次冒领，
        // 启动之后的置位归 trailing）。
        state.dirty = false;
        state.task = task as RefreshTask<unknown>;
        state.lastStartAt = this.now();
        const flight = Promise.resolve().then(task);
        state.flight = flight;
        flight.then(
            () => {
                if (state.flight === flight) state.flight = null;
                state.failureStreak = 0;
                state.backoffUntil = -Infinity;
                // 语义 2：flight settle 时 dirty 仍置位 → 再排一次（trailing 自身也是
                // flight，递归适用）。
                this.scheduleTrailing(key, state);
            },
            () => {
                if (state.flight === flight) state.flight = null;
                // 语义 3：失败重新置 dirty，由下一次 trigger 重试；退避上限 → stale。
                state.dirty = true;
                state.failureStreak++;
                const exponent = Math.min(state.failureStreak - 1, 30);
                const backoff = Math.min(this.backoffBaseMs * Math.pow(2, exponent), this.backoffMaxMs);
                state.backoffUntil = this.now() + backoff;
                if (state.failureStreak >= this.maxFailureStreak) {
                    state.stale = true;
                }
            },
        );
        return flight;
    }

    private scheduleTrailing(key: RefreshFlightKey, state: KeyState): void {
        if (!state.dirty || state.stale || state.flight) return;
        const task = state.task;
        if (!task) return;
        const wait = Math.max(0, state.lastStartAt + this.minIntervalMs - this.now());
        state.cancelTrailing?.();
        const cancel = this.schedule(() => {
            if (state.cancelTrailing === cancel) state.cancelTrailing = null;
            if (!state.dirty || state.stale || state.flight) return;
            const trailingTask = state.task;
            if (!trailingTask) return;
            void this.startFlight(key, state, trailingTask).catch(() => {
                // 失败路径已在 startFlight 的 settle 分支重置 dirty/退避；这里只观察。
            });
        }, wait);
        state.cancelTrailing = cancel;
    }
}
