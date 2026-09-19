/**
 * WorldMode（MMO MF4，docs/MMO.md §4.5 / §4.6）：世界形态玩法的服务端契约 + 登记表。⛔ 不继承 GameMode（D13）。
 *
 * 分工：模拟与传输分离（§4.6-5）——WorldMode 只见会话 id / persona / 命令，⛔ 不持 client 引用、⛔ 不 import colyseus；
 * 传输壳（MF4-B6 WorldRoom）负责准入信封、凭据、控制权 CAS、出站排空；无头宿主（rooms/core/WorldRuntime.ts）负责固定步、
 * 命令队列、生命周期状态机、空实例策略与检查点节拍。钩子形取 Nakama（matchInit / matchJoinAttempt / matchLoop / …），实取 AzerothCore Map。
 * 登记表：`registerGeneratedWorldModes`（codegen 按 manifest kind:"world" 分表）登进 `worldModeRegistry`，⛔ 不混进 gameModeRegistry。
 */
import type { GameplayS2CToken, WorldPhaseType } from "@game/shared";
import type { CheckpointEnvelope, CheckpointPort, CheckpointSchema } from "./core/CheckpointPort";
import type { BaselineBuilders, BaselineTokens } from "./core/Baseline";
import type { InterestView } from "./core/InterestSet";
import type { ObservedEntity, ObserverSyncBuilders, ObserverSyncTokens } from "./core/ObserverSync";
import type { OutboundPushResult } from "./core/OutboundQueue";

/** world 根必填集（codegen 强制，MF4-B2）：WorldRoom 壳只碰这组分线元数据，⛔ 没有 players / matchId。 */
export interface WorldStateLifecycle {
    tick: number;
    phase: WorldPhaseType;
    instanceId: string;
    mapId: string;
    line: number;
    authorityEpoch: number;
}

/** 在座会话（名册只在服务端会话表；D4）。 */
export interface WorldSessionInfo {
    readonly session: string;
    readonly userId: string;
    readonly personaId: string;
    /** 准入时 CAS 得到的控制权代号；旧 epoch 的延迟提交被存储边界拒（§4.6-1）。 */
    readonly controlEpoch: number;
    /** persona 级检查点（框架在准入时 load + 校验；无 checkpoint 能力 / 首次进入 ⇒ null）。mode 在 onEnter 回灌。 */
    readonly checkpoint: CheckpointEnvelope | null;
}

/** 准入请求（onBeforeAdmit / onAdmit）：ticket 只以 sha256 出现，⛔ 原文不进 mode。 */
export interface WorldAdmitRequest extends WorldSessionInfo {
    readonly ticketSha256: string;
    /** 重连：客户端已收到的最后 seq；null = 从 baseline 重来。 */
    readonly resumeSeq: number | null;
}

/** 本 tick 已过 dispatcher 闸（预算 / owner / validate / phase）的有序命令。 */
export interface WorldCommand {
    readonly session: string;
    readonly type: string;
    readonly payload: unknown;
}

/** persona 级检查点条目（MF7b）：按 personaId 落 kit 的 persona 检查点表。 */
export interface WorldPersonaCheckpoint {
    readonly personaId: string;
    readonly snapshot: unknown;
}

/** 检查点（MF7b-B4 落库）：persona 级条目 + 分线级快照，内容归 mode；信封（rev / eventOffset / epoch / schemaVersion / stateHash）归框架。 */
export interface WorldCheckpoint {
    readonly persona: readonly WorldPersonaCheckpoint[];
    readonly instance: unknown;
}

/** mode 在 tick 内产生的 durable 命令（§7.3：grant* / lootClaim 派生的世界事件行），随下一个分线检查点同事务落库。 */
export interface WorldEventDraft {
    readonly seq: number;
    readonly kind: string;
    readonly payload: unknown;
}

/**
 * 检查点能力（MF7b）：kit 作用域的持久层——`kitId`（persona / 表前缀 / 事件表都在这个 kit 下）、`port`（kit 实现的存储端口）、
 * `schema`（快照 schema 版本窗口，加载不兼容 fail-closed）、`eventTable`（role:"world-event" 表；缺省无 durable 事件）。
 */
export interface WorldModeCheckpointCapability {
    readonly kitId: string;
    readonly port: CheckpointPort;
    readonly schema: CheckpointSchema;
    readonly eventTable?: string;
}

export type WorldLeaveReason = "left" | "kicked" | "drained" | "lost-control";

/**
 * 观察者同步端口（MMO MF5b，与 GameMode 的 GameModeObserverPorts 同形）：perSession token 专用，全房 token 仍走 `broadcastS2C`。
 * 投递不直接出网——进每会话 OutboundQueue（住在 WorldRuntime，无头可重放），WorldRoom 每 tick 排空在线会话
 * （宽限中不排空；慢会话超限 ⇒ 丢可合并类、留不可丢类、下一 tick 重发 baseline）。
 */
