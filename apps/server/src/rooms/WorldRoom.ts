/**
 * WorldRoom（MMO MF4-B6，docs/MMO.md §4.5 / §4.6 / §5.4 MF4）：世界形态玩法（manifest `kind:"world"`）的**传输壳**。
 * 模拟与传输分离（§4.6-5）：全部规则在无头 `rooms/core/WorldRuntime.ts`；本壳只做四件事——喂 `enqueue`、按 tick 调 `advance`、
 * 经 `S2CPorts` 排空出站、把租约失效 / GM / mode 请求映射成 Draining。⛔ 不持玩法状态、⛔ 不读 join options 做准入判定。
 *
 * 建房 `onCreate`（Recovering）：信封（RoomAuth 同口径）→ world mode / modeVersion / profile 恒 "world" → `WorldDirectory (sId, mapId, line)`
 * → 实例行 → Redis 权威租约（`WorldLease`）→ MySQL 权威 CAS（`acquireAuthority`）→ 生成 root Schema → `WorldRuntime.recover`（MF7b 起带
 * 检查点回灌）→ `world_instance.state = active` → 续租循环。任一步失败即释放已取租约并拒绝建房（⛔ 不留半成功的世界房）。
 * `autoDispose = false`：空房按 manifest.world 三策略处理（sleep / run / unload），⛔ 不因最后一人离开而 dispose。
 *
 * 准入 `onJoin` 固定时序 ⛔ 不得重排：
 *  ① 生命周期（Draining / Offline ⇒ WorldDraining；未 Active ⇒ WorldNotAuthoritative）
 *  ② onAuth 权威值 vs 房间常量（sId / mode / profile / mapId / line：joinById 直连闸，⛔ 不读 options）
 *  ③ 容量（在座 + pending）　④ 同会话重复 / pending 同 persona
 *  ⑤ persona 归属（存储真源 `readPersonaOwner`：不存在 PersonaNotFound；非本账号 / inactive ⇒ BadRequest）
 *  ⑥ ticket 端口（MF4 占位 `placeholderWorldTicketPort`，MF8 换 WorldTicket；只见 sha256）
 *  ⑦ `onBeforeAdmit`（唯一允许 await 的 mode 准入钩子）
 *  ⑧ 控制权 CAS `acquireControl`（同 persona 两处 join 只一个赢家；输家 ControlConflict）
 *  ⑨ await 后重验生命周期；本房同 persona 的旧会话按存储裁决离座（lost-control，关闭码 = 顶号 Replaced）
 *  ⑩ `WorldRuntime.admit`（同步：容量 / 重复 / mode.onAdmit）→ 落座。⑧ 之后任何拒绝都归还刚拿到的控制权（best-effort，tracked）。
 *
 * C2S：catch-all `messages["_"]` → `WireDispatcher`（预算 / owner / validate / phase）→ `runtime.enqueue`（下一固定步交 onStep）。
 * world 玩法 wire token 的 phases 以 `GamePhase.Playing` 表示 `WorldPhase.Active`（dispatcher 共用 GamePhase 词表；非 Active 映射为 Settle ⇒ 只放 Ping）。
 * 出站：mode 的 sendS2C / broadcastS2C 进本 tick 有序 outbox，`advance` 末尾经 `S2CPorts` 排空（perSession 广播 fail-closed；MF5b 换 OutboundQueue）。
 * 生命周期：`drain(reason)`（Draining：停收准入与命令、仍推进 graceMs）⇒ `finalizeOffline`（强制检查点 → Offline：全员 drained 离座并
 * WITH_ERROR 关闭、归还控制权、释放租约、`state = offline`、dispose）。空实例 unload 策略与 mode.requestDrain 走同一条路。
 */
import { createHash } from "node:crypto";
import { Room, CloseCode, type AuthContext, type Client } from "colyseus";
import {
    C2S,
    ErrorCode,
    ForceLogoutReason,
    GAMEPLAY_CATALOG,
    GamePhase,
    KICK_CLOSE_CODE,
    S2C,
    TICK_MS,
    WORLD_ROOM_PROTOCOL_VERSION,
    WorldPhase,
    validateWorldRoomJoinOptions,
    type C2SType,
    type ErrorCodeType,
    type GamePhaseType,
    type GameplayS2CToken,
    type IPingReq,
    type IPongRes,
    type IWorldRoomJoinOptions,
    type WorldPhaseType,
} from "@game/shared";
import { NODE_ID, normalizeSId } from "../core/infra/config";
import { ControlConflictError, PersonaNotFoundError, WorldNotAuthoritativeError, joinRefused } from "../core/errors";
import { trackTask } from "../core/infra/lifecycle";
import { verifyAndCacheWebPlatformSession } from "../platform/webPlatformClient";
import { catalogModeVersion, createRoomAuth, type RoomAuthResult } from "./core/RoomAuth";
import { modeDeclaresProfile } from "./core/RoomProfile";
import { GAME_ROOM_MAX_MESSAGES_PER_SECOND } from "./core/MessageBudget";
import { ReconnectGrace } from "./core/ReconnectGrace";
import { S2CPorts } from "./core/S2CPorts";
import { defaultWireRateCost, WireDispatcher } from "./core/WireDispatcher";
import { WorldLease } from "./core/WorldLease";
import { WorldRuntime, type WorldCheckpointBatch } from "./core/WorldRuntime";
import { WorldCheckpointer } from "./core/WorldCheckpoint";
import { AuthorityLostError } from "./core/WorldTx";
import { DEFAULT_WORLD_LINE, worldAddressOf, worldDirectory, type WorldDirectoryPort } from "./core/WorldDirectory";
import {
    WORLD_PROFILE_ID, placeholderWorldTicketPort, resolveWorldProfile, type WorldProfile, type WorldTicketPort,
} from "./core/WorldProfile";
import {
    acquireAuthority, acquireControl, readPersonaOwner, releaseControl, setInstanceState, type PersonaOwner, type WorldInstanceState,
} from "./core/control";
import { createRoomStateForMode, ROOM_STATE_KIND } from "./schema/GameRoomState";
import {
    assertWorldModeContract, worldModeRegistry, type WorldAdmitRequest, type WorldLeaveReason, type WorldMode, type WorldStateLifecycle,
} from "./WorldMode";
import type { CheckpointEnvelope } from "./core/CheckpointPort";
import type { WorldManifestConfig } from "../../tools/gameplay-codegen/manifestSchema";

