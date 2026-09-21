/**
 * mmo kit · 编排运行器（kit 内部，docs/MMO.md §8.1；MK4-B1）：一个 pack 在一个分线上的事件队列 / 预算 / 有界状态 / 环形日志——纯内存、无 IO，
 * mode 每步先 `schedule(tick)`（到期 timer + tick 节拍进队）再 `dispatch(tick, world)`（逐事件 `module.handle` → 校验 → 本地命令（setVar / publishState /
 * startTimer / cancelTimer）当场生效、其余命令作为 effects 交回 mode 落地）。
 *  - 预算（§8.1，fail-closed）：每 tick 每 pack wall ≤ budgetMs（缺省 ORCH_TICK_BUDGET_MS）、命令 ≤ 64、事件队列 ≤ 256、timers ≤ 32、vars ≤ 4 KB、
 *    publishState ≤ 16 键；handler 抛错 / 命令不合 validator / 超限 ⇒ 本 tick 命令整批丢弃、pack `suspended`（timers 保留、不再收事件），`packSuspended`
 *    只投一次；`resume()` 恢复（mmoAdmin.resumePack 归 v1.x；分线重启也恢复）。
 *  - 可重放：`rng(stream)` 种子 = instanceId + tick + eventSeq + stream + 调用序；环形日志 `(seq, eventDigest, commandDigest)` 随快照进 state_hash；
 *    harness 用同一运行器重放并逐条比对。
 * ⛔ 插件不得 import 本文件（走 api/orchestration）。
 */
import {
    ORCH_MAX_COMMANDS_PER_TICK, ORCH_MAX_EVENT_QUEUE, ORCH_MAX_PUBLISH_KEYS, ORCH_MAX_TIMERS, ORCH_MAX_VARS_BYTES, ORCH_RING_SIZE, ORCH_SAY_NEARBY_PER_MIN,
    ORCH_SAY_WORLD_PER_MIN, ORCH_TICK_BUDGET_MS, ORCH_TICK_EVERY_DEFAULT, digestOf, effectiveLimits, validateOrchestrationCommand, varsBytesOf,
    type EntityId, type EntityKind, type IEntityView, type OrchestrationCommand, type OrchestrationEvent, type OrchestrationLimits, type OrchestrationModule,
    type OrchestrationReadApi, type OrchestrationRingEntry, type ScriptScalar, type Vec2,
} from "@game/shared/kits/mmo/api/orchestration/index";
import type { ICreatureTemplate, IItemTemplate, IRegionDef } from "@game/shared/kits/mmo/api/content/index";
import { SeededRandom } from "@game/shared/logic/random";

/** mode / harness 提供的世界只读视图（事件时刻快照；运行器不缓存）。 */
export interface RunnerWorld {
    entity(id: EntityId): IEntityView | null;
    entitiesInRegion(regionId: string, filter?: { readonly kind?: EntityKind; readonly tag?: string; readonly factionId?: string }): readonly EntityId[];
    playersInInstance(): readonly EntityId[];
    isWalkable(pos: Vec2): boolean;
    region(regionId: string): IRegionDef | null;
    creature(templateId: string): ICreatureTemplate | null;
    item(itemId: string): IItemTemplate | null;
    partyMembersInInstance(entityId: EntityId): readonly EntityId[];
}

/** 交回 mode 落地的命令（本地命令已在运行器内生效）。 */
export type RunnerEffect = Exclude<OrchestrationCommand, { op: "setVar" } | { op: "publishState" } | { op: "startTimer" } | { op: "cancelTimer" }>;

export interface RunnerTimer { readonly dueTick: number; readonly tag: string; readonly repeatMs: number }

export interface RunnerSnapshot {
    readonly vars: Readonly<Record<string, ScriptScalar>>;
    readonly timers: readonly { readonly id: string; readonly dueTick: number; readonly tag: string; readonly repeatMs: number }[];
    readonly publish: { readonly rev: number; readonly state: Readonly<Record<string, ScriptScalar>> };
    readonly suspended: string | null;
    readonly eventSeq: number;
    readonly ring: readonly OrchestrationRingEntry[];
}

export interface DispatchResult {
    readonly effects: readonly RunnerEffect[];
    /** 自上次 dispatch 以来新发生的 suspend（含 enqueue 溢出）；只报告一次 */
    readonly suspendedNow: string | null;
    /** 有 durable setVar ⇒ mode 请求强制分线检查点（限频在 mode） */
    readonly durableVar: boolean;
    /** publishState 改了 ⇒ mode 广播 scriptState */
    readonly publishChanged: boolean;
    /** 本次处理的事件数 / 命令数 / 用时 */
    readonly events: number;
    readonly commands: number;
    readonly wallMs: number;
}

