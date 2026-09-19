/**
 * WorldRuntime（MMO MF4-B5，docs/MMO.md §4.5 / §4.6-5）：**无头**模拟宿主——注入时钟、固定步累积 + catch-up 上限（自 GameRoom
 * `stepFixed` / `update` 抽出）、有序命令队列、生命周期状态机 `Recovering → Active → Draining → Offline`、空实例三策略与检查点节拍。
 * ⛔ 不 import `colyseus` / `@colyseus/*`（机检 rooms-core-headless-import.test.ts）；⛔ 不持 client 引用；全部规则可在无 Colyseus 进程内重放。
 * 传输壳（MF4-B6 WorldRoom）只做：喂 `enqueue`、按 tick 调 `advance`、用 `ports` 把出站落到真实连接、把租约失效映射成 `drain`。
 */
import { SeededRandom, WorldPhase, type GameplayS2CToken, type WorldPhaseType } from "@game/shared";
import type { WorldManifestConfig } from "../../../tools/gameplay-codegen/manifestSchema";
import type {
    WorldAdmitRequest, WorldCheckpoint, WorldCommand, WorldLeaveReason, WorldMode, WorldModeContext, WorldSessionInfo, WorldStateLifecycle,
} from "../WorldMode";

/** 与 GameRoom 同值：极端停顿最多补 120 步，超出丢弃 backlog（⛔ 不让一次 wall-clock gap 卡死循环）。 */
export const WORLD_MAX_CATCH_UP_STEPS = 120;

export interface WorldRuntimePorts {
    sendS2C(session: string, token: GameplayS2CToken<unknown>, payload: unknown): void;
    broadcastS2C(token: GameplayS2CToken<unknown>, payload: unknown): void;
    /** mode 经 context.requestDrain 请求 Draining 时回调（壳据此走同一状态机；缺省直接 drain）。 */
    onDrainRequested?(reason: string): void;
}

export interface WorldRuntimeOptions<TState extends WorldStateLifecycle> {
    readonly mode: WorldMode<TState>;
    readonly state: TState;
    readonly sId: number;
    readonly fixedStepMs: number;
    readonly seed: number;
    /** 注入时钟（ms）；无头单测用假时钟。 */
    readonly now: () => number;
    readonly world: WorldManifestConfig;
    readonly ports: WorldRuntimePorts;
    readonly maxCatchUpSteps?: number;
}

export interface WorldRecoverInfo {
    readonly instanceId: string;
    readonly mapId: string;
    readonly line: number;
    readonly authorityEpoch: number;
    readonly snapshot: WorldCheckpoint | null;
}

export type WorldEmptyAction = "none" | "slept" | "unloaded";

export class WorldRuntime<TState extends WorldStateLifecycle = WorldStateLifecycle> {
    private readonly mode: WorldMode<TState>;
    private readonly state: TState;
    private readonly ports: WorldRuntimePorts;
    private readonly world: WorldManifestConfig;
    private readonly now: () => number;
    private readonly maxCatchUpSteps: number;
    private readonly rng: SeededRandom;
    private readonly sessionTable = new Map<string, WorldSessionInfo>();
    private readonly commandQueue: WorldCommand[] = [];
    private accumulatorMs = 0;
    private sleeping = false;
    private emptySince: number | null = null;
    private lastCheckpointAt: number;
    private drainReason: string | null = null;
    readonly sId: number;
    readonly fixedStepMs: number;

    constructor(options: WorldRuntimeOptions<TState>) {
        if (!Number.isFinite(options.fixedStepMs) || options.fixedStepMs <= 0) throw new RangeError("[WorldRuntime] fixedStepMs 必须 > 0");
        if (!Number.isSafeInteger(options.sId) || options.sId < 0) throw new RangeError("[WorldRuntime] sId 非法");
        this.mode = options.mode;
        this.state = options.state;
        this.ports = options.ports;
        this.world = options.world;
        this.now = options.now;
        this.sId = options.sId;
        this.fixedStepMs = options.fixedStepMs;
        this.maxCatchUpSteps = options.maxCatchUpSteps ?? WORLD_MAX_CATCH_UP_STEPS;
        this.rng = SeededRandom.stream(options.seed >>> 0, "world");
        this.lastCheckpointAt = this.now();
        this.state.phase = WorldPhase.Recovering;
        this.emptySince = this.now();
    }

    get phase(): WorldPhaseType {
        return this.state.phase;
    }

    get tick(): number {
        return this.state.tick;
    }

    get isSleeping(): boolean {
        return this.sleeping;
    }

    get pendingCommands(): number {
        return this.commandQueue.length;
    }

    sessions(): readonly WorldSessionInfo[] {
        return [...this.sessionTable.values()];
    }