/** 生产 root 由 codegen 生成（Schema，`kind:"world"` 根必填集）；注入路径（单测 / 回放）由调用方保证形状。 */
export type WorldRoomState = WorldStateLifecycle;
type RuntimeWorldMode = WorldMode<any>;

/** onAuth 产出、只有 onJoin 才信的权威值：RoomAuth 四元组 + 世界信封（ticket 只以 sha256 进壳 / mode，⛔ 明文不进 client.auth / state / 日志）。 */
export interface WorldRoomAuth extends RoomAuthResult {
    readonly mapId: string;
    readonly line: number | null;
    readonly personaId: string;
    readonly ticketSha256: string;
    readonly resumeSeq: number | null;
}

export interface WorldLeaseHandle {
    readonly value: string;
    readonly fence: number;
    start(onLost: (reason: "lost" | "expired") => void): void;
    stop(): void;
    release(): Promise<boolean>;
}

export interface WorldLeasePort {
    acquire(sId: number, instanceId: string, holder: string): Promise<WorldLeaseHandle | null>;
}

/** MySQL 侧权威 / 控制权（rooms/core/control.ts）的可注入面。 */
export interface WorldControlPort {
    acquireAuthority(sId: number, instanceId: string, holder: string, expectedEpoch: number): Promise<number>;
    setInstanceState(sId: number, instanceId: string, authorityEpoch: number, state: WorldInstanceState): Promise<void>;
    readPersonaOwner(sId: number, personaId: string): Promise<PersonaOwner | null>;
    acquireControl(sId: number, personaId: string, worldAddress: string, expectedEpoch: number): Promise<number>;
    releaseControl(sId: number, personaId: string, controlEpoch: number): Promise<boolean>;
}

export interface WorldRoomTimers {
    set(fn: () => void, ms: number): unknown;
    clear(handle: unknown): void;
}

export const defaultWorldLeasePort: WorldLeasePort = {
    acquire: (sId, instanceId, holder) => WorldLease.acquire(sId, instanceId, holder),
};

export const defaultWorldControlPort: WorldControlPort = {
    acquireAuthority: (sId, instanceId, holder, expectedEpoch) => acquireAuthority(sId, instanceId, holder, expectedEpoch),
    setInstanceState: (sId, instanceId, authorityEpoch, state) => setInstanceState(sId, instanceId, authorityEpoch, state),
    readPersonaOwner: (sId, personaId) => readPersonaOwner(sId, personaId),
    acquireControl: (sId, personaId, worldAddress, expectedEpoch) => acquireControl(sId, personaId, worldAddress, expectedEpoch),
    releaseControl: (sId, personaId, controlEpoch) => releaseControl(sId, personaId, controlEpoch),
};

const defaultTimers: WorldRoomTimers = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export interface WorldRoomRuntimeOptions {
    /** 注入 mode（单测 / 回放）；生产从 worldModeRegistry.create。 */
    readonly mode?: RuntimeWorldMode;
    /** 注入 root（单测）；生产 createRoomStateForMode（生成 Schema）。 */
    readonly state?: () => WorldRoomState;
    /** 空实例策略（注入优先；生产读 catalog；注入的 mode 不在 catalog 时必填）。 */
    readonly world?: WorldManifestConfig;
    readonly seed?: number;
    readonly fixedStepMs?: number;
    readonly clock?: () => number;
    readonly control?: WorldControlPort;
    readonly lease?: WorldLeasePort;
    readonly directory?: WorldDirectoryPort;
    readonly tickets?: WorldTicketPort;
    /** 租约 / 权威持有者标识（缺省 `<roomId>@<NODE_ID>`）。 */
    readonly holder?: string;
    readonly drainGraceMs?: number;
    readonly timers?: WorldRoomTimers;
    /** 检查点记录器（单测 / 回放）：mode 未声明 checkpoint 能力时的落点；声明了则走 WorldCheckpointer（同一世界事务落盘）。 */
    readonly checkpointSink?: (batch: WorldCheckpointBatch, reason: "periodic" | "forced") => void;
    /** 注入检查点编排（单测：假世界事务 + MemoryCheckpointPort）；生产按 mode.checkpoint 自建。 */
    readonly checkpointer?: WorldCheckpointer;
    /** 测试 / 回放：不起 setSimulationInterval，由调用方直接 advance(dt)。 */
    readonly manualTick?: boolean;
}

/** Draining 宽限（在途交接 / 强制检查点由壳编排；MF8 交接落地后按 §11.2 冻结）。 */
export const WORLD_DRAIN_GRACE_MS = 5_000;
/** 世界 Offline 时会话的关闭码：⛔ 不是可重连（客户端须经 world.enter 重新进入）。 */
export const WORLD_DRAINED_CLOSE_CODE: number = CloseCode.WITH_ERROR;
/** 同 persona 在别处取得控制权 ⇒ 本会话失控制权：与大厅顶号同一关闭码。 */
export const WORLD_LOST_CONTROL_CLOSE_CODE: number = KICK_CLOSE_CODE[ForceLogoutReason.Replaced];

const SHA256_HEX = /^[0-9a-f]{64}$/u;
const MAX_TICK_RATE = 240;
const sha256Hex = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

let seedSequence = 0;
function nextRoomSeed(): number {
    seedSequence = (seedSequence + 1) >>> 0;
    return ((Date.now() >>> 0) ^ seedSequence) >>> 0;
}
function normalizeSeed(seed: number | undefined): number {
    return typeof seed === "number" && Number.isFinite(seed) && Number.isInteger(seed) ? seed >>> 0 : nextRoomSeed();
}
function normalizeFixedStep(step: number | undefined): number {
    return typeof step === "number" && Number.isSafeInteger(step) && step >= 1 && step <= 1000 && Math.round(1000 / step) <= MAX_TICK_RATE
        ? step
        : TICK_MS;
}

