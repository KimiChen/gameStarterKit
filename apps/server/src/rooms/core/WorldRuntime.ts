/**
 * WorldRuntime（MMO MF4-B5，docs/MMO.md §4.5 / §4.6-5）：**无头**模拟宿主——注入时钟、固定步累积 + catch-up 上限（自 GameRoom
 * `stepFixed` / `update` 抽出）、有序命令队列、生命周期状态机 `Recovering → Active → Draining → Offline`、空实例三策略与检查点节拍。
 * ⛔ 不 import `colyseus` / `@colyseus/*`（机检 rooms-core-headless-import.test.ts）；⛔ 不持 client 引用；全部规则可在无 Colyseus 进程内重放。
 * 传输壳（MF4-B6 WorldRoom）只做：喂 `enqueue`、按 tick 调 `advance`、用 `ports` 把出站落到真实连接、把租约失效映射成 `drain`。
 */
import { CORE_S2C_TOKENS, SeededRandom, WorldPhase, type GameplayS2CToken, type IWorldChatRes, type WorldPhaseType } from "@game/shared";
import type { WorldManifestConfig } from "../../../tools/gameplay-codegen/manifestSchema";
import type {
    WorldAdmitRequest, WorldCheckpoint, WorldCommand, WorldEventDraft, WorldLeaveReason, WorldMode, WorldModeContext, WorldModeObserverPorts,
    WorldSessionInfo, WorldStateLifecycle,
} from "../WorldMode";
import type { CheckpointEnvelope } from "./CheckpointPort";
import { Baseline } from "./Baseline";
import { InterestSet } from "./InterestSet";
import { ObserverSync, type ObservedEntity } from "./ObserverSync";
import { OutboundQueue, type OutboundMessage } from "./OutboundQueue";

/** 与 GameRoom 同值：极端停顿最多补 120 步，超出丢弃 backlog（⛔ 不让一次 wall-clock gap 卡死循环）。 */
export const WORLD_MAX_CATCH_UP_STEPS = 120;

export interface WorldRuntimePorts {
    sendS2C(session: string, token: GameplayS2CToken<unknown>, payload: unknown): void;
    broadcastS2C(token: GameplayS2CToken<unknown>, payload: unknown): void;
    /** mode 经 context.requestDrain 请求 Draining 时回调（壳据此走同一状态机；缺省直接 drain）。 */
    onDrainRequested?(reason: string): void;
    /**
     * 检查点落点（MF7b-B4：WorldRoom 交 WorldCheckpointer 同一世界事务落盘；单测接记录器）：advance 末尾按 checkpointMs 节拍 `periodic`，
     * 强制点（drain / 离座 / mode.requestCheckpoint / unload 收尾）`forced`。批次含 rev（= 已落库 rev + 1，⛔ runtime 不先推进，落盘后
     * `commitCheckpoint(rev)`；失败 `rollbackCheckpoint(batch)` 把事件放回缓冲）。缺省不取检查点。
     */
    onCheckpoint?(batch: WorldCheckpointBatch, reason: "periodic" | "forced"): void;
}