    sessionOf(session: string): WorldSessionInfo | null {
        return this.sessionTable.get(session) ?? null;
    }

    /** mode 看到的上下文（闭包转发到当前流 / 表，⛔ 不是快照）。 */
    context(): WorldModeContext<TState> {
        return {
            state: this.state,
            sId: this.sId,
            instanceId: this.state.instanceId,
            mapId: this.state.mapId,
            line: this.state.line,
            authorityEpoch: this.state.authorityEpoch,
            fixedStepMs: this.fixedStepMs,
            random: { next: () => this.rng.next(), nextInt: (min, max) => this.rng.nextInt(min, max) },
            sessions: () => this.sessions(),
            sessionOf: (session) => this.sessionOf(session),
            sendS2C: (session, token, payload) => this.ports.sendS2C(session, token as GameplayS2CToken<unknown>, payload),
            broadcastS2C: (token, payload) => this.ports.broadcastS2C(token as GameplayS2CToken<unknown>, payload),
            requestDrain: (reason) => {
                if (this.ports.onDrainRequested) this.ports.onDrainRequested(reason);
                else this.drain(reason, 0);
            },
        };
    }

    /**
     * Recovering：写分线元数据（权威 epoch 由壳先经 control.acquireAuthority 取得）→ onWorldInit → 有检查点则 onRestore → Active。
     * 只能从 Recovering 调一次；失败保持 Recovering（壳据此拒准入并释放租约）。
     */
    async recover(info: WorldRecoverInfo): Promise<void> {
        if (this.state.phase !== WorldPhase.Recovering) throw new Error(`[WorldRuntime] recover 只能在 Recovering 调（当前 ${this.state.phase}）`);
        if (!Number.isSafeInteger(info.authorityEpoch) || info.authorityEpoch < 1) throw new RangeError("[WorldRuntime] authorityEpoch 必须 ≥ 1（先取权威）");
        this.state.instanceId = info.instanceId;
        this.state.mapId = info.mapId;
        this.state.line = info.line;
        this.state.authorityEpoch = info.authorityEpoch;
        await this.mode.onWorldInit(this.context(), { recovered: info.snapshot !== null });
        if (info.snapshot !== null) this.mode.onRestore?.(this.context(), info.snapshot);
        this.state.phase = WorldPhase.Active;
        this.lastCheckpointAt = this.now();
        this.emptySince = this.now();
    }

    /** 异步预热（唯一允许 await 的准入钩子；⛔ 分配资源）。 */
    async beforeAdmit(request: WorldAdmitRequest): Promise<void> {
        await this.mode.onBeforeAdmit?.(this.context(), request);
    }

    /**
     * 同步准入：只在 Active、未满员、会话未在座、同 persona 未在座；mode.onAdmit 返回 false 拒。
     * 通过即落座（会话表是名册真源）并 onEnter；睡眠中的实例被唤醒。
     */
    admit(request: WorldAdmitRequest): "admitted" | "draining" | "not-active" | "full" | "duplicate" | "refused" {
        if (this.state.phase === WorldPhase.Draining || this.state.phase === WorldPhase.Offline) return "draining";
        if (this.state.phase !== WorldPhase.Active) return "not-active";
        if (this.sessionTable.size >= this.mode.capacity) return "full";
        if (this.sessionTable.has(request.session)) return "duplicate";
        for (const seated of this.sessionTable.values()) {
            if (seated.personaId === request.personaId) return "duplicate";
        }
        if (this.mode.onAdmit && this.mode.onAdmit(this.context(), request) === false) return "refused";
        const info: WorldSessionInfo = { session: request.session, userId: request.userId, personaId: request.personaId, controlEpoch: request.controlEpoch };
        this.sessionTable.set(request.session, info);
        this.emptySince = null;
        this.sleeping = false;
        this.mode.onEnter?.(this.context(), info);
        return "admitted";
    }

    /** 离座（最终离开 / 踢 / drain / 失控制权）；最后一人离开起算空实例计时。 */
    leave(session: string, reason: WorldLeaveReason): boolean {
        const info = this.sessionTable.get(session);
        if (!info) return false;
        this.sessionTable.delete(session);
        for (let index = this.commandQueue.length - 1; index >= 0; index -= 1) {
            if (this.commandQueue[index]?.session === session) this.commandQueue.splice(index, 1);
        }
        this.mode.onLeave?.(this.context(), info, reason);
        if (this.sessionTable.size === 0) this.emptySince = this.now();
        return true;
    }

    /** 已过 dispatcher 闸的命令入队（下一步交 onStep）；非 Active / 会话不在座 / 陌生命令 ⇒ rejected。 */
    enqueue(session: string, type: string, payload: unknown): "queued" | "rejected" {
        if (this.state.phase !== WorldPhase.Active) return "rejected";
        if (!this.sessionTable.has(session)) return "rejected";
        if (!this.mode.commands.includes(type)) return "rejected";
        this.commandQueue.push({ session, type, payload });
        return "queued";
    }