type CatalogEntry = { readonly maxPlayers: number; readonly kind?: "match" | "world"; readonly world: WorldManifestConfig | null };
function catalogEntry(mode: string): CatalogEntry | null {
    return (GAMEPLAY_CATALOG as unknown as Readonly<Partial<Record<string, CatalogEntry>>>)[mode] ?? null;
}

/** WorldRuntime.admit 的非 admitted 结果 → join 拒绝码。 */
const ADMIT_REFUSAL: Readonly<Record<"draining" | "not-active" | "full" | "duplicate" | "refused", ErrorCodeType>> = Object.freeze({
    "draining": ErrorCode.WorldDraining,
    "not-active": ErrorCode.WorldNotAuthoritative,
    "full": ErrorCode.RoomFull,
    "duplicate": ErrorCode.AlreadyInRoom,
    "refused": ErrorCode.BadRequest,
});

/** WorldRoom 房型：协议整数 = WORLD_ROOM_PROTOCOL_VERSION、信封校验器 = validateWorldRoomJoinOptions（protocol-version-matrix 钉此绑定）。 */
export const worldRoomAuth = createRoomAuth<IWorldRoomJoinOptions>({
    protocolVersion: WORLD_ROOM_PROTOCOL_VERSION,
    validateJoinOptions: validateWorldRoomJoinOptions,
    modeRegistered: (mode) => worldModeRegistry.has(mode),
    catalogModeVersion,
    modeDeclaresProfile,
    verifySession: verifyAndCacheWebPlatformSession,
});

interface OutboxEntry {
    /** null = 分线广播。 */
    readonly session: string | null;
    readonly token: GameplayS2CToken<unknown>;
    readonly payload: unknown;
}

export class WorldRoom extends Room {
    /** onCreate 按 mode.capacity 赋（会话表容量；⛔ 不按 state）。 */
    maxClients = 1;
    maxMessagesPerSecond = GAME_ROOM_MAX_MESSAGES_PER_SECOND;
    /** 空实例策略归 manifest.world（sleep / run / unload），⛔ 不用 Colyseus 的最后一人 dispose。 */
    autoDispose = false;
    patchRate = 50;
    /** 真实 root 由 mode 决定（生成的 world 根）；壳只见生命周期字段。 */
    declare readonly state: WorldRoomState;

    /** Colyseus 0.17 catch-all（同 GameRoom：必须是实例字段、⛔ 不得再注册任何具名 handler）。 */
    messages = {
        "_": (client: Client, type: unknown, message: unknown) => this.dispatcher.dispatch(client, type, message),
    };

    private mode: RuntimeWorldMode | null;
    private readonly injectedMode: RuntimeWorldMode | null;
    private modeId: string;
    private profile: WorldProfile | null = null;
    private readonly stateFactory: (() => WorldRoomState) | null;
    private readonly worldConfig: WorldManifestConfig | null;
    private worldState: WorldRoomState | null = null;
    private runtime: WorldRuntime<WorldRoomState> | null = null;
    private lease: WorldLeaseHandle | null = null;
    private readonly seed: number;
    private readonly fixedStepMs: number;
    private readonly clockFn: () => number;
    private readonly deps: {
        readonly control: WorldControlPort;
        readonly lease: WorldLeasePort;
        readonly directory: WorldDirectoryPort;
        readonly tickets: WorldTicketPort;
        readonly holder: string | null;
        readonly drainGraceMs: number;
        readonly timers: WorldRoomTimers;
        readonly checkpointSink: ((batch: WorldCheckpointBatch, reason: "periodic" | "forced") => void) | null;
        readonly checkpointer: WorldCheckpointer | null;
        readonly manualTick: boolean;
    };
    private checkpointer: WorldCheckpointer | null = null;
    /** 落盘串行链（批次按 rev 顺序落库；失败回滚不影响后续批次）。 */
    private checkpointChain: Promise<void> = Promise.resolve();
    /** MF3 共享层：dispatcher（含每会话预算）/ 出站口 / 重连宽限；壳只消费。 */
    private readonly dispatcher: WireDispatcher;
    private readonly ports: S2CPorts;
    private readonly reconnectGrace: ReconnectGrace;
    /** 在座会话 → 连接（名册真源在 WorldRuntime 会话表；这里只是传输落点）。 */
    private readonly clientOf = new Map<string, Client>();
    /** 宽限中的会话（座位保留、出站暂停）。 */
    private readonly awayClients = new Set<string>();
    /** 准入 ⑤–⑩ 的异步段占位（容量计算含 pending，失败无泄漏）。 */
    private readonly pendingAdmissions = new Map<string, { readonly userId: string; readonly personaId: string }>();
    private readonly outbox: OutboxEntry[] = [];
    private drainTimer: unknown = null;
    private finalizing = false;
    private creationConfigured = false;
    private disposed = false;
    private disposePromise: Promise<void> | null = null;
    private lifecycleGeneration = 0;
    private sId = 0;
    private mapId = "";
    private line = DEFAULT_WORLD_LINE;
    private instanceId = "";
    private authorityEpoch = 0;