/** 一次检查点的完整批次：分线快照 + persona 快照 + 自上个检查点以来的事件批（checkpoint_rev = rev，§7.3 ①）。 */
export interface WorldCheckpointBatch {
    readonly rev: number;
    /** 本批覆盖到的世界事件 seq（含）。 */
    readonly eventOffset: number;
    readonly authorityEpoch: number;
    readonly reason: string;
    readonly checkpoint: WorldCheckpoint;
    readonly events: readonly WorldEventDraft[];
    /** 落盘时在座的 persona（controlEpoch 进 persona 信封；world tx 逐个 assertControl）。 */
    readonly personas: readonly { readonly personaId: string; readonly controlEpoch: number }[];
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
    /** 分线级检查点（框架已校验的信封）；null = 空世界起步。rev / eventOffset 成为本 runtime 的 checkpointRev / eventSeq 起点。 */
    readonly checkpoint: CheckpointEnvelope | null;
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
    /**
     * 观察者同步运行时（MF5b）：每会话出站队列对所有 mode 存在（emitPerSession）；差分 / baseline 只在 mode 声明 `observer` 时构造。
     * 排空点 = 传输壳每 tick `drainOutbound`（在线会话）；宽限中（away）不差分、不 baseline、不排空——回来先收 baseline。
     */
    private readonly observerQueue: OutboundQueue;
    private observerSync: ObserverSync<ObservedEntity> | null = null;
    private observerBaseline: Baseline<unknown> | null = null;
    private readonly observerBaselineRequests = new Set<string>();
    private readonly observerBaselined = new Set<string>();
    private readonly awaySessions = new Set<string>();
    /** 已落库的分线检查点 rev（Recovering 回灌；commitCheckpoint 推进）。 */
    private checkpointRev = 0;
    /** 已发出但尚未 commit / rollback 的最大 rev（并发批次不撞 rev）。 */
    private issuedRev = 0;
    /** 最后分配的世界事件 seq（分线内单调；Recovering 从 eventOffset 续）。 */
    private eventSeq = 0;
    private pendingEvents: WorldEventDraft[] = [];
    private checkpointRequested: string | null = null;
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
        this.observerQueue = new OutboundQueue(options.mode.observer?.limits?.outboundQueueMaxMessages);
        const capability = options.mode.observer;
        if (capability) {
            const queue = this.observerQueue;
            const sink = { emit: (session: string, token: GameplayS2CToken<unknown>, payload: unknown): void => { queue.push(session, token, payload); } };
            this.observerSync = new ObserverSync<ObservedEntity>(
                capability.tokens, capability.builders, sink, new InterestSet(capability.limits?.interestMaxEntities));
            this.observerBaseline = new Baseline<unknown>(capability.baseline.tokens, capability.baseline.builders, sink,
                capability.baseline.chunkItems === undefined ? {} : { chunkItems: capability.baseline.chunkItems });
        }
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
            observers: this.observerPorts(),
            events: {
                append: (kind, payload) => {
                    if (!this.mode.checkpoint?.eventTable) throw new Error(`[WorldRuntime] mode ${this.mode.id} 未声明 checkpoint.eventTable，⛔ 不能追加 durable 事件`);
                    if (typeof kind !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{0,31}$/u.test(kind)) throw new TypeError(`[WorldRuntime] 事件 kind "${String(kind)}" 非法`);
                    this.eventSeq += 1;
                    this.pendingEvents.push({ seq: this.eventSeq, kind, payload });
                    return this.eventSeq;
                },
            },
            requestCheckpoint: (reason) => {
                if (!this.mode.checkpoint) throw new Error(`[WorldRuntime] mode ${this.mode.id} 未声明 checkpoint 能力，⛔ 不能 requestCheckpoint`);
                this.checkpointRequested = reason;
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
        if (info.checkpoint !== null) {
            this.checkpointRev = info.checkpoint.rev;
            this.issuedRev = info.checkpoint.rev;
            this.eventSeq = info.checkpoint.eventOffset;
        }
        await this.mode.onWorldInit(this.context(), { recovered: info.checkpoint !== null });
        // §4.5 Recovering 顺序：装载 → loadInstance 检查点回灌（persona 级在准入时各自回灌）→ 开放准入
        if (info.checkpoint !== null) this.mode.onRestore?.(this.context(), { persona: [], instance: info.checkpoint.snapshot });
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
        const info: WorldSessionInfo = {
            session: request.session, userId: request.userId, personaId: request.personaId, controlEpoch: request.controlEpoch, checkpoint: request.checkpoint,
        };
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
        this.forgetObserver(session);
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
        if (this.checkpointRequested !== null) {
            const reason = this.checkpointRequested;
            this.checkpointRequested = null;
            this.emitCheckpoint(true, reason);
        } else {
            this.emitCheckpoint(false, "periodic");
        }
        return steps;
    }

    /** 强制检查点（§4.5 unload / Draining 收尾 / 离座）：有落点才取；返回是否取到。 */
    forceCheckpoint(reason = "forced"): boolean {
        return this.emitCheckpoint(true, reason);
    }

    private emitCheckpoint(force: boolean, reason: string): boolean {
        if (!this.ports.onCheckpoint) return false;
        const batch = this.takeCheckpointBatch(force, reason);
        if (!batch) return false;
        try {
            this.ports.onCheckpoint(batch, force ? "forced" : "periodic");
        } catch (error) {
            console.error(`[WorldRuntime ${this.state.instanceId}] 检查点落点失败`, error);
            this.rollbackCheckpoint(batch);
        }
        return true;
    }