export interface WorldModeObserverPorts {
    interest(session: string): { readonly version: number; readonly view: InterestView };
    emitPerSession<TPayload>(session: string, token: GameplayS2CToken<TPayload>, payload: TPayload): OutboundPushResult;
    requestBaseline(session: string): void;
    seq(session: string): number;
    nextSeq(session: string): number;
}

/**
 * world mode 的可选观察者能力（MF5b）：候选与投影归 mode（网格 / 视距 / 可见性 / 私有字段过滤），差分、编号、baseline、投递归框架。
 * 六个 token 必须 perSession（建 runtime 时 fail-closed）；`visibleEntities` 每 tick 每会话调一次，返回**公开投影**
 * （⛔ 私有字段不得进 entity——它经 `observers.emitPerSession` 的 private token 单独发给本人）。
 */
export interface WorldModeObserverCapability<TState extends WorldStateLifecycle = WorldStateLifecycle, TEntity extends ObservedEntity = ObservedEntity, TItem = TEntity> {
    readonly tokens: ObserverSyncTokens<unknown, unknown, unknown>;
    readonly builders: ObserverSyncBuilders<TEntity, unknown, unknown, unknown>;
    readonly baseline: {
        readonly tokens: BaselineTokens<unknown, unknown, unknown>;
        readonly builders: BaselineBuilders<TItem, unknown, unknown, unknown>;
        readonly chunkItems?: number;
    };
    visibleEntities(session: string, context: WorldModeContext<TState>): ReadonlyMap<string, TEntity>;
    baselineItems?(session: string, entities: ReadonlyMap<string, TEntity>, context: WorldModeContext<TState>): readonly TItem[];
    readonly limits?: {
        readonly interestMaxEntities?: number;
        readonly outboundQueueMaxMessages?: number;
    };
}

export interface WorldModeContext<TState extends WorldStateLifecycle = WorldStateLifecycle> {
    readonly state: TState;
    readonly sId: number;
    readonly instanceId: string;
    readonly mapId: string;
    readonly line: number;
    readonly authorityEpoch: number;
    readonly fixedStepMs: number;
    /** 确定性随机流（种子 = 分线种子；⛔ mode 不得自己缓存底层流对象）。 */
    readonly random: {
        next(): number;
        nextInt(min: number, max: number): number;
    };
    /** 在座会话快照（入座序）。 */
    sessions(): readonly WorldSessionInfo[];
    sessionOf(session: string): WorldSessionInfo | null;
    /** 按会话出站（perSession token 与全房 token 都可；壳按 tick 排空）。 */
    sendS2C<TPayload>(session: string, token: GameplayS2CToken<TPayload>, payload: TPayload): void;
    /** 分线广播（perSession token 在此 fail-closed）。 */
    broadcastS2C<TPayload>(token: GameplayS2CToken<TPayload>, payload: TPayload): void;
    /** mode 请求 Draining（GM 关图 / 内容包热切等）；壳走同一状态机。 */
    requestDrain(reason: string): void;
    /** 观察者同步端口（MF5b）：视野流 / 本人私有流 / baseline 请求；无 observer 能力时 requestBaseline / nextSeq 抛。 */
    readonly observers: WorldModeObserverPorts;
    /** durable 命令（MF7b）：追加到本分线的事件缓冲（返回分线内单调 seq），随下一个分线检查点同一事务落库；无 eventTable ⇒ 抛。 */
    readonly events: { append(kind: string, payload: unknown): number };
    /** 强制点（§4.5 / §7.3：checkpointOnDeath / setVar durable / 交接）：本固定步末尾立即取检查点（含事件批）。 */
    requestCheckpoint(reason: string): void;
}

/**
 * §4.5 十个钩子：
 *  onWorldInit ← matchInit / Map 装载；onRestore ← 分线级检查点回灌；onBeforeAdmit（异步预热，唯一允许 await 的准入钩子）+ onAdmit
 *  （同步、无副作用）← matchJoinAttempt；onEnter / onLeave ← matchJoin / matchLeave；onStep ← matchLoop；onCheckpoint ← 周期 / 强制存档；
 *  onDrain ← matchTerminate；onSignal ← matchSignal；primaryEntityOf ← 附近聊天 / 兴趣集锚点。
 */