    constructor(options: WorldRoomRuntimeOptions = {}) {
        super();
        this.injectedMode = options.mode ?? null;
        if (this.injectedMode) assertWorldModeContract(this.injectedMode, this.injectedMode.id);
        this.mode = this.injectedMode;
        this.modeId = this.injectedMode?.id ?? "";
        this.stateFactory = options.state ?? null;
        this.worldConfig = options.world ?? null;
        this.seed = normalizeSeed(options.seed);
        this.fixedStepMs = normalizeFixedStep(options.fixedStepMs);
        this.clockFn = options.clock ?? (() => Date.now());
        this.deps = {
            control: options.control ?? defaultWorldControlPort,
            lease: options.lease ?? defaultWorldLeasePort,
            directory: options.directory ?? worldDirectory,
            tickets: options.tickets ?? placeholderWorldTicketPort,
            holder: options.holder ?? null,
            drainGraceMs: options.drainGraceMs ?? WORLD_DRAIN_GRACE_MS,
            timers: options.timers ?? defaultTimers,
            checkpointSink: options.checkpointSink ?? null,
            checkpointer: options.checkpointer ?? null,
            manualTick: options.manualTick === true,
        };
        this.ports = new S2CPorts({
            isDisposed: () => this.disposed,
            modeId: () => this.modeId,
            broadcast: (type, wire) => this.deliverBroadcast(type, wire),
        });
        this.dispatcher = new WireDispatcher({
            isDisposed: () => this.disposed,
            requireModeId: () => this.requireMode().id,
            rateCostOf: defaultWireRateCost,
            currentPhase: () => this.dispatchPhase(),
            corePhaseAllows: (type, phase) => this.corePhaseAllows(type, phase),
            sendError: (client, code) => this.ports.sendError(client, code),
            handleCore: (client, type, payload) => this.handleCoreMessage(client, type, payload),
            handleMode: (client, type, payload) => this.handleModeCommand(client, type, payload),
        }, { limitPerSecond: GAME_ROOM_MAX_MESSAGES_PER_SECOND, now: () => this.now() });
        this.reconnectGrace = new ReconnectGrace({
            allowReconnection: (client, seconds) => this.allowReconnection(client, seconds),
            generation: () => this.lifecycleGeneration,
            isDisposed: () => this.disposed,
        });
    }

    // ── 建连 / 建房 ─────────────────────────────────────────────────────────────

    /** 六步固定序全在 rooms/core/RoomAuth.ts（协议整数与信封校验器由 worldRoomAuth 注入）；再把世界信封的权威值挂到 client.auth。 */
    static async onAuth(token: string, options: IWorldRoomJoinOptions | undefined, _context: AuthContext): Promise<WorldRoomAuth> {
        const auth = await worldRoomAuth.authenticate(token, options);
        const joinOptions = worldRoomAuth.assertEnvelope(options);
        return {
            ...auth,
            mapId: joinOptions.mapId,
            line: joinOptions.line ?? null,
            personaId: joinOptions.personaId,
            ticketSha256: sha256Hex(joinOptions.ticket),
            resumeSeq: joinOptions.resumeSeq ?? null,
        };
    }