    /**
     * 取一批（节拍或强制）：rev = max(已落库, 已发出) + 1、eventOffset = 最后分配的 seq、事件批从缓冲**移出**（落盘失败由 rollbackCheckpoint 放回）。
     * ⛔ 不在这里推进 checkpointRev：只有落盘提交后 commitCheckpoint 才推进（§7.3 ①：事件行的 checkpoint_rev 指向「下一个将落盘」的 rev）。
     */
    takeCheckpointBatch(force = false, reason = "periodic"): WorldCheckpointBatch | null {
        const checkpoint = this.takeCheckpoint(force);
        if (!checkpoint) return null;
        const rev = Math.max(this.checkpointRev, this.issuedRev) + 1;
        this.issuedRev = rev;
        const events = this.pendingEvents.splice(0, this.pendingEvents.length);
        return {
            rev, eventOffset: this.eventSeq, authorityEpoch: this.state.authorityEpoch, reason, checkpoint, events,
            personas: [...this.sessionTable.values()].map((info) => ({ personaId: info.personaId, controlEpoch: info.controlEpoch })),
        };
    }

    /** 落盘提交后由壳调：推进已落库 rev（只许前进）。 */
    commitCheckpoint(rev: number): void {
        if (!Number.isSafeInteger(rev) || rev <= this.checkpointRev) return;
        this.checkpointRev = rev;
    }

    /** 落盘失败：事件批放回缓冲最前（保持 seq 序），rev 作废（下一批取更大的号）。 */
    rollbackCheckpoint(batch: WorldCheckpointBatch): void {
        if (batch.events.length > 0) this.pendingEvents = [...batch.events, ...this.pendingEvents];
    }

    get checkpointRevision(): number {
        return this.checkpointRev;
    }

    get lastEventSeq(): number {
        return this.eventSeq;
    }

    get pendingEventCount(): number {
        return this.pendingEvents.length;
    }

    /** 推进一步：tick++ → onStep（本步排空的有序命令）。mode 抛错只记错，⛔ 不杀世界循环。 */
    stepOnce(): void {
        if (!this.canStep()) return;
        this.state.tick += 1;
        // MF5b：需要 baseline 的在线会话先于本 tick 的私有流 / 差分收到 baseline（单 seq 流有序）。
        this.prepareObservers();
        const commands = this.commandQueue.splice(0, this.commandQueue.length);
        try {
            this.mode.onStep(this.context(), { tick: this.state.tick, dtMs: this.fixedStepMs, commands });
        } catch (error) {
            console.error(`[WorldRuntime ${this.state.instanceId}] mode ${this.mode.id} step 失败`, error);
        }
        // MF5b：本 tick 的观察者差分（enter / update / leave）进每会话队列；排空由传输壳 drainOutbound。
        this.flushObservers();
    }

    // ── 观察者同步（MF5b；与 GameRoom 的 prepare / flush 同规则，但住在无头 runtime）─────────────────────

    private observerPorts(): WorldModeObserverPorts {
        return {
            interest: (session) => {
                const interest = this.observerSync?.interest;
                return { version: interest?.version(session) ?? 0, view: interest?.view(session) ?? new Map() };
            },
            emitPerSession: <TPayload>(session: string, token: GameplayS2CToken<TPayload>, payload: TPayload) =>
                this.observerQueue.push(session, token, payload),
            requestBaseline: (session) => {
                if (!this.observerSync) throw new Error(`[WorldRuntime] mode ${this.mode.id} 未声明 observer 能力，⛔ 不能 requestBaseline`);
                this.observerBaselineRequests.add(session);
            },
            seq: (session) => this.observerSync?.seq(session) ?? 0,
            nextSeq: (session) => {
                if (!this.observerSync) throw new Error(`[WorldRuntime] mode ${this.mode.id} 未声明 observer 能力，⛔ 不能 nextSeq`);
                return this.observerSync.nextSeq(session);
            },
        };
    }

    /** tick 开头：首发（刚入座 / 重连归位）、超限重同步、玩法请求 ⇒ 先发只含兴趣集的 baseline 并 rebase（⛔ 不靠 seq===0 判首发）。 */
    private prepareObservers(): void {
        const capability = this.mode.observer;
        const sync = this.observerSync;
        const baseline = this.observerBaseline;
        if (!capability || !sync || !baseline) return;
        const context = this.context();
        for (const session of this.sessionTable.keys()) {
            if (this.awaySessions.has(session)) continue;
            const needsBaseline = !this.observerBaselined.has(session) || this.observerQueue.needsResync(session) || this.observerBaselineRequests.has(session);
            if (!needsBaseline) continue;
            try {
                const entities = capability.visibleEntities(session, context);
                const items = capability.baselineItems
                    ? capability.baselineItems(session, entities, context)
                    : [...entities.keys()].sort().map((id) => entities.get(id) as ObservedEntity);
                baseline.send(session, items, { epochId: `${this.state.instanceId}#${this.state.authorityEpoch}`, seq: sync.nextSeq(session), tick: this.state.tick });
                sync.rebase(session, entities);
                this.observerQueue.clearResync(session);
                this.observerBaselineRequests.delete(session);
                this.observerBaselined.add(session);
            } catch (error) {
                console.error(`[WorldRuntime ${this.state.instanceId}] mode ${this.mode.id} observer baseline 失败 session=${session}`, error);
            }
        }
    }