export interface RunnerOptions {
    readonly module: OrchestrationModule;
    readonly instanceId: string;
    readonly address: string;
    readonly fixedStepMs: number;
    /** wall 时钟（单测注入假时钟钉预算语义） */
    readonly now?: () => number;
    readonly budgetMs?: number;
    readonly log?: (line: string) => void;
}

const wallClock = (): number => (globalThis.performance?.now ? globalThis.performance.now() : Date.now());

/** 稳定字符串哈希（FNV-1a 32），给 rng 种子 / tick 分桶用。 */
export function hashSeed(...parts: readonly (string | number)[]): number {
    let hash = 0x811c9dc5;
    const text = parts.join("|");
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

export class OrchestrationRunner {
    readonly module: OrchestrationModule;
    readonly packId: string;
    readonly limits: Required<OrchestrationLimits>;
    readonly tickEvery: number;
    readonly bucket: number;
    private readonly instanceId: string;
    private readonly address: string;
    private readonly fixedStepMs: number;
    private readonly now: () => number;
    private readonly budgetMs: number;
    private readonly log: (line: string) => void;
    private readonly subscribed: ReadonlySet<string>;
    private readonly varsMap = new Map<string, ScriptScalar>();
    private readonly timersMap = new Map<string, RunnerTimer>();
    private publishRev = 0;
    private publishState: Record<string, ScriptScalar> = {};
    private suspendedReason: string | null = null;
    private suspendedNotified = false;
    private pendingSuspension: string | null = null;
    private seq = 0;
    private readonly ringLog: OrchestrationRingEntry[] = [];
    private readonly queue: OrchestrationEvent[] = [];
    private readonly sayWorldAt: number[] = [];
    private readonly sayNearbyAt: number[] = [];

    constructor(options: RunnerOptions) {
        this.module = options.module;
        this.packId = options.module.packId;
        this.limits = effectiveLimits(options.module);
        this.tickEvery = options.module.tickEvery ?? ORCH_TICK_EVERY_DEFAULT;
        this.instanceId = options.instanceId;
        this.address = options.address;
        this.fixedStepMs = options.fixedStepMs;
        this.now = options.now ?? wallClock;
        this.budgetMs = options.budgetMs ?? ORCH_TICK_BUDGET_MS;
        this.log = options.log ?? (() => undefined);
        this.subscribed = new Set(options.module.subscribes);
        this.bucket = hashSeed(this.packId, this.instanceId) % this.tickEvery;
    }

    get suspended(): string | null { return this.suspendedReason; }
    get eventSeq(): number { return this.seq; }
    get ring(): readonly OrchestrationRingEntry[] { return this.ringLog; }
    get queued(): number { return this.queue.length; }
    vars(): ReadonlyMap<string, ScriptScalar> { return this.varsMap; }
    timers(): ReadonlyMap<string, RunnerTimer> { return this.timersMap; }
    publish(): { readonly rev: number; readonly state: Readonly<Record<string, ScriptScalar>> } { return { rev: this.publishRev, state: this.publishState }; }
    isSubscribed(kind: OrchestrationEvent["kind"]): boolean { return this.subscribed.has(kind); }

    /** 进队：未订阅不投；suspended 不再收（packSuspended 除外）；队列满 ⇒ suspend（fail-closed）。 */
    enqueue(event: OrchestrationEvent): "queued" | "unsubscribed" | "suspended" | "overflow" {
        if (!this.subscribed.has(event.kind)) return "unsubscribed";
        if (this.suspendedReason !== null) return "suspended";
        if (this.queue.length >= ORCH_MAX_EVENT_QUEUE) { this.suspend("event-queue"); return "overflow"; }
        this.queue.push(event);
        return "queued";
    }

    /** 每步：到期 timer（repeat 重排）与 tick 节拍（bucket 错峰）进队。 */
    schedule(tick: number): void {
        if (this.suspendedReason !== null) return;
        for (const [timerId, timer] of [...this.timersMap]) {
            if (timer.dueTick > tick) continue;
            if (timer.repeatMs > 0) this.timersMap.set(timerId, { ...timer, dueTick: tick + Math.max(1, Math.ceil(timer.repeatMs / this.fixedStepMs)) });
            else this.timersMap.delete(timerId);
            this.enqueue({ kind: "timer", timerId, tag: timer.tag });
        }
        if ((tick + this.bucket) % this.tickEvery === 0) this.enqueue({ kind: "tick", tick, bucket: this.bucket });
    }

    /** 处理整队：逐事件 handle → 校验 → 本地命令暂存 / effects；预算超限或任一不合 ⇒ 整批丢弃（暂存全部作废）+ suspend；全部通过才提交。 */
    dispatch(tick: number, world: RunnerWorld): DispatchResult {
        // enqueue / schedule 也可能先触发暂停；交给 mode 同一路径写审计并通知一次。
        if (this.suspendedReason !== null) {
            return { effects: [], suspendedNow: this.takePendingSuspension(), durableVar: false, publishChanged: false, events: 0, commands: 0, wallMs: 0 };
        }
        const effects: RunnerEffect[] = [];
        let durableVar = false;
        let publishChanged = false;
        let commandsTotal = 0;
        let events = 0;
        const startedAt = this.now();
        let wallMs = 0;
        // 暂存区：本次 dispatch 的本地效果全部成功才提交（§8.1「本 tick 命令整批丢弃」）
        const vars = new Map(this.varsMap);
        const timers = new Map(this.timersMap);
        let publishState = this.publishState;
        let publishRev = this.publishRev;
        const ring: OrchestrationRingEntry[] = [];
        const sayWorldAt = [...this.sayWorldAt];
        const sayNearbyAt = [...this.sayNearbyAt];
        let seq = this.seq;
        const fail = (reason: string): DispatchResult => {
            this.seq = seq;
            this.suspend(reason);
            return { effects: [], suspendedNow: this.takePendingSuspension(), durableVar: false, publishChanged: false, events, commands: commandsTotal, wallMs };
        };
        while (this.queue.length > 0 && this.suspendedReason === null) {
            const event = this.queue.shift()!;
            seq += 1;
            events += 1;
            const eventSeq = seq;
            const api = this.readApi(tick, eventSeq, world, vars);
            let raw: readonly OrchestrationCommand[];
            try {
                raw = this.module.handle(event, api);
            } catch (error) {
                this.log(`orch:${this.packId}:handler-error:${error instanceof Error ? error.message : String(error)}`);
                return fail("handler");
            }
            wallMs = this.now() - startedAt;
            if (wallMs > this.budgetMs) return fail("budget");
            if (!Array.isArray(raw)) return fail("command");
            commandsTotal += raw.length;
            if (commandsTotal > ORCH_MAX_COMMANDS_PER_TICK) return fail("commands");
            const commands: OrchestrationCommand[] = [];
            for (const [index, item] of raw.entries()) {
                try { commands.push(validateOrchestrationCommand(item, `commands[${index}]`)); } catch (error) {
                    this.log(`orch:${this.packId}:bad-command:${error instanceof Error ? error.message : String(error)}`);
                    return fail("command");
                }
            }
            ring.push({ seq: eventSeq, eventDigest: digestOf(event), commandDigest: digestOf(commands) });
            for (const command of commands) {
                switch (command.op) {
                    case "setVar": {
                        vars.set(command.key, command.value);
                        if (varsBytesOf(Object.fromEntries(vars)) > ORCH_MAX_VARS_BYTES) return fail("vars");
                        if (command.durable) durableVar = true;
                        break;
                    }
                    case "publishState": {
                        if (!(command.key in publishState) && Object.keys(publishState).length >= ORCH_MAX_PUBLISH_KEYS) return fail("publish");
                        if (publishState[command.key] !== command.value) {
                            publishState = { ...publishState, [command.key]: command.value };
                            publishRev += 1;
                            publishChanged = true;
                        }
                        break;
                    }
                    case "startTimer": {
                        if (!timers.has(command.timerId) && timers.size >= ORCH_MAX_TIMERS) return fail("timers");
                        timers.set(command.timerId, { dueTick: tick + Math.max(1, Math.ceil(command.afterMs / this.fixedStepMs)), tag: command.tag ?? "", repeatMs: command.repeat ? command.afterMs : 0 });
                        break;
                    }
                    case "cancelTimer": timers.delete(command.timerId); break;
                    case "sayWorld": {
                        if (!this.admit(sayWorldAt, ORCH_SAY_WORLD_PER_MIN, tick)) { this.log(`orch:${this.packId}:sayWorld-rate`); break; }
                        effects.push(command);
                        break;
                    }
                    case "sayNearby": {
                        if (!this.admit(sayNearbyAt, ORCH_SAY_NEARBY_PER_MIN, tick)) { this.log(`orch:${this.packId}:sayNearby-rate`); break; }
                        effects.push(command);
                        break;
                    }
                    default: effects.push(command);
                }
            }
        }
        // 提交暂存
        this.seq = seq;
        this.varsMap.clear();
        for (const [key, value] of vars) this.varsMap.set(key, value);
        this.timersMap.clear();
        for (const [key, value] of timers) this.timersMap.set(key, value);
        this.publishState = publishState;
        this.publishRev = publishRev;
        this.sayWorldAt.splice(0, this.sayWorldAt.length, ...sayWorldAt);
        this.sayNearbyAt.splice(0, this.sayNearbyAt.length, ...sayNearbyAt);
        for (const entry of ring) this.pushRing(entry);
        return { effects, suspendedNow: null, durableVar, publishChanged, events, commands: commandsTotal, wallMs };
    }

    /** suspended ⇒ 只投一次 packSuspended（订阅了才投；其命令丢弃）。返回是否投了。 */
    notifySuspended(tick: number, world: RunnerWorld): boolean {
        if (this.suspendedReason === null || this.suspendedNotified) return false;
        this.suspendedNotified = true;
        if (!this.subscribed.has("packSuspended")) return false;
        this.seq += 1;
        try { this.module.handle({ kind: "packSuspended", reason: this.suspendedReason }, this.readApi(tick, this.seq, world, this.varsMap)); } catch { /* 已 suspended：忽略 */ }
        return true;
    }

    resume(): void {
        this.suspendedReason = null;
        this.suspendedNotified = false;
        this.pendingSuspension = null;
    }

    snapshot(): RunnerSnapshot {
        return {
            vars: Object.fromEntries(this.varsMap),
            timers: [...this.timersMap].map(([id, timer]) => ({ id, dueTick: timer.dueTick, tag: timer.tag, repeatMs: timer.repeatMs })),
            publish: { rev: this.publishRev, state: { ...this.publishState } },
            suspended: this.suspendedReason,
            eventSeq: this.seq,
            ring: [...this.ringLog],
        };
    }

    /** 重启回灌：timers 按 tick 差重排；恢复业务状态并解除上一进程的暂停（§8.1 重启恢复）。 */
    restore(snapshot: RunnerSnapshot, snapshotTick: number, currentTick: number): void {
        this.varsMap.clear();
        for (const [key, value] of Object.entries(snapshot.vars)) this.varsMap.set(key, value);
        this.timersMap.clear();
        for (const timer of snapshot.timers) this.timersMap.set(timer.id, { dueTick: Math.max(0, timer.dueTick - snapshotTick) + currentTick, tag: timer.tag, repeatMs: timer.repeatMs });
        this.publishRev = snapshot.publish.rev;
        this.publishState = { ...snapshot.publish.state };
        // snapshot.suspended 只保留作故障诊断，不带回新进程；本次初始化若已溢出则仍须暂停并报告。
        this.seq = snapshot.eventSeq;
        this.ringLog.length = 0;
        this.ringLog.push(...snapshot.ring.slice(-ORCH_RING_SIZE));
    }

    private suspend(reason: string): void {
        if (this.suspendedReason !== null) return;
        this.suspendedReason = reason;
        this.pendingSuspension = reason;
        this.queue.length = 0;
        this.log(`orch:${this.packId}:suspended:${reason}`);
    }

    private takePendingSuspension(): string | null {
        const reason = this.pendingSuspension;
        this.pendingSuspension = null;
        return reason;
    }

    private pushRing(entry: OrchestrationRingEntry): void {
        this.ringLog.push(entry);
        if (this.ringLog.length > ORCH_RING_SIZE) this.ringLog.splice(0, this.ringLog.length - ORCH_RING_SIZE);
    }

    /** 每分钟限频（按 tick 折算的分线时间；⛔ 挂钟）。 */
    private admit(window: number[], perMinute: number, tick: number): boolean {
        const nowMs = tick * this.fixedStepMs;
        while (window.length > 0 && nowMs - window[0]! >= 60_000) window.shift();
        if (window.length >= perMinute) return false;
        window.push(nowMs);
        return true;
    }

    private readApi(tick: number, eventSeq: number, world: RunnerWorld, vars: ReadonlyMap<string, ScriptScalar> = this.varsMap): OrchestrationReadApi {
        const draws = new Map<string, number>();
        return {
            address: this.address, tick, packId: this.packId,
            rng: (stream) => {
                const n = draws.get(stream) ?? 0;
                draws.set(stream, n + 1);
                return new SeededRandom(hashSeed(this.instanceId, tick, eventSeq, stream, n)).next();
            },
            vars: { get: (key) => vars.get(key), keys: () => [...vars.keys()] },
            world: {
                entity: (id) => world.entity(id),
                entitiesInRegion: (regionId, filter) => world.entitiesInRegion(regionId, filter),
                playersInInstance: () => world.playersInInstance(),
                isWalkable: (pos) => world.isWalkable(pos),
                region: (regionId) => world.region(regionId),
            },
            content: { creature: (id) => world.creature(id), item: (id) => world.item(id) },
            party: { membersInInstance: (entityId) => world.partyMembersInInstance(entityId) },
        };
    }
}