    async onCreate(options: IWorldRoomJoinOptions | undefined): Promise<void> {
        if (this.disposed) return;
        if (this.creationConfigured) throw joinRefused(ErrorCode.BadRequest);
        // join 信封 + 协议整数硬闸与 onAuth 同口径（RoomAuth.assertEnvelope）。
        const joinOptions = worldRoomAuth.assertEnvelope(options);
        const sId = normalizeSId(joinOptions.sId);
        if (sId === null) throw joinRefused(ErrorCode.WrongServer);
        if (!this.injectedMode) {
            // ⛔ 未登记 world mode 一律拒绝（match 形态玩法在 gameModeRegistry，不在这张表）。
            if (!worldModeRegistry.has(joinOptions.mode)) throw joinRefused(ErrorCode.BadRequest);
            this.mode = worldModeRegistry.create(joinOptions.mode);
        } else if (joinOptions.mode !== this.injectedMode.id) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        const mode = this.requireMode();
        this.modeId = mode.id;
        // per-mode 契约版本闸（§4.8 第三层，与 onAuth 同口径）：catalog 缺席仅注入式测试 mode 放行。
        const expectedModeVersion = catalogModeVersion(this.modeId);
        if (expectedModeVersion === null ? !this.injectedMode : joinOptions.modeVersion !== expectedModeVersion) {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
        // profile 恒 "world"（WorldProfile：AccessPolicy world-ticket、无 StartPolicy）。
        if (joinOptions.profile !== WORLD_PROFILE_ID) throw joinRefused(ErrorCode.BadRequest);
        const entry = catalogEntry(this.modeId);
        if (entry) {
            try {
                this.profile = resolveWorldProfile(this.modeId, joinOptions.profile);
            } catch (error) {
                console.warn(`[WorldRoom ${this.roomId}] profile 解析拒绝 mode=${this.modeId}`, error instanceof Error ? error.message : error);
                throw joinRefused(ErrorCode.BadRequest);
            }
            if (mode.capacity > entry.maxPlayers) {
                throw new Error(`[WorldRoom] mode ${this.modeId} 的 capacity ${mode.capacity} 超过 manifest.maxPlayers ${entry.maxPlayers}`);
            }
        } else if (!this.injectedMode) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        const world = this.worldConfig ?? entry?.world ?? null;
        if (!world) throw new Error(`[WorldRoom] mode ${this.modeId} 缺空实例策略（manifest.world，或注入 mode 时随 options.world 注入）`);
        this.maxClients = mode.capacity;
        this.sId = sId;
        // 目录：(sId, mapId, line) → 实例行（新鲜 authority_epoch）。
        const instance = await this.deps.directory.resolve(sId, joinOptions.mapId, joinOptions.line ?? DEFAULT_WORLD_LINE);
        this.mapId = instance.mapId;
        this.line = instance.line;
        this.instanceId = instance.instanceId;
        // Recovering：租约（谁能开始）→ 权威 epoch（谁的提交算数）→ 装载 → Active。
        const holder = this.holderId();
        const lease = await this.deps.lease.acquire(sId, this.instanceId, holder);
        if (!lease) {
            console.warn(`[WorldRoom ${this.roomId}] 分线 ${worldAddressOf(sId, this.mapId, this.line)} 的租约被持有，拒绝建房`);
            throw joinRefused(ErrorCode.WorldNotAuthoritative);
        }
        this.lease = lease;
        try {
            this.authorityEpoch = await this.deps.control.acquireAuthority(sId, this.instanceId, holder, instance.authorityEpoch);
        } catch (error) {
            await this.releaseLease();
            if (error instanceof WorldNotAuthoritativeError) throw joinRefused(ErrorCode.WorldNotAuthoritative);
            throw error;
        }
        // MF7b：检查点编排（注入优先；mode 声明 checkpoint 能力即自建）
        this.checkpointer = this.deps.checkpointer ?? (mode.checkpoint ? new WorldCheckpointer(mode.checkpoint, sId) : null);
        const state = this.selectState(mode);
        const runtime = new WorldRuntime<WorldRoomState>({
            mode,
            state,
            sId,
            fixedStepMs: this.fixedStepMs,
            seed: this.seed,
            now: () => this.now(),
            world,
            ports: {
                sendS2C: (session, token, payload) => { this.outbox.push({ session, token, payload }); },
                broadcastS2C: (token, payload) => { this.outbox.push({ session: null, token, payload }); },
                onDrainRequested: (reason) => this.drain(`mode:${reason}`),
                ...(this.checkpointer
                    ? { onCheckpoint: (batch: WorldCheckpointBatch) => { this.persistCheckpoint(batch); } }
                    : this.deps.checkpointSink ? { onCheckpoint: this.deps.checkpointSink } : {}),
            },
        });
        this.runtime = runtime;
        try {
            // §4.5 Recovering：loadInstance 检查点（校验版本窗口 / stateHash，不兼容 fail-closed）→ superseded 事件行 → onRestore → Active
            let restored: CheckpointEnvelope | null = null;
            if (this.checkpointer) {
                restored = await this.checkpointer.loadInstance(this.instanceId);
                const superseded = await this.checkpointer.supersede(this.instanceId, restored?.rev ?? 0);
                if (superseded > 0) console.warn(`[WorldRoom ${this.roomId}] Recovering：${superseded} 条事件属已丢失的未来，标 superseded`);
            }
            await runtime.recover({ instanceId: this.instanceId, mapId: this.mapId, line: this.line, authorityEpoch: this.authorityEpoch, checkpoint: restored });
            await this.deps.control.setInstanceState(sId, this.instanceId, this.authorityEpoch, "active");
        } catch (error) {
            await this.releaseLease();
            if (error instanceof WorldNotAuthoritativeError) throw joinRefused(ErrorCode.WorldNotAuthoritative);
            throw error;
        }
        lease.start((reason) => this.drain(`lease-${reason}`));
        this.creationConfigured = true;
        if (!this.deps.manualTick) this.setSimulationInterval((dt) => { this.advance(dt); }, this.fixedStepMs);
        console.log(`[WorldRoom ${this.roomId}] 创建 ${worldAddressOf(sId, this.mapId, this.line)} instance=${this.instanceId} epoch=${this.authorityEpoch} holder=${holder}`);
    }

    // ── 准入 / 离开 ─────────────────────────────────────────────────────────────

    async onJoin(client: Client, _options: unknown): Promise<void> {
        const runtime = this.requireRuntime();
        const mode = this.requireMode();
        // ① 生命周期
        if (this.disposed || runtime.phase === WorldPhase.Draining || runtime.phase === WorldPhase.Offline) throw joinRefused(ErrorCode.WorldDraining);
        if (runtime.phase !== WorldPhase.Active) throw joinRefused(ErrorCode.WorldNotAuthoritative);
        // ② onAuth 权威值 vs 房间常量（filterBy 只约束 joinOrCreate；joinById 可指定任意房间，⛔ 不比较 options）
        const auth = client.auth as WorldRoomAuth | undefined;
        if (!auth || typeof auth.userId !== "string" || auth.userId.length < 1 || auth.sId !== this.sId) throw joinRefused(ErrorCode.WrongServer);
        if (auth.mode !== this.modeId || auth.profile !== WORLD_PROFILE_ID) throw joinRefused(ErrorCode.BadRequest);
        if (auth.mapId !== this.mapId || (auth.line !== null && auth.line !== this.line)) throw joinRefused(ErrorCode.BadRequest);
        if (typeof auth.personaId !== "string" || auth.personaId.length < 1 || typeof auth.ticketSha256 !== "string" || !SHA256_HEX.test(auth.ticketSha256)) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // ③ 容量（含 pending 占位）
        if (runtime.sessions().length + this.pendingAdmissions.size >= mode.capacity) throw joinRefused(ErrorCode.RoomFull);
        // ④ 同会话重复 / pending 同 persona（在座同 persona 的裁决交给 ⑧ 的存储 CAS：新控制者赢，见 ⑨）
        if (this.clientOf.has(client.sessionId) || this.pendingAdmissions.has(client.sessionId)) throw joinRefused(ErrorCode.AlreadyInRoom);
        for (const pending of this.pendingAdmissions.values()) {
            if (pending.personaId === auth.personaId) throw joinRefused(ErrorCode.ControlConflict);
        }
        this.pendingAdmissions.set(client.sessionId, { userId: auth.userId, personaId: auth.personaId });
        const generation = this.lifecycleGeneration;
        let heldControl: number | null = null;
        try {
            // ⑤ persona 归属（存储真源；⛔ 不信 options / auth 自报的归属）
            const owner = await this.deps.control.readPersonaOwner(this.sId, auth.personaId);
            if (!owner) throw joinRefused(ErrorCode.PersonaNotFound);
            if (owner.userId !== auth.userId || owner.status !== 0) throw joinRefused(ErrorCode.BadRequest);
            // ⑥ ticket 端口（占位 → MF8 WorldTicket）
            const verdict = await this.deps.tickets.verify({
                sId: this.sId, userId: auth.userId, personaId: auth.personaId, mapId: this.mapId, line: this.line, ticketSha256: auth.ticketSha256,
            });
            if (verdict !== "ok") throw joinRefused(ErrorCode.WorldTicketInvalid);
            // ⑦ persona 级检查点回读（MF7b：框架校验，损坏 / 不兼容 fail-closed 拒入）+ 异步预热（⛔ 分配资源）
            let checkpoint: CheckpointEnvelope | null = null;
            if (this.checkpointer) {
                try {
                    checkpoint = await this.checkpointer.loadPersona(auth.personaId);
                } catch (error) {
                    console.error(`[WorldRoom ${this.roomId}] persona ${auth.personaId} 检查点回读失败`, error);
                    throw joinRefused(ErrorCode.BadRequest);
                }
            }
            const request: WorldAdmitRequest = {
                session: client.sessionId, userId: auth.userId, personaId: auth.personaId, controlEpoch: owner.controlEpoch,
                ticketSha256: auth.ticketSha256, resumeSeq: auth.resumeSeq, checkpoint,
            };
            try {
                await runtime.beforeAdmit(request);
            } catch (error) {
                console.error(`[WorldRoom ${this.roomId}] mode ${mode.id} before-admit 钩子失败`, error);
                throw joinRefused(ErrorCode.BadRequest);
            }
            // ⑧ 控制权 CAS（同 persona 两处 join 拿同一 expected 只一个赢家）
            try {
                heldControl = await this.deps.control.acquireControl(this.sId, auth.personaId, worldAddressOf(this.sId, this.mapId, this.line), owner.controlEpoch);
            } catch (error) {
                if (error instanceof ControlConflictError) throw joinRefused(ErrorCode.ControlConflict);
                if (error instanceof PersonaNotFoundError) throw joinRefused(ErrorCode.PersonaNotFound);
                throw error;
            }
            // ⑨ await 之后重验；本房同 persona 的旧会话按存储裁决离座（其 epoch 已被抬高，⛔ 不再归还）
            if (this.disposed || this.lifecycleGeneration !== generation || runtime.phase !== WorldPhase.Active) throw joinRefused(ErrorCode.WorldDraining);
            const stale = runtime.sessions().find((seated) => seated.personaId === auth.personaId);
            if (stale) this.evict(stale.session, "lost-control", WORLD_LOST_CONTROL_CLOSE_CODE);
            // ⑩ 同步准入 → 落座
            const outcome = runtime.admit({ ...request, controlEpoch: heldControl });
            if (outcome !== "admitted") throw joinRefused(ADMIT_REFUSAL[outcome]);
            heldControl = null; // 已落座：控制权随会话表，最终离开时归还
            this.clientOf.set(client.sessionId, client);
            console.log(`[WorldRoom ${this.roomId}] ${client.sessionId} 入座 persona=${auth.personaId}（${runtime.sessions().length}/${mode.capacity}）`);
        } catch (error) {
            if (heldControl !== null) this.releaseControlLater(auth.personaId, heldControl);
            throw error;
        } finally {
            this.pendingAdmissions.delete(client.sessionId);
        }
    }

    async onLeave(client: Client, code: number): Promise<void> {
        if (this.disposed) return;
        const runtime = this.runtime;
        // 已被顶号 / drain 离座的会话：Colyseus 迟到的 onLeave 幂等无操作。
        if (!runtime || !runtime.sessionOf(client.sessionId)) return;
        const consented = code === CloseCode.CONSENTED;
        if (!consented) {
            // 非主动断线：座位保留等重连（出站暂停、观察者积压不排空），⛔ 不重复消费 ticket / 控制权。
            this.awayClients.add(client.sessionId);
            runtime.markAway(client.sessionId, true);
            const outcome = await this.reconnectGrace.await(client);
            if (outcome === "stale") return;
            if (outcome === "reconnected") {
                this.awayClients.delete(client.sessionId);
                // 归位：runtime 标记下一 tick 先发只含兴趣集的 baseline（MF5b；⛔ 不重放宽限期间的 enter）
                runtime.markAway(client.sessionId, false);
                this.clientOf.set(client.sessionId, client);
                console.log(`[WorldRoom ${this.roomId}] ${client.sessionId} 断线后重连成功`);
                return;
            }
            if (this.disposed || !runtime.sessionOf(client.sessionId)) return;
        }
        this.finalLeave(client.sessionId, "left");
        console.log(`[WorldRoom ${this.roomId}] ${client.sessionId} 离开（${consented ? "主动" : `code=${code}，宽限已过`}），剩余 ${runtime.sessions().length} 人`);
    }

    onDispose(): Promise<void> {
        if (this.disposePromise) return this.disposePromise;
        this.disposed = true;
        this.lifecycleGeneration += 1;
        this.clearDrainTimer();
        const runtime = this.runtime;
        this.disposePromise = (async () => {
            try {
                if (runtime && runtime.phase !== WorldPhase.Offline) {
                    runtime.drain("dispose", 0);
                    runtime.offline();
                }
                await this.releaseLease();
                await this.markInstance("offline");
            } finally {
                this.clientOf.clear();
                this.awayClients.clear();
                this.pendingAdmissions.clear();
                this.dispatcher.budget.clear();
                this.outbox.length = 0;
                console.log(`[WorldRoom ${this.roomId}] 销毁`);
            }
        })();
        return this.disposePromise;
    }

    // ── 固定步 / 出站 ───────────────────────────────────────────────────────────

    /** 逻辑帧（生产由 setSimulationInterval 驱动；测试 / 回放直调）：推进 → 排空出站 → 空实例策略。返回本次步数。 */
    advance(dtMs: number): number {
        const runtime = this.runtime;
        if (!runtime || this.disposed || this.finalizing) return 0;
        const steps = runtime.advance(dtMs);
        this.flushOutbox();
        const action = runtime.evaluateEmpty();
        if (action === "slept") console.log(`[WorldRoom ${this.roomId}] 空实例休眠（sleep）：停固定步，保留租约`);
        else if (action === "unloaded") void this.finalizeOffline("empty-unload");
        return steps;
    }

    private flushOutbox(): void {
        this.flushDirectOutbox();
        this.drainObserverQueues();
    }

    /** MF5b：每 tick 把 runtime 里每会话的 perSession 积压（视野流 / 私有流 / baseline）按序 sendToken；宽限中的会话 ⛔ 不排空。 */
    private drainObserverQueues(): void {
        const runtime = this.runtime;
        if (!runtime) return;
        for (const info of runtime.sessions()) {
            if (runtime.isAway(info.session)) continue;
            const client = this.clientOf.get(info.session);
            if (!client) continue;
            for (const message of runtime.drainOutbound(info.session)) {
                try {
                    this.ports.sendToken(client, message.token, message.payload);
                } catch (error) {
                    // token owner / validator 拒是 mode 的实现缺陷：记错、丢这一条，⛔ 不让世界循环死掉
                    console.error(`[WorldRoom ${this.roomId}] mode ${this.modeId} perSession 出站被拒 ${message.token.type}`, error);
                }
            }
        }
    }

    private flushDirectOutbox(): void {
        if (this.outbox.length === 0) return;
        const batch = this.outbox.splice(0, this.outbox.length);
        for (const entry of batch) {
            try {
                if (entry.session === null) {
                    this.ports.broadcastToken(entry.token, entry.payload);
                    continue;
                }
                if (this.awayClients.has(entry.session)) continue;
                const client = this.clientOf.get(entry.session);
                if (client) this.ports.sendToken(client, entry.token, entry.payload);
            } catch (error) {
                console.error(`[WorldRoom ${this.roomId}] mode ${this.modeId} 出站 ${String(entry.token?.type)} 被拒`, error);
            }
        }
    }

    /** 分线广播落点：在座且在线的会话（⛔ 不用 Room.broadcast：名册真源是会话表）。 */
    private deliverBroadcast(type: string, wire: unknown): void {
        for (const [session, client] of this.clientOf) {
            if (this.awayClients.has(session)) continue;
            try { client.send(type, wire); } catch { /* connection may be closing */ }
        }
    }

    // ── C2S ─────────────────────────────────────────────────────────────────────

    /** dispatcher 共用 GamePhase 词表：Active ⇒ playing（玩法 token 按声明放行），其余 ⇒ settle（只放 Ping）。 */
    private dispatchPhase(): GamePhaseType {
        return this.runtime?.phase === WorldPhase.Active ? GamePhase.Playing : GamePhase.Settle;
    }

    private corePhaseAllows(type: C2SType, _phase: GamePhaseType): boolean {
        // 世界房的 core 消息只有心跳（Draining 期间也要活着）；Chat / Ready / Start 属 match 形态（附近聊天是 MF6b 的世界 token）。
        return type === C2S.Ping;
    }

    private handleCoreMessage(client: Client, type: C2SType, payload: unknown): void {
        if (type === C2S.Ping) {
            const msg = payload as IPingReq;
            const res: IPongRes = { clientTime: msg.clientTime, serverTime: this.now() };
            this.ports.send(client, S2C.Pong, res);
        }
    }

    /** 玩法命令（已过 dispatcher 固定序闸）入队；非 Active / 未在座 / 陌生命令 ⇒ 拒。 */
    private handleModeCommand(client: Client, type: C2SType, payload: unknown): void {
        const runtime = this.runtime;
        if (!runtime) {
            this.ports.sendError(client, ErrorCode.BadRequest);
            return;
        }
        if (runtime.enqueue(client.sessionId, type, payload) === "rejected") {
            this.ports.sendError(client, runtime.phase === WorldPhase.Active ? ErrorCode.BadRequest : ErrorCode.WorldDraining);
        }
    }

    // ── 生命周期 ─────────────────────────────────────────────────────────────────

    /** Draining（租约失效 / GM / mode 请求）：停收准入与命令，仍推进 graceMs 后 Offline；无人在座立即 Offline。幂等。 */
    drain(reason: string): void {
        const runtime = this.runtime;
        if (!runtime || this.disposed || this.finalizing) return;
        if (runtime.phase === WorldPhase.Draining || runtime.phase === WorldPhase.Offline) return;
        runtime.drain(reason, this.deps.drainGraceMs);
        void trackTask("world:state-draining", this.markInstance("draining"));
        console.warn(`[WorldRoom ${this.roomId}] Draining（${reason}）：停收准入与命令，${this.deps.drainGraceMs}ms 后 Offline`);
        if (runtime.sessions().length === 0 || this.deps.drainGraceMs <= 0) {
            void this.finalizeOffline(reason);
            return;
        }
        this.drainTimer = this.deps.timers.set(() => {
            this.drainTimer = null;
            void this.finalizeOffline(reason);
        }, this.deps.drainGraceMs);
    }

    /** GM / 交接信号透传 mode.onSignal。 */
    signal(kind: string, payload: unknown): void {
        this.runtime?.signal(kind, payload);
    }

    private async finalizeOffline(reason: string): Promise<void> {
        if (this.finalizing) return;
        this.finalizing = true;
        this.clearDrainTimer();
        const runtime = this.runtime;
        const seated = runtime ? runtime.sessions() : [];
        if (runtime && runtime.phase !== WorldPhase.Offline) {
            if (runtime.phase !== WorldPhase.Draining) runtime.drain(reason, 0);
            runtime.forceCheckpoint(`offline:${reason}`); // §4.5 Draining：强制检查点（MF7b 同一世界事务落盘）
            runtime.offline();
        }
        for (const info of seated) {
            this.releaseControlLater(info.personaId, info.controlEpoch);
            const client = this.clientOf.get(info.session);
            if (client) { try { client.leave(WORLD_DRAINED_CLOSE_CODE); } catch { /* connection may be closing */ } }
        }
        this.clientOf.clear();
        this.awayClients.clear();
        this.pendingAdmissions.clear();
        this.dispatcher.budget.clear();
        this.outbox.length = 0;
        await this.checkpointChain; // 最后一批（强制点）落盘完成后才释放租约 / 标 offline
        await this.releaseLease();
        await this.markInstance("offline");
        console.log(`[WorldRoom ${this.roomId}] Offline（${reason}）`);
        if (this.disposed) return;
        try {
            await this.disconnect(WORLD_DRAINED_CLOSE_CODE);
        } catch {
            // 单测 / 回放房未经 Room.__init（无 listing）：直接走 onDispose。
            await this.onDispose();
        }
    }

    // ── 内部 ─────────────────────────────────────────────────────────────────────

    private now(): number {
        return this.clockFn();
    }

    private holderId(): string {
        if (this.deps.holder) return this.deps.holder;
        const node = NODE_ID.replace(/[^A-Za-z0-9._-]/gu, "-");
        return `${this.roomId ?? "room"}@${node}`.slice(0, 64);
    }

    private requireMode(): RuntimeWorldMode {
        if (!this.mode) throw new Error("[WorldRoom] room has no world mode：onCreate 未运行且未注入 mode，未登记玩法必须 fail-fast");
        return this.mode;
    }

    private requireRuntime(): WorldRuntime<WorldRoomState> {
        if (!this.runtime) throw new Error("[WorldRoom] onCreate 未完成：没有 WorldRuntime");
        return this.runtime;
    }

    /** root 只选一次：生成 root（kind:"world" 才有生命周期必填集）或注入工厂。 */
    private selectState(mode: RuntimeWorldMode): WorldRoomState {
        if (this.worldState) return this.worldState;
        let root: WorldRoomState;
        if (this.stateFactory) {
            root = this.stateFactory();
        } else {
            const kind = (ROOM_STATE_KIND as Readonly<Partial<Record<string, string>>>)[mode.id];
            if (kind !== "world") {
                throw new Error(`[WorldRoom] mode ${mode.id} 的生成 root 不是 world 形态（manifest kind:"world" 才带 tick / phase / instanceId / mapId / line / authorityEpoch）`);
            }
            root = createRoomStateForMode(mode.id) as unknown as WorldRoomState;
        }
        if (!root || typeof root !== "object") throw new TypeError(`[WorldRoom] mode ${mode.id} 的 root 必须是对象`);
        this.setState(root);
        this.worldState = root;
        return root;
    }

    private evict(session: string, reason: WorldLeaveReason, closeCode: number): void {
        const client = this.clientOf.get(session);
        this.finalLeave(session, reason);
        if (client) { try { client.leave(closeCode); } catch { /* connection may be closing */ } }
    }

    /** 最终离座的唯一落点：强制点（persona 快照仍在座时落盘）→ 会话表 → 连接表 / 预算 → 归还控制权（lost-control 的旧 epoch 已被抬高，⛔ 不归还）。 */
    private finalLeave(session: string, reason: WorldLeaveReason): boolean {
        const runtime = this.runtime;
        if (!runtime) return false;
        const info = runtime.sessionOf(session);
        // §7.3 角色检查点「登出 / 交接强制点」：离座前取一批（含该 persona 的快照与事件批），落盘异步串行
        if (info && this.checkpointer && (runtime.phase === WorldPhase.Active || runtime.phase === WorldPhase.Draining)) runtime.forceCheckpoint(`leave:${reason}`);
        const left = runtime.leave(session, reason);
        this.clientOf.delete(session);
        this.awayClients.delete(session);
        this.dispatcher.budget.delete(session);
        if (info && reason !== "lost-control") this.releaseControlLater(info.personaId, info.controlEpoch);
        return left;
    }

    private releaseControlLater(personaId: string, controlEpoch: number): void {
        void trackTask("world:control-release", this.deps.control.releaseControl(this.sId, personaId, controlEpoch).catch((error: unknown) => {
            console.error(`[WorldRoom ${this.roomId}] 归还控制权失败 persona=${personaId} epoch=${controlEpoch}`, error);
            return false;
        }));
    }

    /** 检查点落盘（串行）：成功 ⇒ runtime.commitCheckpoint；失败 ⇒ rollbackCheckpoint（事件放回）；权威已失 ⇒ Draining。 */
    private persistCheckpoint(batch: WorldCheckpointBatch): void {
        const checkpointer = this.checkpointer;
        const runtime = this.runtime;
        if (!checkpointer || !runtime) return;
        const instanceId = this.instanceId;
        this.checkpointChain = this.checkpointChain.then(async () => {
            try {
                await checkpointer.save(instanceId, batch);
                runtime.commitCheckpoint(batch.rev);
            } catch (error) {
                runtime.rollbackCheckpoint(batch);
                console.error(`[WorldRoom ${this.roomId}] 检查点 rev=${batch.rev}（${batch.reason}）落盘失败`, error);
                if (error instanceof AuthorityLostError) this.drain("authority-lost");
            }
        });
        void trackTask("world:checkpoint", this.checkpointChain);
    }

    get checkpointRevision(): number {
        return this.runtime?.checkpointRevision ?? 0;
    }

    /** 测试 / 收尾：等待在途的检查点批次落盘。 */
    flushCheckpoints(): Promise<void> {
        return this.checkpointChain;
    }

    private async releaseLease(): Promise<void> {
        const lease = this.lease;
        this.lease = null;
        if (!lease) return;
        lease.stop();
        try { await lease.release(); } catch { /* 释放失败由 TTL 兜底 */ }
    }

    /** 权威持有者推进分线状态；权威已被接管（旧 epoch 0 行）即正确，⛔ 不覆盖新权威。 */
    private async markInstance(state: WorldInstanceState): Promise<void> {
        if (!this.instanceId || this.authorityEpoch < 1) return;
        try {
            await this.deps.control.setInstanceState(this.sId, this.instanceId, this.authorityEpoch, state);
        } catch (error) {
            if (!(error instanceof WorldNotAuthoritativeError)) console.error(`[WorldRoom ${this.roomId}] world_instance.state=${state} 写失败`, error);
        }
    }

    private clearDrainTimer(): void {
        if (this.drainTimer !== null) {
            this.deps.timers.clear(this.drainTimer);
            this.drainTimer = null;
        }
    }

    // ── 观察面（测试 / 运维只读）──────────────────────────────────────────────────

    get gameplayModeId(): string {
        return this.modeId;
    }

    get phase(): WorldPhaseType | null {
        return this.runtime?.phase ?? null;
    }

    get worldTick(): number {
        return this.runtime?.tick ?? 0;
    }

    get isSleeping(): boolean {
        return this.runtime?.isSleeping ?? false;
    }

    get pendingCommands(): number {
        return this.runtime?.pendingCommands ?? 0;
    }

    get seatedCount(): number {
        return this.runtime?.sessions().length ?? 0;
    }

    seatedSessionIds(): readonly string[] {
        return (this.runtime?.sessions() ?? []).map((info) => info.session);
    }

    get address(): { readonly sId: number; readonly mapId: string; readonly line: number; readonly instanceId: string; readonly authorityEpoch: number } {
        return { sId: this.sId, mapId: this.mapId, line: this.line, instanceId: this.instanceId, authorityEpoch: this.authorityEpoch };
    }

    get worldProfile(): WorldProfile | null {
        return this.profile;
    }

    get hasLease(): boolean {
        return this.lease !== null;
    }

    get isDisposed(): boolean {
        return this.disposed;
    }
}