export interface WorldMode<TState extends WorldStateLifecycle = WorldStateLifecycle> {
    readonly id: string;
    /** 会话表容量（WorldRoom 建房时闸 ≤ manifest.maxPlayers）。 */
    readonly capacity: number;
    /** 接受的 C2S 消息名集合（= 本玩法 wire token 的键集；dispatcher 的 owner 闸之外再按此表拒陌生命令）。 */
    readonly commands: readonly string[];
    onWorldInit(context: WorldModeContext<TState>, info: { readonly recovered: boolean }): void | Promise<void>;
    onRestore?(context: WorldModeContext<TState>, snapshot: WorldCheckpoint): void;
    onBeforeAdmit?(context: WorldModeContext<TState>, request: WorldAdmitRequest): void | Promise<void>;
    /** 返回 false 拒绝；⛔ 不得分配资源（重复 / 满员检查与资源所有权的原子性靠它同步）。 */
    onAdmit?(context: WorldModeContext<TState>, request: WorldAdmitRequest): boolean | void;
    onEnter?(context: WorldModeContext<TState>, session: WorldSessionInfo): void;
    onLeave?(context: WorldModeContext<TState>, session: WorldSessionInfo, reason: WorldLeaveReason): void;
    onStep(context: WorldModeContext<TState>, step: { readonly tick: number; readonly dtMs: number; readonly commands: readonly WorldCommand[] }): void;
    onCheckpoint?(context: WorldModeContext<TState>): WorldCheckpoint;
    onDrain?(context: WorldModeContext<TState>, info: { readonly reason: string; readonly graceMs: number }): void;
    onSignal?(context: WorldModeContext<TState>, signal: { readonly kind: string; readonly payload: unknown }): void;
    primaryEntityOf?(session: string): string | null;
    /** 可选观察者能力（MF5b）：声明即由 WorldRuntime 做差分 / baseline / 有界投递。 */
    readonly observer?: WorldModeObserverCapability<TState, ObservedEntity, unknown>;
    /** 可选检查点能力（MF7b）：声明即由 WorldRoom 周期 / 强制落盘、Recovering 回灌、准入 load persona 检查点。 */
    readonly checkpoint?: WorldModeCheckpointCapability;
}

/** 世界玩法的最小身份（registry 只按 id 登记 factory）。 */
export interface WorldModeLike {
    readonly id: string;
}

export type WorldModeFactory<TMode extends WorldModeLike = WorldMode> = () => TMode;

/** 建 mode 实例时的契约闸（组合根 / 注入路径共用）：id / capacity / commands 形状。 */
export function assertWorldModeContract(mode: unknown, key: string): asserts mode is WorldMode {
    if (!mode || typeof mode !== "object") throw new TypeError(`[WorldMode] ${key} 不是对象`);
    const candidate = mode as Partial<WorldMode>;
    if (candidate.id !== key) throw new TypeError(`[WorldMode] ${key} 的 id 与登记键不一致：${String(candidate.id)}`);
    if (!Number.isSafeInteger(candidate.capacity) || (candidate.capacity as number) < 1 || (candidate.capacity as number) > 1024) {
        throw new TypeError(`[WorldMode] ${key} 的 capacity 必须是 1..1024 的整数`);
    }
    if (!Array.isArray(candidate.commands) || candidate.commands.some((type) => typeof type !== "string" || !type.startsWith("c2s."))) {
        throw new TypeError(`[WorldMode] ${key} 的 commands 必须是 c2s.* 消息名数组`);
    }
    if (typeof candidate.onWorldInit !== "function" || typeof candidate.onStep !== "function") {
        throw new TypeError(`[WorldMode] ${key} 必须实现 onWorldInit 与 onStep`);
    }
}

export class WorldModeRegistry<TMode extends WorldModeLike = WorldMode> {
    private readonly factories = new Map<string, WorldModeFactory<TMode>>();

    /** 同 id 二次登记即 throw（组合根的重复装配是配置错误，⛔ 不静默覆盖）；返回注销函数。 */
    register(id: string, factory: WorldModeFactory<TMode>): () => void {
        if (typeof id !== "string" || id.length === 0) throw new TypeError("[WorldModeRegistry] id 必须非空");
        if (typeof factory !== "function") throw new TypeError(`[WorldModeRegistry] ${id} 的 factory 必须是函数`);
        if (this.factories.has(id)) throw new Error(`[WorldModeRegistry] world mode 重复登记：${id}`);
        this.factories.set(id, factory);
        return () => {
            if (this.factories.get(id) === factory) this.factories.delete(id);
        };
    }

    has(id: string): boolean {
        return this.factories.has(id);
    }

    ids(): readonly string[] {
        return [...this.factories.keys()];
    }

    /** 建一个 mode 实例；factory 返回的 id 必须与登记 id 一致（fail-closed），并过契约闸。 */
    create(id: string): TMode {
        const factory = this.factories.get(id);
        if (!factory) throw new Error(`[WorldModeRegistry] 未登记的 world mode：${id}`);
        const mode = factory();
        if (!mode || typeof mode !== "object" || mode.id !== id) {
            throw new TypeError(`[WorldModeRegistry] ${id} 的 factory 返回了 id 不一致的 mode`);
        }
        assertWorldModeContract(mode, id);
        return mode;
    }
}

/** 生产 world mode 登记表（WorldRoom 的组合根；MF4-B6 的 WorldRoom 从这里 create）。 */
export const worldModeRegistry = new WorldModeRegistry();