    /** 固定步累积（自 GameRoom.update 抽出）：返回本次推进的步数；Active 且未睡眠才推进（Draining 也推进，直到 Offline）。 */
    advance(dtMs: number): number {
        if (!this.canStep()) return 0;
        if (!Number.isFinite(dtMs) || dtMs <= 0) return 0;
        const maxBacklog = this.fixedStepMs * (this.maxCatchUpSteps + 1);
        const current = Number.isFinite(this.accumulatorMs) && this.accumulatorMs >= 0 ? this.accumulatorMs : 0;
        this.accumulatorMs = Math.min(maxBacklog, current + Math.min(dtMs, maxBacklog));
        let steps = 0;
        while (this.accumulatorMs >= this.fixedStepMs && steps < this.maxCatchUpSteps) {
            this.accumulatorMs -= this.fixedStepMs;
            this.stepOnce();
            steps += 1;
            if (!this.canStep()) break;
        }
        if (steps === this.maxCatchUpSteps && this.accumulatorMs >= this.fixedStepMs) {
            this.accumulatorMs %= this.fixedStepMs;
        }
        return steps;
    }

    /** 推进一步：tick++ → onStep（本步排空的有序命令）。mode 抛错只记错，⛔ 不杀世界循环。 */
    stepOnce(): void {
        if (!this.canStep()) return;
        this.state.tick += 1;
        const commands = this.commandQueue.splice(0, this.commandQueue.length);
        try {
            this.mode.onStep(this.context(), { tick: this.state.tick, dtMs: this.fixedStepMs, commands });
        } catch (error) {
            console.error(`[WorldRuntime ${this.state.instanceId}] mode ${this.mode.id} step 失败`, error);
        }
    }

    /**
     * 空实例策略（§4.5 表）：最后一个会话离开 emptyAfterMs 后——sleep ⇒ 停固定步（有人准入即续跑，⛔ 不重放）；unload ⇒ Draining → Offline；
     * run ⇒ 照常推进。壳每 tick 调；返回本次采取的动作。
     */
    evaluateEmpty(): WorldEmptyAction {
        if (this.state.phase !== WorldPhase.Active) return "none";
        if (this.sessionTable.size > 0 || this.emptySince === null) return "none";
        if (this.now() - this.emptySince < this.world.emptyAfterMs) return "none";
        if (this.world.emptyPolicy === "sleep") {
            if (this.sleeping) return "none";
            this.sleeping = true;
            return "slept";
        }
        if (this.world.emptyPolicy === "unload") {
            this.drain("empty-unload", 0);
            this.offline();
            return "unloaded";
        }
        return "none";
    }

    /** 检查点节拍（checkpointMs）；到点或强制时取 mode.onCheckpoint（没实现 ⇒ null）。 */
    takeCheckpoint(force = false): WorldCheckpoint | null {
        if (this.state.phase !== WorldPhase.Active && this.state.phase !== WorldPhase.Draining) return null;
        if (!force && this.now() - this.lastCheckpointAt < this.world.checkpointMs) return null;
        this.lastCheckpointAt = this.now();
        return this.mode.onCheckpoint?.(this.context()) ?? null;
    }

    /** Draining：停收准入 / 命令，onDrain 一次；重复调用幂等。仍可推进到 Offline（在途交接完成、强制检查点由壳编排）。 */
    drain(reason: string, graceMs: number): void {
        if (this.state.phase === WorldPhase.Draining || this.state.phase === WorldPhase.Offline) return;
        this.state.phase = WorldPhase.Draining;
        this.drainReason = reason;
        this.commandQueue.length = 0;
        try {
            this.mode.onDrain?.(this.context(), { reason, graceMs });
        } catch (error) {
            console.error(`[WorldRuntime ${this.state.instanceId}] mode ${this.mode.id} drain 钩子失败`, error);
        }
    }

    get drainedReason(): string | null {
        return this.drainReason;
    }

    /** Offline：会话全部按 drained 离座，之后不再推进。 */
    offline(): void {
        if (this.state.phase === WorldPhase.Offline) return;
        for (const session of [...this.sessionTable.keys()]) this.leave(session, "drained");
        this.state.phase = WorldPhase.Offline;
    }

    signal(kind: string, payload: unknown): void {
        this.mode.onSignal?.(this.context(), { kind, payload });
    }

    primaryEntityOf(session: string): string | null {
        return this.mode.primaryEntityOf?.(session) ?? null;
    }

    private canStep(): boolean {
        if (this.state.phase === WorldPhase.Active) return !this.sleeping;
        return this.state.phase === WorldPhase.Draining;
    }
}