    /** tick 末尾：对在座、在线、已 baseline 且未打重同步标记的会话算本 tick 差分进队列。 */
    private flushObservers(): void {
        const capability = this.mode.observer;
        const sync = this.observerSync;
        if (!capability || !sync) return;
        const context = this.context();
        for (const session of this.sessionTable.keys()) {
            if (this.awaySessions.has(session) || !this.observerBaselined.has(session) || this.observerQueue.needsResync(session)) continue;
            try {
                sync.diffAndEmit(session, capability.visibleEntities(session, context), this.state.tick);
            } catch (error) {
                console.error(`[WorldRuntime ${this.state.instanceId}] mode ${this.mode.id} observer 投影失败 session=${session}`, error);
            }
        }
    }

    private forgetObserver(session: string): void {
        this.observerSync?.forget(session);
        this.observerQueue.remove(session);
        this.observerBaselineRequests.delete(session);
        this.observerBaselined.delete(session);
        this.awaySessions.delete(session);
    }

    /** 传输壳：会话进入 / 离开重连宽限。归位 ⇒ 下一 tick 先收只含兴趣集的 baseline（宽限期间的积压可能已超限 / 已过时）。 */
    markAway(session: string, away: boolean): void {
        if (!this.sessionTable.has(session)) return;
        if (away) {
            this.awaySessions.add(session);
            return;
        }
        if (this.awaySessions.delete(session) && this.observerSync) this.observerBaselineRequests.add(session);
    }

    isAway(session: string): boolean {
        return this.awaySessions.has(session);
    }

    /** 传输壳每 tick 取走该会话的 perSession 积压（保持入队顺序）；不在线的会话 ⛔ 不排空。 */
    drainOutbound(session: string): readonly OutboundMessage[] {
        return this.observerQueue.drain(session);
    }

    outboundSize(session: string): number {
        return this.observerQueue.size(session);
    }

    needsResync(session: string): boolean {
        return this.observerQueue.needsResync(session);
    }

    get hasObserver(): boolean {
        return this.observerSync !== null;
    }

    /**
     * 空实例策略（§4.5 表）：最后一个会话离开 emptyAfterMs 后——sleep ⇒ 停固定步（有人准入即续跑，⛔ 不重放）；unload ⇒ 强制检查点 → Draining → Offline；
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
            this.forceCheckpoint("empty-unload"); // §4.5：unload = 强制检查点 → Draining → Offline
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

    /**
     * 附近聊天（MMO MF6b，docs/MMO.md §6.5.1）：受众 = 兴趣集含 `primaryEntityOf(sender)` 的在座会话 ∪ {发送者}，逐会话进观察者
     * 队列（perSession 单 seq 流，气泡与实体 enter / leave 同序；壳每 tick 排空）；⛔ 不广播、⛔ 不碰 Redis。
     * 未在座 / mode 无主实体 ⇒ 拒（壳回 BadRequest）；无 observer 能力的 mode 只有发送者自己收到。
     */
    sayNearby(session: string, text: string, at: number): "sent" | "not-seated" | "no-entity" {
        if (!this.sessionTable.has(session)) return "not-seated";
        const fromEntityId = this.primaryEntityOf(session);
        if (fromEntityId === null) return "no-entity";
        const audience = new Set<string>([session]);
        const interest = this.observerSync?.interest;
        if (interest) {
            for (const other of interest.sessions()) {
                if (other !== session && interest.view(other).has(fromEntityId)) audience.add(other);
            }
        }
        const payload: IWorldChatRes = { fromEntityId, text, at };
        for (const target of audience) {
            if (!this.sessionTable.has(target)) continue;
            this.observerQueue.push(target, CORE_S2C_TOKENS.WorldChat, payload);
        }
        return "sent";
    }

    private canStep(): boolean {
        if (this.state.phase === WorldPhase.Active) return !this.sleeping;
        return this.state.phase === WorldPhase.Draining;
    }
}
