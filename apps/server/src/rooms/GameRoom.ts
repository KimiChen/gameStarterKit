import { Room, Client, CloseCode, type AuthContext, type Serializer } from "colyseus";
import { ServerError } from "@colyseus/core";
import { Schema } from "@colyseus/schema";
import {
    C2S,
    S2C,
    GAME_WIRE_OWNERS,
    GAME_WIRE_PHASES,
    GAME_WIRE_RATE_COST,
    GAMEPLAY_CATALOG,
    GamePhase,
    ErrorCode,
    ErrorMessage,
    RoomControlError,
    TICK_MS,
    MAX_PLAYERS,
    SeededRandom,
    GAME_ROOM_PROTOCOL_VERSION,
    PROJECT_DISPLAY_NAME,
    DEMO_BRAND,
    validateGameRoomJoinOptions,
    validateC2SPayload,
    validateS2CPayload,
    WireValidationError,
    type GameplayS2CToken,
    type IGameRoomJoinOptions,
    type IGameRoomAccess,
    type C2SType,
    type S2CType,
    type IPingReq,
    type IChatReq,
    type IRoomReadyReq,
    type IWelcomeRes,
    type IPongRes,
    type IChatRes,
    type IErrorRes,
    type IRoomErrorRes,
    type ErrorCodeType,
    type RoomControlErrorType,
} from "@game/shared";
import {
    createRoomStateForMode,
    GameRoomState,
    PlayerState,
    ROOM_STATE_FRAGMENTS,
    type RoomStateLifecycle,
    type RoomStateInviteRoom,
    type RoomStateOwnerReady,
} from "./schema/GameRoomState";
import {
    GAME_ROOM_START_LOCK_TIMEOUT_MS,
    GAME_ROOM_START_RETRY_FENCE_MAX_MS,
    groupAdmitsZone,
    normalizeSId,
} from "../core/infra/config";
import { safeSecretEqual } from "../core/auth/session";
import { DEFAULT_ROOM_PROFILE_ID, modeDeclaresProfile, resolveRoomProfile, type RoomProfile } from "./core/RoomProfile";
import { inviteCodeService, type InviteCodeService, type InviteLease } from "../core/rooms/invite/InviteCodeReservation";
import { accessTicketService, type AccessTicketService } from "../core/rooms/invite/AccessTicket";
import { verifyAndCacheWebPlatformSession } from "../platform/webPlatformClient";
import { joinRefused, joinRefusedAuth, toErrCode } from "../core/errors";
import {
    emitMatchEvidence, type EmitEvidenceResult,
    newMatchId,
} from "../core/match/matchConsumer";
// ⚠ 仅类型：MatchEvidenceV3 是 core 拥有的通用证据格式；本文件不 import 任何
// ballMove 规则/证据实现（它们全部住在 modes/ballMove/**）。
import type { MatchEvidenceV3 } from "../core/match/matchEvidence";
import { trackTask } from "../core/infra/lifecycle";
import {
    assertGameModeCommands,
    assertGameModeRoster,
    gameModeRegistry,
    type GameMode,
    type GameModeCommandContext,
    type GameModeContext,
} from "./GameMode";

// demo 昵称池（原 mock/data，mock 层删除后归本房间私有；真实项目从档案取昵称）
const NICK_PREFIX = ["快乐", "无敌", "神秘", "暴走", "咸鱼", "低调", "闪电", "锦鲤"];
const NICK_SUFFIX = ["小汉字", "词王", "笔画侠", "拼音怪", "部首君", "成语精"];
const randomNickname = (rng: SeededRandom): string => `${rng.pick(NICK_PREFIX)}${rng.pick(NICK_SUFFIX)}`;

type GameRoomAuth = {
    userId: string;
    /** 已由 onAuth 规范化并用对应区会话验证过，onJoin 只信该值。 */
    sId: number;
    mode: string;
    /** onAuth 已验证 ∈ catalog[mode].profiles；onJoin 用它对房间实际 profile 双查（关 joinById 串 profile 洞）。 */
    profile: string;
};

/**
 * per-mode 契约版本闸（§4.8 三层分工的第三层）：join 携带的 modeVersion 必须与本进程
 * catalog 一致，否则单玩法拒绝。⛔ 这不是 core 信封闸——GAME_ROOM_PROTOCOL_VERSION 的
 * 比较在 assertCompatibleProtocolVersion / onAuth，本函数不读 `v`。
 * 返回 null = mode 不在 catalog（生产 registry mode 必在 catalog；仅注入式测试 mode 例外）。
 */
function catalogModeVersion(mode: string): number | null {
    const entry = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, { readonly modeVersion: number }>>>)[mode];
    return entry ? entry.modeVersion : null;
}

function assertCompatibleProtocolVersion(options: unknown): void {
    let version: unknown = 1;
    try {
        if (options !== undefined) {
            if (options === null || typeof options !== "object" || Array.isArray(options)) return;
            const record = options as Record<string, unknown>;
            version = Object.prototype.hasOwnProperty.call(record, "v") ? record.v : 1;
            if (version === undefined) version = 1;
        }
    } catch {
        // The complete hostile-input validator below maps Proxy/getter failures
        // to BadRequest. This preflight exists only to preserve the legacy
        // version result when v5's newly required fields are absent.
        return;
    }
    if (typeof version === "number"
        && Number.isSafeInteger(version)
        && version >= 1
        && version <= 0xffff
        && version !== GAME_ROOM_PROTOCOL_VERSION) {
        throw joinRefused(ErrorCode.ProtocolMismatch);
    }
}

function validatedJoinOptions(options: IGameRoomJoinOptions | undefined): IGameRoomJoinOptions {
    assertCompatibleProtocolVersion(options);
    try {
        return validateGameRoomJoinOptions(options);
    } catch (error) {
        if (!(error instanceof WireValidationError)) throw error;
        if (error.path === "options.sId") {
            throw joinRefused(ErrorCode.WrongServer);
        }
        if (error.path === "options.v") {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
        if (error.path === "options.token") {
            throw joinRefused(ErrorCode.TokenExpired, "auth");
        }
        throw joinRefused(ErrorCode.BadRequest);
    }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return (typeof value === "object" && value !== null) || typeof value === "function"
        ? typeof (value as { then?: unknown }).then === "function"
        : false;
}

/** 非主动断线的重连宽限（秒）。微信小游戏切后台必断 socket，实机常态不是异常——
 *  没有宽限就等于「切个后台 = 弃赛」。回流自 Arthur 三房间标配。 */
const RECONNECT_GRACE_S = 10;

/**
 * 房间消息的应用层预算。Colyseus 也会在 transport 层按这个值做一次计数，
 * 这里保留一份房内计数是为了让直接调用 handler（以及未来的非 websocket transport）
 * 也拥有相同的边界。输入频率不是玩法契约，故只在本文件登记。
 */
export const GAME_ROOM_MAX_MESSAGES_PER_SECOND = 60;
const MAX_CATCH_UP_STEPS = 120;
/** Keep the advertised rate inside shared S2C.Welcome's runtime contract. */
const MAX_WELCOME_TICK_RATE = 240;
/** A stalled room lock must not hold a matchmaking seat forever.
 *  数值真源迁至 core/infra/config.ts（retry-fence 绝对上限的不等式断言需要它）；原名保留 re-export。 */
export { GAME_ROOM_START_LOCK_TIMEOUT_MS };
/** 私房定时面（waitingDeadline / retry-fence 上限）的评估周期。 */
const PRIVATE_ROOM_TIMER_INTERVAL_MS = 1_000;
/**
 * 入座失败的可区分内部原因码。⛔ 只进日志，不上线（对客户端一律 BadRequest）：
 * `factory` = 本仓 `createModePlayer` 守卫拒绝 mode 交回的 player；
 * `register` = `@colyseus/schema` 在 `MapSchema.set` 里 assertInstanceType 兜底拒绝。
 * 两者合并后不可区分，等于让 factory 守卫失去可失败的证据。
 */
export const MODE_PLAYER_FACTORY_REASON = "mode-player-factory";
export const MODE_PLAYER_REGISTER_REASON = "mode-player-register";

/** 可替换的单调时间源。默认使用 Colyseus room clock。 */
export type GameRoomClock = (() => number) | { now?: () => number; currentTime?: number };

export interface GameRoomRuntimeOptions {
    /** 固定的对局种子；未提供时每个房间生成一个单调不重复的 seed。 */
    seed?: number;
    /** 可替换的 wall/monotonic clock，仅用于时间戳与开局基准。 */
    clock?: GameRoomClock;
    /** 固定逻辑步长，默认 shared TICK_MS。 */
    fixedStepMs?: number;
    /** 可选的 match id 工厂；测试可注入确定值，生产默认使用 newMatchId()。 */
    matchId?: () => string;
    /** 开局 lock 的最大等待时间；测试可缩短，生产使用有界默认值。 */
    startLockTimeoutMs?: number;
    /** Optional ruleset; transport/admission remains owned by GameRoom. */
    mode?: GameMode<any, any>;
    /** Test/embedded override for durable match evidence emission. */
    evidenceEmitter?: (evidence: MatchEvidenceV3) => Promise<EmitEvidenceResult>;
    /** 注入的房间组合 profile（测试/回放）；生产由 onCreate 按 join options 解析。 */
    profile?: RoomProfile;
    /** 私房服务注入面（单测内存假件；生产缺省 Redis 实现）。 */
    privateRoom?: PrivateRoomRuntimeServices;
}

/** 私房运行时依赖（invite lease / access ticket / retry-fence 上限），仅注入边界。 */
export interface PrivateRoomRuntimeServices {
    readonly inviteCodes?: InviteCodeService;
    readonly accessTickets?: AccessTicketService;
    /** 测试缩短 retry-fence 绝对上限；生产缺省 GAME_ROOM_START_RETRY_FENCE_MAX_MS。 */
    readonly retryFenceMaxMs?: number;
}

type RuntimeGameMode = GameMode<any, any>;
type RuntimeModePlayer = { id: string; name: string };

let seedSequence = 0;

function nextRoomSeed(): number {
    // Date.now() 单独使用会在同毫秒创建的房间间碰撞；序列号只用于避免碰撞，
    // 不改变注入 seed 的确定性。
    seedSequence = (seedSequence + 1) >>> 0;
    return ((Date.now() >>> 0) ^ seedSequence) >>> 0;
}

function normalizeSeed(seed: number | undefined): number {
    return typeof seed === "number" && Number.isFinite(seed) && Number.isInteger(seed)
        ? seed >>> 0
        : nextRoomSeed();
}

function normalizeFixedStep(step: number | undefined): number {
    return typeof step === "number"
        && Number.isSafeInteger(step)
        && step >= 1
        && step <= 1000
        && Math.round(1000 / step) <= MAX_WELCOME_TICK_RATE
        ? step
        : TICK_MS;
}

function normalizeStartLockTimeout(timeoutMs: number | undefined): number {
    return typeof timeoutMs === "number"
        && Number.isSafeInteger(timeoutMs)
        && timeoutMs >= 0
        && timeoutMs <= 60_000
        ? timeoutMs
        : GAME_ROOM_START_LOCK_TIMEOUT_MS;
}

/** §6.3 fence 元组（同一同步段一次性快照的不可变值；每个 await 边界后按整组比较）。 */
interface StartFenceSnapshot {
    readonly sessions: ReadonlySet<string>;
    readonly hasOwnerReady: boolean;
    readonly ownerId: string;
    readonly rosterRevision: number;
    readonly readyRevision: number;
    readonly connectionRevision: number;
}

class GameRoomStartLockTimeoutError extends Error {
    constructor() {
        super("GameRoom start lock timed out");
        this.name = "GameRoomStartLockTimeoutError";
    }
}

/**
 * 通用玩法房间壳：拥有 transport、strict auth、准入、开局事务、fixed-step 时钟与
 * settle/证据发射通道；具体玩法规则（模拟、输入、evidence 录入）全部由选定的
 * GameMode 提供（见 `modes/`；ballMove 的实现在 `modes/ballMove/**`）。
 */
export class GameRoom extends Room {
    /**
     * onCreate 选定 mode 之前的兜底容量。真正生效的是 onCreate 里按 `mode.roster.max`
     * 的赋值——`maxClients` 在 `Room.__init()` 之后是 accessor，写入会同步更新 `_listing`，
     * 而 MatchMaker 读 listing 发生在 `onCreate` 之后，所以撮合侧看到的是 per-mode 容量。
     */
    maxClients = MAX_PLAYERS;
    /** Colyseus transport 层的每客户端消息闸；handler 还会做一次本地预算检查。 */
    maxMessagesPerSecond = GAME_ROOM_MAX_MESSAGES_PER_SECOND;
    /**
     * ⚠ 真实 root 由 mode 决定（生成的 mode→root 映射），所以这里**不能**声明成某个
     * 具体 root：曾经写的 `GameRoomState` 让 shell 在类型上拥有 ballMove 的全部字段，
     * 「玩法无关」就只剩口头约定。改成生成的生命周期视图后，任何越界读写都会 typecheck 失败；
     * 玩法专属字段只在 mode 自己的 hook 里按其精确 root 类型读写。
     */
    declare readonly state: RoomStateLifecycle;

    /** 状态快照下发间隔（ms），默认 50ms/20fps */
    patchRate = 50;

    /** 本局种子（进证据链供 verifier 重放，09·K5）。 */
    private readonly configuredSeed: number;
    private matchSeed: number;
    /** 开局前昵称/展示出生点使用独立流，等待期不会消耗正式对局 RNG。 */
    private admissionRng: SeededRandom;
    /** 正式对局确定性随机源，以 matchSeed 初始化。 */
    private rng: SeededRandom;
    /** fixed-step 累加器；wall clock/dt 只决定要跑几步，不直接进入公式。 */
    private readonly fixedStepMs: number;
    private readonly startLockTimeoutMs: number;
    private simulationAccumulatorMs = 0;
    private readonly runtimeClock: () => number;
    private readonly matchIdFactory: () => string;
    private readonly evidenceEmitter: (evidence: MatchEvidenceV3) => Promise<EmitEvidenceResult>;
    /** Mode may be selected by the validated onCreate options for production
     * rooms; tests can still inject an exact mode through the constructor. */
    private mode: RuntimeGameMode | null;
    private readonly injectedMode: RuntimeGameMode | null;
    private modeId: string;
    /** The exact root may be selected once; subsequent lifecycle calls only verify identity. */
    private stateSelected = false;
    /** Colyseus installs its serializer once when the selected root first crosses `.state =`. */
    private stateSerializerConfigured = false;
    private selectedStateModeId: string | null = null;
    private creationConfigured = false;
    /** 仅 roomLifecycle capability 玩法使用；在 onCreate/admission 前生成且永不重钉。 */
    private roomEpochId: string | null = null;
    /** Sessions for which the mode admission hook has acquired ownership. */
    private readonly modeAdmissions = new Set<string>();
    private readonly messageBudget = new Map<string, { windowStart: number; count: number }>();
    private startPromise: Promise<boolean> | null = null;
    private startAbort: { generation: number; reject: (reason: unknown) => void } | null = null;
    /** A timed-out lock may still complete later; block a retry until it is released. */
    private lateLockPending = false;
    private starting = false;
    /** Invalidates asynchronous start continuations after room disposal. */
    private lifecycleGeneration = 0;
    private disposed = false;
    private disposePromise: Promise<void> | null = null;

    /** sessionId → 框架账号 uid（M8a 证据链 userId 来源；onAuth 严格化后必有值） */
    private sessionUserId = new Map<string, string>();
    /** uid → sessionId 的反向活动索引；离开时必须与 sessionUserId 同步删除。 */
    private userSessionId = new Map<string, string>();
    /** 当前对局参与者快照；活动索引清理后仍供结算证据查 uid。 */
    private participantUserId = new Map<string, string>();

    // ── 私房（Non-intrusive §6.2–§6.8）────────────────────────────────────────
    /** 房间组合 profile；null = 未解析（default 语义：auto + matchmaking，行为与历史一致）。 */
    private profile: RoomProfile | null;
    private readonly privateRoomServices: PrivateRoomRuntimeServices;
    private readonly retryFenceMaxMs: number;
    /** creation claim 固定的权威房主 uid（§6.8：⛔ 不从入座顺序/客户端自报推断）。 */
    private expectedOwnerUid: string | null = null;
    /** 房主的 creation ticket 原文（仅进程内存，供落座 seated CAS 与逐字比较；⛔ 不打印）。 */
    private creationTicket: string | null = null;
    /** 准入时序第 2 步的同步占位（sessionId → {uid, ticket}）；容量计算包含 pending。 */
    private readonly pendingAdmissions = new Map<string, { uid: string; ticket: string | null }>();
    /** 当前 invite lease 句柄；leaseToken ⛔ 不进 state/日志/响应。 */
    private inviteLease: InviteLease | null = null;
    /** renew 三态 unknown 的累计时长；超过 leaseTtlMs 按 lost 处理（§6.7 第 5 条）。 */
    private inviteUnknownAccumMs = 0;
    /** 绝对 Waiting deadline（内部权威值；state.waitingDeadlineAt 只是展示镜像）。 */
    private waitingDeadlineAtMs = 0;
    /** lateLockPending 置位时刻；retry fence 绝对上限的观察起点（§6.3）。 */
    private retryFenceArmedAt: number | null = null;
    private retryFenceTripped = false;
    private inviteRenewTimer: { clear(): void } | null = null;
    private privateTimer: { clear(): void } | null = null;
    /** lost 后换新码的在途标记（防重入）。 */
    private inviteReissueInFlight = false;

    constructor(options: GameRoomRuntimeOptions = {}) {
        super();
        this.configuredSeed = normalizeSeed(options.seed);
        this.matchSeed = this.configuredSeed;
        this.admissionRng = SeededRandom.stream(this.configuredSeed, "admission");
        this.rng = SeededRandom.stream(this.configuredSeed, "match");
        this.fixedStepMs = normalizeFixedStep(options.fixedStepMs);
        this.startLockTimeoutMs = normalizeStartLockTimeout(options.startLockTimeoutMs);
        this.runtimeClock = this.makeClock(options.clock);
        this.matchIdFactory = options.matchId ?? newMatchId;
        this.evidenceEmitter = options.evidenceEmitter ?? emitMatchEvidence;
        this.profile = options.profile ?? null;
        this.privateRoomServices = options.privateRoom ?? {};
        this.retryFenceMaxMs = typeof options.privateRoom?.retryFenceMaxMs === "number"
            && Number.isSafeInteger(options.privateRoom.retryFenceMaxMs)
            && options.privateRoom.retryFenceMaxMs > 0
            ? options.privateRoom.retryFenceMaxMs
            : GAME_ROOM_START_RETRY_FENCE_MAX_MS;
        this.injectedMode = options.mode ?? null;
        // Production mode selection belongs to validated onCreate options; the
        // shell no longer has a default gameplay to fall back to.
        this.mode = this.injectedMode;
        this.modeId = this.injectedMode?.id ?? "";
        if (this.injectedMode) {
            // 注入路径不经过 GameModeRegistry.create，必须在这里补同一道 roster 闸，
            // ⛔ 否则 roster 缺失会一路走到「players.size >= undefined 恒 false」的无上限房。
            assertGameModeRoster(this.injectedMode.id, this.injectedMode.roster);
            assertGameModeCommands(this.injectedMode.id, this.injectedMode.commands);
            this.injectedMode.evidence?.assertRosterCompatible(this.injectedMode.id, this.injectedMode.roster);
            // 注入 mode + 注入 profile 同时在场时，drop-in 互斥/前提在构造期即 fail-fast
            //（生产路径的同一断言在 onCreate；两路径共用一份文案）。
            if (this.profile) this.assertDropInModeCompatible(this.injectedMode);
            this.selectModeState(this.injectedMode);
        }
    }

    private makeClock(clock: GameRoomClock | undefined): () => number {
        if (typeof clock === "function") return () => clock();
        if (clock && typeof clock.now === "function") {
            const now = clock.now;
            return () => now.call(clock);
        }
        if (clock && typeof clock.currentTime === "number") return () => clock.currentTime as number;
        return () => this.clock.currentTime;
    }

    private now(): number {
        let value: unknown;
        try {
            value = this.runtimeClock();
        } catch {
            // A test/replay clock is an injected boundary.  A broken clock must
            // not turn a heartbeat or simulation callback into an uncaught throw.
            return 0;
        }
        // S2C timestamps are non-negative safe integers.  Floor fractional
        // monotonic clocks (for example performance.now()) while rejecting
        // values that could overflow Schema/JSON numeric contracts.
        if (typeof value !== "number"
            || !Number.isFinite(value)
            || value < 0
            || value > Number.MAX_SAFE_INTEGER) {
            return 0;
        }
        return Math.floor(value);
    }

    private modeContext<TState = GameRoomState>(): GameModeContext<TState> {
        return {
            state: this.state as unknown as TState,
            roomId: this.roomId,
            sId: this.sId,
            fixedStepMs: this.fixedStepMs,
            matchSeed: this.matchSeed,
            roomEpochId: this.roomEpochId,
            // ⚠ 闭包转发而非快照：initializeMatchState 会重建 this.rng（match 流），
            // mode 捕获旧 context 后仍必须消费当前流，否则出生点抽签序与 replay 漂移。
            random: {
                next: () => this.rng.next(),
                nextInt: (min: number, max: number) => this.rng.nextInt(min, max),
            },
            settle: () => this.settle(),
            sendS2C: (client, token, payload) => this.sendModeS2C(client, token, payload),
            broadcastS2C: (token, payload) => this.broadcastModeS2C(token, payload),
            sendError: (client, code) => this.sendError(client, code),
            findClientBySession: (sessionId) =>
                this.clients.find((candidate) => candidate.sessionId === sessionId),
            userIdOf: (sessionId) => this.participantUserId.get(sessionId) ?? null,
        };
    }

    private selectModeState(mode: RuntimeGameMode): void {
        if (this.stateSelected) {
            if (this.selectedStateModeId !== mode.id) {
                throw new Error(
                    `[GameRoom] root state 已绑定 ${String(this.selectedStateModeId)}，禁止切换到 ${mode.id}`,
                );
            }
            return;
        }
        if (typeof mode.createPlayer !== "function") {
            throw new TypeError(`[GameRoom] mode ${mode.id} contract 不完整`);
        }
        const selected = createRoomStateForMode(mode.id);
        if ((typeof selected !== "object" && typeof selected !== "function") || selected === null) {
            throw new TypeError(`[GameRoom] generated root factory ${mode.id} 必须返回 Schema root`);
        }
        super.setState(selected as GameRoomState);
        // Pure unit/replay callers do not pass through Room.__init(), so their
        // first assignment creates a configurable data property. Give that path
        // the same public `.state =` rejection as a framework-owned room.
        const descriptor = Object.getOwnPropertyDescriptor(this, "state");
        if (descriptor?.configurable && Object.prototype.hasOwnProperty.call(descriptor, "value")) {
            Object.defineProperty(this, "state", {
                configurable: true,
                enumerable: descriptor.enumerable,
                get: () => selected,
                set: () => { throw this.rootReplacementError(); },
            });
        }
        this.selectedStateModeId = mode.id;
        this.stateSelected = true;
    }

    private rootReplacementError(): Error {
        return new Error("[GameRoom] root state 只能由 mode selection 选择一次，禁止外部替换");
    }

    /** Colyseus 0.17's current `.state =` API resets through this virtual call. */
    override setSerializer(serializer: Serializer<any>): void {
        if (this.stateSelected && this.stateSerializerConfigured) throw this.rootReplacementError();
        super.setSerializer(serializer);
        this.stateSerializerConfigured = true;
    }

    /** Root ownership belongs exclusively to the generated mode selection path. */
    override setState(_newState: GameRoomState): void {
        throw this.rootReplacementError();
    }

    /**
     * 未选定 mode 即 fail-fast：⛔ 不回退任何默认玩法。生产房在 onCreate 选定；
     * 单测/回放房必须通过 `GameRoomRuntimeOptions.mode` 显式注入。
     */
    private requireMode(): RuntimeGameMode {
        if (!this.mode) {
            throw new Error(
                "[GameRoom] room has no game mode：onCreate 未运行且未注入 mode，未登记玩法必须 fail-fast",
            );
        }
        this.selectModeState(this.mode);
        return this.mode;
    }

    private createModePlayer(mode: RuntimeGameMode, sessionId: string, name: string): RuntimeModePlayer {
        const player = mode.createPlayer({
            sessionId,
            name,
            randomInt: (min, max) => this.admissionRng.nextInt(min, max),
        }) as unknown;
        if (!(player instanceof Schema)) {
            throw new TypeError(`[GameRoom] mode ${mode.id} createPlayer 必须返回 Schema player`);
        }
        const candidate = player as Partial<RuntimeModePlayer>;
        if (candidate.id !== sessionId || candidate.name !== name) {
            throw new TypeError(`[GameRoom] mode ${mode.id} createPlayer 破坏公共玩家身份`);
        }
        return candidate as RuntimeModePlayer;
    }

    /** Observe unsupported async hot-path hooks so no rejection escapes detached. */
    private observeModePromise(result: PromiseLike<unknown>, hook: string): void {
        const modeId = this.modeId;
        void trackTask(
            `game:mode-${hook}`,
            Promise.resolve(result).catch((error) => {
                console.error(`[GameRoom ${this.roomId}] mode ${modeId} ${hook} hook failed`, error);
            }),
        );
    }

    /** Selected mode identity, useful to room adapters and deterministic probes. */
    get gameplayModeId(): string {
        return this.modeId;
    }

    // ── 私房 profile / fragment 视图（§6.2/§4.6）──────────────────────────────

    /** 当前 startPolicy；profile 未解析（legacy/default 房）等价 auto。 */
    private startPolicyKind(): "auto" | "owner-ready" | "drop-in" {
        return this.profile?.startPolicy.kind ?? "auto";
    }

    /**
     * drop-in profile 与 mode 事实的注册期断言（fail-fast；构造期注入路径与 onCreate 生产
     * 路径都过——mode 实例在这两处才存在，⛔ 不能挪到 RoomProfile 注册表（那里只有 id））：
     *  - **首人即开局**复用 auto 的 autoStart 阈值路径，故 roster.min === 1 &&
     *    roster.autoStart === 1 是 drop-in 的定义性前提（不满足 = 配置矛盾，拒绝建房）；
     *  - **动态 roster 与 evidence 互斥**：evidence capability 在开局边界 captureInitialState
     *    冻结 initialRoster，Playing 中入座会让证据与真实参与者集合不自洽——动态 roster 的
     *    证据格式属未来独立设计，⛔ 不允许静默组合。
     */
    private assertDropInModeCompatible(mode: RuntimeGameMode): void {
        if (this.startPolicyKind() !== "drop-in") return;
        const profileId = this.profile?.id ?? DEFAULT_ROOM_PROFILE_ID;
        if (mode.roster.min !== 1 || mode.roster.autoStart !== 1) {
            throw new Error(
                `[GameRoom] mode ${mode.id} 的 profile "${profileId}" 声明 drop-in startPolicy，`
                + `但 roster.min=${mode.roster.min}/roster.autoStart=${mode.roster.autoStart}：`
                + "drop-in 的定义是首人即开局，要求 roster.min === 1 && roster.autoStart === 1——"
                + `修正 modes/${mode.id} 的 roster，或改用 auto/owner-ready startPolicy`,
            );
        }
        if (mode.evidence) {
            throw new Error(
                `[GameRoom] mode ${mode.id} 的 profile "${profileId}" 声明 drop-in startPolicy，`
                + "但 mode 声明了 evidence capability：evidence 在开局冻结 initialRoster，与 drop-in 的"
                + "动态 roster（Playing 中可入座）矛盾——动态 roster 的证据属未来独立设计，"
                + "当前必须去掉 evidence 或改用 auto/owner-ready startPolicy",
            );
        }
    }

    private inviteAccessPolicy(): Extract<RoomProfile["accessPolicy"], { kind: "invite-code" }> | null {
        const policy = this.profile?.accessPolicy;
        return policy && policy.kind === "invite-code" ? policy : null;
    }

    private modeHasFragment(fragment: "ownerReady" | "inviteRoom"): boolean {
        const fragments = (ROOM_STATE_FRAGMENTS as Readonly<Partial<Record<string, readonly string[]>>>)[this.modeId];
        return fragments !== undefined && fragments.includes(fragment);
    }

    /**
     * OwnerReady fragment 视图。⚠ 只有 profile 解析为 owner-ready（RoomProfile 启动期断言
     * 已确认 fragment 存在）后才允许收窄；无 fragment 的 root 上读这些字段是 undefined。
     */
    private ownerReadyView(): RoomStateOwnerReady {
        return this.state as unknown as RoomStateOwnerReady;
    }

    private inviteView(): RoomStateInviteRoom {
        return this.state as unknown as RoomStateInviteRoom;
    }

    private inviteCodes(): InviteCodeService {
        return this.privateRoomServices.inviteCodes ?? inviteCodeService;
    }

    private accessTickets(): AccessTicketService {
        return this.privateRoomServices.accessTickets ?? accessTicketService;
    }

    /**
     * 账号绑定（M8a）：WebPlatform 签发的不透明 token 反查 uid 存入 client.auth（09·G1
     * ⛔ 不信客户端单独传的 userId）。token 缺失/伪造/过期一律拒连（去 mock 后无游客模式）。
     */
    static async onAuth(token: string, options: IGameRoomJoinOptions | undefined, _context: AuthContext) {
        // Colyseus forwards untrusted JSON here; validate the complete object before
        // any field-level checks so extra keys cannot silently alter admission semantics.
        const joinOptions = validatedJoinOptions(options);
        // 协议版本硬闸（缺省按 1 兼容首版客户端）：服务端升协议后旧包 join 即拒——
        // 给出可识别错误码，而不是让旧客户端在 Schema 对不上的畸形状态里挂死。
        // §4.8：Game join 只比较 GAME_ROOM_PROTOCOL_VERSION，⛔ LOBBY_PROTOCOL_VERSION 不参与本闸。
        if ((joinOptions.v ?? 1) !== GAME_ROOM_PROTOCOL_VERSION) {
            throw joinRefused(ErrorCode.ProtocolMismatch); // ⚠ 业务码走 message（status 必须 200–599）
        }
        const requestedMode = joinOptions.mode;
        if (!gameModeRegistry.has(requestedMode)) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // per-mode 契约版本（§4.8 第三层）：与 catalog 不一致 = 该玩法的旧客户端，单玩法拒绝。
        // ⛔ 独立于上面的 GAME_ROOM_PROTOCOL_VERSION 信封闸（modeVersion 不参与 core 信封判定）。
        if (joinOptions.modeVersion !== catalogModeVersion(requestedMode)) {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
        // profile 硬闸（§4.4）：matchmaker filterBy 只影响撮合选择，admission 必须再次拒绝
        // 未知或不属该 mode 的 profile（缺失已由 validator 拒）。
        if (!modeDeclaresProfile(requestedMode, joinOptions.profile)) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        const sId = normalizeSId(joinOptions.sId);
        if (sId === null) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        // 进服区归属硬闸（docs/DUAL_MODE.md §4.3 / M11）：sId ∉ 本组 GROUP_ZONES 即拒（防串服）；
        // sId 缺省 / GROUP_ZONES 空（单形态/大混服）放行，向后兼容（客户端软判定只改善 UX）。
        // ⚠ groupAdmitsZone 必须看到原始 undefined：真区服组下缺 sId 仍应拒绝，不能被规范化的 0 绕过。
        if (!groupAdmitsZone(joinOptions.sId === undefined ? undefined : sId)) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        // Colyseus 的标准 auth token 参数是连接凭证的唯一权威来源。
        // `options.token` 只为旧客户端保留兼容占位，若存在必须与标准凭证逐字相等；
        // 不能让 join options 覆盖/替换 HTTP Authorization 解析出的 token。
        // token 是 WebPlatform 的不透明句柄：本进程只做空值/契约长度防护，
        // ⛔ 不解析 uid、随机串长度或任何内部格式。
        const standardToken = typeof token === "string" ? token : "";
        if (standardToken.length < 1 || standardToken.length > 256
            || (joinOptions.token !== undefined && joinOptions.token !== standardToken)) {
            throw joinRefused(ErrorCode.TokenExpired, "auth");
        }
        try {
            // strict：建连点 HTTP 回权威——⛔ 快路径只比对组缓存，被封账号能一直开新战斗房
            // 打无限局（SOP①「新建连接即拒」正是靠这条）。成本 = 每次进房一次远程 verify，
            // 不在 per-message 路径上。⚠ 已在房内的对局不受影响（打完为止，§2.3 已知边界 + U6 发奖 recheck）。
            // ⚠ 带区：token 只对签发它的那个区有效（M12e）
            return {
                userId: await verifyAndCacheWebPlatformSession(standardToken, sId),
                sId,
                mode: requestedMode,
                profile: joinOptions.profile,
            } satisfies GameRoomAuth;
        } catch (e) {
            // 只有 WebPlatform 的 valid:false 才是玩家身份失败；超时、5xx、服务密钥错误等
            // 必须保持 INTERNAL，⛔ 不能谎报成 token 过期。
            throw joinRefusedAuth(toErrCode(e));
        }
    }

    /**
     * Colyseus 0.17 catch-all 消息入口（键是 `"_"`，等价于 `onMessage("*")`）。
     *
     * ⚠ 必须是**实例字段初始化器**产生的每实例对象，⛔ 不得赋模块级共享常量：
     * `Room.__init()` 读到 catch-all 键后会 `delete` 掉它，共享常量会让第一间房之后的
     * 所有房间永久没有 catch-all。
     *
     * ⛔ 不得再注册任何具名 handler：Colyseus 的分派是「具名优先、catch-all 兜底」，
     * 任何残留的具名注册都是绕过全部 gate（预算、exact validator、phase、owner）的暗道。
     * 测试、replay adapter 和未来的非 websocket transport 直接调用
     * `messages["_"](client, type, payload)` 走同一入口。
     */
    messages = {
        "_": (client: Client, type: unknown, message: unknown) =>
            this.dispatchGameMessage(client, type, message),
    };

    /**
     * 通用 dispatcher 固定序（docs/Non-intrusive.md §4.5）：
     *  1. disposed 短路；先消耗基础预算（未知/畸形 type 也计费，flood 不因拼错消息名而免费）；
     *  2. type 非 string / 不在 wire catalog / owner 既非 core 也非当前 mode → BadRequest；
     *  3. exact validate（shared validator；二进制帧 fallback 会把 Uint8Array 原样交入，
     *     isPlainRecord 的原型检查负责拒绝）；
     *  4. rateCost > 1 时追加预算消耗（在昂贵后续处理之前）；
     *  5. phase：core 消息用 shell 规则（Ping→W/P/S；Chat→W/P），玩法消息用 token 声明；
     *  6. core 消息交 core handler，玩法消息交当前 mode 的 `commands[type]`；无对应
     *     command → BadRequest。
     */
    private dispatchGameMessage(client: Client, type: unknown, message: unknown): void {
        if (this.disposed) return;
        const mode = this.requireMode();
        if (!this.consumeMessageBudget(client)) return;
        const owner = typeof type === "string"
            ? (GAME_WIRE_OWNERS as Readonly<Partial<Record<string, string>>>)[type]
            : undefined;
        if (owner === undefined || (owner !== "core" && owner !== this.modeId)) {
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        const messageType = type as C2SType;
        let payload: unknown;
        try {
            payload = validateC2SPayload(messageType, message);
        } catch {
            // 含 S2C 消息名与未登记 C2S validator 的兜底（MESSAGE_TYPE 同样落到这里）。
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        for (let extra = this.wireRateCost(messageType) - 1; extra > 0; extra--) {
            if (!this.consumeMessageBudget(client)) return;
        }
        if (!this.wirePhaseAllows(messageType, owner)) {
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        if (owner === "core") {
            this.handleCoreMessage(client, messageType, payload);
            return;
        }
        const handler = (mode.commands as
            | Readonly<Record<string, (context: GameModeCommandContext<unknown>, payload: unknown) => unknown>>
            | undefined)?.[messageType];
        if (typeof handler !== "function") {
            // 玩法输入没有任何 shell 默认实现：owner 声明了消息却没有 command = BadRequest。
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        try {
            const result = handler({ ...this.modeContext(), client }, payload);
            if (isPromiseLike(result)) {
                // commands 是同步热路径：异步 handler 按错误消费并被观察，⛔ 不悬挂。
                this.observeModePromise(result, "command");
                this.sendError(client, ErrorCode.Unknown);
            }
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} command ${messageType} 失败`, error);
            this.sendError(client, ErrorCode.Unknown);
        }
    }

    /** 玩法 C2S 的预算成本（生成的 wire catalog；未登记按 1）。测试可替换观察机制。 */
    private wireRateCost(messageType: string): number {
        return (GAME_WIRE_RATE_COST as Readonly<Partial<Record<string, number>>>)[messageType] ?? 1;
    }

    /**
     * phase 闸：core 消息的 phase 规则由 shell 拥有（⛔ 不进玩法 wire catalog）；
     * 玩法消息用其 wire token 声明的 phases。
     */
    private wirePhaseAllows(messageType: C2SType, owner: string): boolean {
        const phase = this.state.phase;
        if (owner === "core") {
            switch (messageType) {
                case C2S.Ping:
                    // 心跳在结算阶段也必须活着，否则客户端会在看结算界面时被判掉线。
                    return phase === GamePhase.Waiting || phase === GamePhase.Playing || phase === GamePhase.Settle;
                case C2S.Chat:
                    return phase === GamePhase.Waiting || phase === GamePhase.Playing;
                case C2S.RoomReady:
                case C2S.RoomStart:
                    // Ready/Start 只在 Waiting 合法（§6.2）；starting 期间的拒绝在 handler
                    // 里用 RoomControlError.StartInProgress 表达（phase 仍是 Waiting）。
                    return phase === GamePhase.Waiting;
                default:
                    return false;
            }
        }
        const phases = (GAME_WIRE_PHASES as Readonly<Partial<Record<string, readonly string[]>>>)[messageType];
        return phases !== undefined && phases.includes(phase);
    }

    /** core 消息的 shell 实现（原具名 handler 逻辑内联；payload 已过 exact validate）。 */
    private handleCoreMessage(client: Client, messageType: C2SType, payload: unknown): void {
        if (messageType === C2S.Ping) {
            const msg = payload as IPingReq;
            const res: IPongRes = { clientTime: msg.clientTime, serverTime: this.now() };
            this.sendS2C(client, S2C.Pong, res);
            return;
        }
        if (messageType === C2S.Chat) {
            const msg = payload as IChatReq;
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            const text = msg.text.trim();
            const res: IChatRes = {
                fromId: client.sessionId,
                fromName: player.name,
                text,
                time: this.now(),
            };
            this.broadcastS2C(S2C.Chat, res);
            return;
        }
        if (messageType === C2S.RoomReady) {
            this.handleRoomReady(client, payload as IRoomReadyReq);
            return;
        }
        if (messageType === C2S.RoomStart) {
            this.handleRoomStart(client);
            return;
        }
        // core S2C 名已在 validate 一步拒绝；这里是防御性兜底。
        this.sendError(client, ErrorCode.BadRequest);
    }

    /** 房内 core control 错误（§4.7 三域之二）：s2c.room.error，code 独立于 ErrorCode。 */
    private sendRoomError(client: Client | undefined, code: RoomControlErrorType): void {
        const error: IRoomErrorRes = { code };
        this.sendS2C(client, S2C.RoomError, error);
    }

    /**
     * Ready 置位/清除（§6.2/§6.4）：只有 owner-ready profile 响应（auto profile 收到回
     * BadRequest）；只在 Waiting 修改；`starting`（或 retry fence 未收敛）期间一律拒——
     * 成员点下 Ready 即为承诺，房主按下 Start 之后成员无权反悔（§6.3）。
     */
    private handleRoomReady(client: Client, payload: IRoomReadyReq): void {
        if (this.startPolicyKind() !== "owner-ready") {
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        const view = this.ownerReadyView();
        if (this.state.phase !== GamePhase.Waiting) {
            this.sendRoomError(client, RoomControlError.AlreadyStarted);
            return;
        }
        if (this.starting || this.lateLockPending) {
            this.sendRoomError(client, RoomControlError.StartInProgress);
            return;
        }
        const player = view.players.get(client.sessionId);
        if (!player) {
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        if (player.ready === payload.ready) return; // 同值幂等：不推进 revision（前置条件未变）
        player.ready = payload.ready;
        view.readyRevision++;
    }

    /**
     * 房主开局（§6.2/§6.3）：owner/phase/人数下界/allReady/allConnected 全部同步校验后，
     * 走与 auto 相同的可回滚开局事务。失败只回滚 Waiting 并给房主稳定可重试错误
     * （StartFailed），⛔ 绝不移除房主或触发 owner 转移。
     */
    private handleRoomStart(client: Client): void {
        if (this.startPolicyKind() !== "owner-ready") {
            this.sendError(client, ErrorCode.BadRequest);
            return;
        }
        const view = this.ownerReadyView();
        if (this.state.phase !== GamePhase.Waiting) {
            this.sendRoomError(client, RoomControlError.AlreadyStarted);
            return;
        }
        if (this.starting || this.startPromise !== null || this.lateLockPending) {
            this.sendRoomError(client, RoomControlError.StartInProgress);
            return;
        }
        if (view.ownerId !== client.sessionId) {
            this.sendRoomError(client, RoomControlError.NotOwner);
            return;
        }
        const mode = this.requireMode();
        if (view.players.size < mode.roster.min) {
            this.sendRoomError(client, RoomControlError.BelowMin);
            return;
        }
        // 当前 roster 必须全部在线（drop 宽限内的成员阻止 Start，直至 reconnect 或最终 leave）。
        for (const player of view.players.values()) {
            if (!player.connected) {
                this.sendRoomError(client, RoomControlError.MemberOffline);
                return;
            }
        }
        // 精确 roster 全员 Ready（房主也必须 Ready）。
        for (const player of view.players.values()) {
            if (!player.ready) {
                this.sendRoomError(client, RoomControlError.NotAllReady);
                return;
            }
        }
        void trackTask("game:owner-start", this.runOwnerStart(client));
    }

    private async runOwnerStart(client: Client): Promise<boolean> {
        try {
            const started = await this.startMatch();
            if (started) return true;
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] owner Start 失败，已回滚 Waiting`, error);
        }
        // rollback（保留 Ready、不动 roster/owner）已在 performStartMatch 内完成；
        // 这里只负责把稳定可重试错误交还房主。
        if (!this.disposed) this.sendRoomError(client, RoomControlError.StartFailed);
        return false;
    }

    private consumeMessageBudget(client: Client): boolean {
        const now = this.now();
        const previous = this.messageBudget.get(client.sessionId);
        const windowStart = previous && now >= previous.windowStart && now - previous.windowStart < 1000
            ? previous.windowStart
            : now;
        const count = previous && windowStart === previous.windowStart ? previous.count + 1 : 1;
        this.messageBudget.set(client.sessionId, { windowStart, count });
        if (count <= GAME_ROOM_MAX_MESSAGES_PER_SECOND) return true;
        this.sendError(client, ErrorCode.BadRequest);
        return false;
    }

    private sendError(client: Client, code: ErrorCodeType): void {
        const error: IErrorRes = { code, message: ErrorMessage[code] ?? ErrorMessage[ErrorCode.Unknown] };
        this.sendS2C(client, S2C.Error, error);
    }

    /** Validate every server-to-client payload before handing it to Colyseus transport. */
    private sendS2C(client: Client | undefined, type: S2CType, payload: unknown): void {
        if (this.disposed) return;
        const wire = validateS2CPayload(type, payload);
        // Fake clients used by deterministic tests may not implement send; a malformed
        // packet must still be a no-op rather than throw into the room loop.
        try { client?.send?.(type, wire); } catch { /* connection may be closing */ }
    }

    /** Validate before broadcast so no malformed payload enters the room fan-out queue. */
    private broadcastS2C(type: S2CType, payload: unknown): void {
        if (this.disposed) return;
        const wire = validateS2CPayload(type, payload);
        this.broadcast(type, wire);
    }

    /**
     * mode 出站的 token 闸：dir 必须是 s2c，owner ∈ {core, 当前 mode}；payload 过
     * token.validate（与 shared S2C validator 同一实现）。坏 token/越权 token 是 mode
     * 的实现缺陷，直接 throw 交由调用 hook 的既有兜底记录。
     */
    private assertModeS2CToken(token: GameplayS2CToken<unknown>): void {
        if (!token || typeof token !== "object" || token.dir !== "s2c" || typeof token.type !== "string") {
            throw new TypeError(`[GameRoom] mode ${this.modeId} 出站消息必须携带 s2c wire token`);
        }
        const owner = (GAME_WIRE_OWNERS as Readonly<Partial<Record<string, string>>>)[token.type];
        if (owner !== "core" && owner !== this.modeId) {
            throw new TypeError(
                `[GameRoom] mode ${this.modeId} 不得发送 ${token.type}（owner=${String(owner)}）`,
            );
        }
    }

    private sendModeS2C<TPayload>(
        client: Client | undefined,
        token: GameplayS2CToken<TPayload>,
        payload: TPayload,
    ): void {
        if (this.disposed) return;
        this.assertModeS2CToken(token);
        const wire = token.validate(payload);
        try { client?.send?.(token.type, wire); } catch { /* connection may be closing */ }
    }

    private broadcastModeS2C<TPayload>(token: GameplayS2CToken<TPayload>, payload: TPayload): void {
        if (this.disposed) return;
        this.assertModeS2CToken(token);
        const wire = token.validate(payload);
        this.broadcast(token.type, wire);
    }

    /**
     * **房级区上下文**（DUAL_MODE §4.1）：`filterBy(["sId", "mode"])` 隔离常规 joinOrCreate，
     * `onJoin` 再比较认证区/mode 与房间值，兜住不经过撮合筛选的 joinById。
     * 故区是**房级常量**，⛔ 不需要像 LobbyRoom 那样每消息 `zoneCtx.run`。
     *
     * ⚠ 缺省 0 = 大混服/单形态（老客户端不带 sId）。
     * ⚠ **为什么现在就要存它，哪怕本房还没有按区的读写**：收局证据一旦 XADD 进 `stream:match:v3`，
     * 房间就 dispose 了 —— 那时再想知道"这局属于哪个区"**无处可查**。发奖（U6）要按区记账
     * （`deriveOpId(uid, sId, …)` 把 sId 编进幂等键），拿错区 = 钱记到别的区且幂等键错误、重发也修不回。
     */
    private sId = 0;

    onCreate(options: IGameRoomJoinOptions | undefined): void | Promise<void> {
        if (this.disposed) return;
        if (this.creationConfigured) throw joinRefused(ErrorCode.BadRequest);
        const joinOptions = validatedJoinOptions(options);
        if ((joinOptions.v ?? 1) !== GAME_ROOM_PROTOCOL_VERSION) {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
        const sId = normalizeSId(joinOptions.sId);
        if (sId === null) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        if (!this.injectedMode) {
            const requestedMode = joinOptions.mode;
            // Unknown client input is BadRequest; a registered factory
            // throwing is a server defect and must retain its real cause.
            // ⛔ 未登记 mode 一律拒绝——没有任何默认玩法可回退。
            if (!gameModeRegistry.has(requestedMode)) throw joinRefused(ErrorCode.BadRequest);
            this.mode = gameModeRegistry.create<any, any>(requestedMode);
        } else if (joinOptions.mode !== this.injectedMode.id) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        const mode = this.requireMode();
        this.modeId = mode.id;
        // per-mode 契约版本闸（§4.8 第三层，与 onAuth 同口径）：catalog 缺席仅注入式测试
        // mode 放行（生产 registry mode 必在 catalog）。⛔ 不参与 core 信封闸。
        const expectedModeVersion = catalogModeVersion(this.modeId);
        if (expectedModeVersion === null ? !this.injectedMode : joinOptions.modeVersion !== expectedModeVersion) {
            throw joinRefused(ErrorCode.ProtocolMismatch);
        }
        // profile（§4.4/§6.2）：v8 起必填（validator 已拒缺失）。注入 profile 的测试房只验
        // 一致性；生产路径经注册表解析（校验 id ∈ catalog.profiles + policy 需要的 fragment 存在）。
        const requestedProfile = joinOptions.profile;
        if (this.profile) {
            if (requestedProfile !== this.profile.id) throw joinRefused(ErrorCode.BadRequest);
        } else if (requestedProfile !== DEFAULT_ROOM_PROFILE_ID || modeDeclaresProfile(this.modeId, requestedProfile)) {
            try {
                this.profile = resolveRoomProfile(this.modeId, requestedProfile);
            } catch (error) {
                console.warn(`[GameRoom ${this.roomId}] profile 解析拒绝 mode=${this.modeId} profile=${requestedProfile}`,
                    error instanceof Error ? error.message : error);
                throw joinRefused(ErrorCode.BadRequest);
            }
        }
        // 注入 mode + 注入 profile 的测试路径也必须满足 fragment 前提（生产由 resolve 断言）。
        if (this.startPolicyKind() === "owner-ready" && !this.modeHasFragment("ownerReady")) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        if (this.inviteAccessPolicy() && !this.modeHasFragment("inviteRoom")) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // drop-in 的 roster 前提（min===1 && autoStart===1）与 evidence 互斥：配置矛盾
        // fail-fast 拒绝建房（带归属文案的 Error，⛔ 不折叠成无差别 BadRequest——这是
        // 服务端配置缺陷，不是客户端输入错误）。
        this.assertDropInModeCompatible(mode);
        // ⚠ 必须在 onCreate 里赋，不能提前到构造期：__init() 之后 maxClients 才是会同步
        // 更新 listing 的 accessor，而生产房的 mode 直到这里才选定。
        this.maxClients = mode.roster.max;
        this.sId = sId;
        if (mode.roomLifecycle?.stableRoomEpoch) {
            const roomEpochId = this.matchIdFactory();
            this.roomEpochId = roomEpochId;
            this.state.matchId = roomEpochId;
            mode.roomLifecycle.onRoomInitialize({
                ...this.modeContext(),
                roomEpochId,
            });
        }
        this.creationConfigured = true;
        this.setSimulationInterval((dt) => this.update(dt), this.fixedStepMs);
        this.schedulePrivateRoomTimer();
        console.log(`[GameRoom ${this.roomId}] 创建 sId=${this.sId}`);
        const invitePolicy = this.inviteAccessPolicy();
        if (invitePolicy) {
            // 异步创建事务（claim + lease）返回给 Colyseus await；默认 profile 房保持全同步
            // （既有单测同步 throw 语义不变）。
            return this.configurePrivateRoomCreation(joinOptions, invitePolicy);
        }
    }

    /**
     * invite-code 房的创建事务（§6.8）：原子占有 creation claim（固定 expectedOwnerUid）
     * → **onCreate 体内、listing 首次持久化之前** `setPrivate(true)` → 分配邀请码 lease。
     * 任一步失败 fail-closed（Redis 故障不创建「没有可解析邀请码的半成功私房」，§6.7 第 8 条）。
     */
    private async configurePrivateRoomCreation(
        joinOptions: IGameRoomJoinOptions,
        policy: Extract<RoomProfile["accessPolicy"], { kind: "invite-code" }>,
    ): Promise<void> {
        const access = joinOptions.access;
        if (!access || access.kind !== "create") {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // MatchMaker 在 await onCreate() 之后才统一 driver.persist(listing)，因此这里的
        // setPrivate(true) 使房间**从不曾**以 public 身份出现在 listing 里（§6.8）。
        // ⛔ 禁止把 persist=false 的变体复制到 onCreate 之外（那只改本进程内存 listing）。
        try {
            await this.setPrivate(true);
        } catch {
            // 纯单测路径可能没有 listing；生产失败由下方 claim/allocate 的 fail-closed 兜底。
        }
        const claim = await this.accessTickets().claimCreation({
            sId: this.sId,
            ticket: access.ticket,
            roomId: this.roomId,
            mode: this.modeId,
            profile: this.profile?.id ?? DEFAULT_ROOM_PROFILE_ID,
        });
        if (claim.kind !== "ok") {
            throw joinRefused(ErrorCode.BadRequest);
        }
        if (this.disposed) throw joinRefused(ErrorCode.BadRequest);
        this.expectedOwnerUid = claim.uid;
        this.creationTicket = access.ticket;
        const catalogVersion = catalogModeVersion(this.modeId) ?? 0;
        // Redis 故障 / 码池耗尽在此向上抛 → Colyseus 放弃创建（fail-closed）。
        const lease = await this.inviteCodes().allocate({
            sId: this.sId,
            roomId: this.roomId,
            mode: this.modeId,
            modeVersion: catalogVersion,
            profile: this.profile?.id ?? DEFAULT_ROOM_PROFILE_ID,
            leaseTtlMs: policy.leaseTtlMs,
        });
        if (this.disposed) {
            // 建房中途被销毁：立即隔离刚拿到的码，不留孤儿 lease。
            void trackTask("game:invite-release", Promise.resolve(this.inviteCodes().releaseToTombstone({
                sId: this.sId,
                code: lease.code,
                roomId: this.roomId,
                leaseToken: lease.leaseToken,
                cooldownMs: policy.codeCooldownMs,
            })).then(() => undefined));
            throw joinRefused(ErrorCode.BadRequest);
        }
        this.inviteLease = lease;
        this.inviteUnknownAccumMs = 0;
        this.waitingDeadlineAtMs = this.now() + policy.waitingDeadlineMs;
        const view = this.inviteView();
        view.roomCode = lease.code;
        view.waitingDeadlineAt = this.waitingDeadlineAtMs;
        this.scheduleInviteRenewTimer(policy.renewIntervalMs);
    }

    /** clock 定时器（生产）；纯单测房没有 __init 过的 clock，评估方法可直接调用。 */
    private schedulePrivateRoomTimer(): void {
        if (this.privateTimer) return;
        try {
            const timer = this.clock.setInterval(() => this.evaluatePrivateRoomTimers(), PRIVATE_ROOM_TIMER_INTERVAL_MS);
            this.privateTimer = { clear: () => timer.clear() };
        } catch { /* deterministic 单测房无 clock */ }
    }

    private scheduleInviteRenewTimer(renewIntervalMs: number): void {
        if (this.inviteRenewTimer) return;
        try {
            const timer = this.clock.setInterval(() => {
                void trackTask("game:invite-renew", this.performInviteRenew());
            }, renewIntervalMs);
            this.inviteRenewTimer = { clear: () => timer.clear() };
        } catch { /* deterministic 单测房无 clock */ }
    }

    /**
     * renew 三态（§6.7 第 5 条）：renewed 清零 unknown 累计；lost 立即失效旧码；unknown
     * 累计一旦超过 leaseTtlMs 按 lost 处理（无法证明仍持码）。public 供 deterministic 测试直调。
     */
    async performInviteRenew(): Promise<void> {
        const policy = this.inviteAccessPolicy();
        const lease = this.inviteLease;
        if (!policy || !lease || this.disposed) return;
        const result = await this.inviteCodes().renew({
            sId: this.sId,
            code: lease.code,
            roomId: this.roomId,
            leaseToken: lease.leaseToken,
            leaseTtlMs: policy.leaseTtlMs,
        });
        if (this.disposed || this.inviteLease !== lease) return;
        if (result === "renewed") {
            this.inviteUnknownAccumMs = 0;
            return;
        }
        if (result === "unknown") {
            this.inviteUnknownAccumMs += policy.renewIntervalMs;
            if (this.inviteUnknownAccumMs <= policy.leaseTtlMs) return;
            // 累计 unknown 超过 lease TTL：已无法证明持码，按 lost 收敛（⛔ 不继续展示）。
        }
        this.handleInviteCodeLost();
    }

    /**
     * lost（§6.7 第 5 条）：**同一同步段**内 (a) 清空 state 的 roomCode 并广播稳定的
     * 「邀请码已失效」S2C；(b) 之后按新分配申请**一个新码**（⛔ 不抢回旧码——那会踩到新
     * 持有者的租约），失败按不可恢复处理并 dispose。
     */
    private handleInviteCodeLost(): void {
        const policy = this.inviteAccessPolicy();
        if (!policy || this.disposed) return;
        this.inviteLease = null;
        this.inviteUnknownAccumMs = 0;
        this.inviteView().roomCode = "";
        this.broadcastS2C(S2C.RoomCodeInvalidated, {});
        if (this.state.phase !== GamePhase.Waiting) return; // Playing/Settle 的码本就 inactive
        if (this.inviteReissueInFlight) return;
        this.inviteReissueInFlight = true;
        void trackTask("game:invite-reissue", (async () => {
            try {
                const catalogVersion = catalogModeVersion(this.modeId) ?? 0;
                const lease = await this.inviteCodes().allocate({
                    sId: this.sId,
                    roomId: this.roomId,
                    mode: this.modeId,
                    modeVersion: catalogVersion,
                    profile: this.profile?.id ?? DEFAULT_ROOM_PROFILE_ID,
                    leaseTtlMs: policy.leaseTtlMs,
                });
                if (this.disposed || this.state.phase !== GamePhase.Waiting) {
                    void trackTask("game:invite-release", Promise.resolve(this.inviteCodes().releaseToTombstone({
                        sId: this.sId,
                        code: lease.code,
                        roomId: this.roomId,
                        leaseToken: lease.leaseToken,
                        cooldownMs: policy.codeCooldownMs,
                    })).then(() => undefined));
                    return;
                }
                this.inviteLease = lease;
                this.inviteView().roomCode = lease.code;
            } catch (error) {
                console.error(`[GameRoom ${this.roomId}] 邀请码补发失败，按不可恢复关闭房间`, error);
                try { await this.disconnect(CloseCode.WITH_ERROR); } catch { /* 单测房可能未 __init */ }
            } finally {
                this.inviteReissueInFlight = false;
            }
        })());
    }

    /** Start 成功 / dispose：active lease → tombstone（PX=codeCooldownMs，⛔ 非 DEL）。 */
    private retireInviteCode(reason: string): void {
        const policy = this.inviteAccessPolicy();
        const lease = this.inviteLease;
        if (!policy || !lease) return;
        this.inviteLease = null;
        this.inviteView().roomCode = "";
        void trackTask(`game:invite-retire-${reason}`, Promise.resolve(this.inviteCodes().releaseToTombstone({
            sId: this.sId,
            code: lease.code,
            roomId: this.roomId,
            leaseToken: lease.leaseToken,
            cooldownMs: policy.codeCooldownMs,
        })).then((result) => {
            if (result === "lost") {
                console.warn(`[GameRoom ${this.roomId}] 邀请码隔离时 lease 已易主（reason=${reason}）`);
            }
        }));
    }

    /**
     * 私房定时面（public 供 deterministic 测试直调）：
     *  - retry fence 绝对上限（§6.3）：lateLockPending 超过上限仍未收敛 → fail-closed
     *    （释放 lease、下发不可恢复错误并 dispose）。matchmaking profile 无 deadline，
     *    同样受此上限保护——⛔ 不留「看起来在 Waiting、却永远开不了局」的僵尸房；
     *  - waitingDeadline（§6.7 第 6 条）：**只在 starting===false 且无在途 fence 时求值**，
     *    到达后关闭并 dispose（⛔ 不允许只释放 code 留下永久不可加入的 Waiting 房）。
     */
    evaluatePrivateRoomTimers(nowMs = this.now()): void {
        if (this.disposed) return;
        if (this.lateLockPending && this.retryFenceArmedAt !== null && !this.retryFenceTripped
            && nowMs - this.retryFenceArmedAt >= this.retryFenceMaxMs) {
            this.retryFenceTripped = true;
            console.error(`[GameRoom ${this.roomId}] retry fence 超过绝对上限（${this.retryFenceMaxMs}ms）仍未收敛，fail-closed 关闭房间`);
            this.retireInviteCode("retry-fence");
            this.broadcastS2C(S2C.RoomError, { code: RoomControlError.StartFailed });
            try {
                void trackTask("game:retry-fence-disconnect", Promise.resolve(this.disconnect(CloseCode.WITH_ERROR)));
            } catch { /* 单测房可能未 __init */ }
            return;
        }
        const policy = this.inviteAccessPolicy();
        if (!policy || this.waitingDeadlineAtMs === 0) return;
        if (this.state.phase !== GamePhase.Waiting) return;
        // ⛔ deadline dispose 不与在途 Start 抢跑：fence 置位期间不求值，推迟到收敛后判定。
        if (this.starting || this.lateLockPending) return;
        if (nowMs < this.waitingDeadlineAtMs) return;
        console.log(`[GameRoom ${this.roomId}] waiting deadline 到期，关闭私房`);
        this.retireInviteCode("deadline");
        try {
            void trackTask("game:waiting-deadline-disconnect", Promise.resolve(this.disconnect()));
        } catch { /* 单测房可能未 __init */ }
    }

    private async releaseModeAdmission(client: Client): Promise<void> {
        if (!this.modeAdmissions.delete(client.sessionId)) return;
        const mode = this.mode;
        if (!mode?.onLeave) return;
        try {
            await mode.onLeave({ ...this.modeContext(), client });
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} leave hook failed`, error);
        }
    }

    private runModePlayerLeaving(
        mode: RuntimeGameMode,
        client: Client,
        player: RuntimeModePlayer,
        acceptedTick: number,
        duringMatch: boolean,
        closeCode: number,
        consented: boolean,
    ): void {
        if (!mode.onPlayerLeaving) return;
        try {
            const result = mode.onPlayerLeaving({
                ...this.modeContext(),
                client,
                player,
                acceptedTick,
                duringMatch,
                closeCode,
                consented,
            });
            if (isPromiseLike(result)) this.observeModePromise(result, "player-leaving");
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} player-leaving hook failed`, error);
        }
    }

    private runModeConnectionChanged(
        mode: RuntimeGameMode,
        client: Client,
        player: RuntimeModePlayer,
        connected: boolean,
    ): void {
        if (!mode.onConnectionChanged) return;
        try {
            const result = mode.onConnectionChanged({
                ...this.modeContext(),
                client,
                player,
                connected,
            });
            if (isPromiseLike(result)) this.observeModePromise(result, "connection-changed");
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} connection-changed hook failed`, error);
        }
    }

    /**
     * 入座失败的统一出口：回滚 player 槽位与 mode 入场资源，再按**可区分的内部原因码**告警。
     * 对外仍是同一个 BadRequest（⛔ 不向客户端泄漏内部根因），运维靠 reason 分辨到底是本仓的
     * player factory 守卫拒绝，还是 schema 库在注册时兜底拒绝。
     */
    private async refuseModePlayer(
        client: Client,
        mode: RuntimeGameMode,
        reason: string,
        error: unknown,
    ): Promise<ServerError> {
        this.state.players.delete(client.sessionId);
        await this.releaseModeAdmission(client);
        console.error(
            `[GameRoom ${this.roomId}] mode ${mode.id} player admission failed reason=${reason}`,
            error,
        );
        return joinRefused(ErrorCode.BadRequest);
    }

    /**
     * §6.8 准入时序第 2–4 步（invite-code profile）：
     *   2. 同步占用 pendingSession/pendingUid/pendingSeat（容量含 pending，调用方已检）；
     *   3. **异步** claim access ticket（issued → pending(session) CAS），并校验
     *      roomId / mode / profile / lease generation 绑定；
     *   4. await 返回后**同步重验** fence、phase、roster 与容量。
     * 任一失败释放 pendingSeat 并把 join ticket 在原 exp 内退回 issued。裸 `joinById`
     * 无有效 ticket 不能借「空房」绕过准入（access 缺失即拒）。
     */
    private async claimAccessForJoin(
        client: Client,
        auth: GameRoomAuth,
        options: unknown,
    ): Promise<{ readonly kind: "create" | "join"; readonly ticket: string }> {
        // 静态 envelope/onAuth 只校验身份与 ticket 形状；绑定重验在目标 room instance（§6.8）。
        let access: IGameRoomAccess | undefined;
        try {
            access = validatedJoinOptions(options as IGameRoomJoinOptions | undefined).access;
        } catch {
            throw joinRefused(ErrorCode.BadRequest);
        }
        if (!access) throw joinRefused(ErrorCode.BadRequest);
        const ticket = access.ticket;
        // 第 2 步：同步占位。
        this.pendingAdmissions.set(client.sessionId, { uid: auth.userId, ticket });
        const releaseTicketToIssued = (): void => {
            if (access.kind !== "join") return;
            void trackTask(
                "game:ticket-release",
                this.accessTickets().releaseJoin(this.sId, ticket, client.sessionId),
            );
        };
        const fail = (code: ErrorCodeType, ticketClaimed: boolean): never => {
            this.pendingAdmissions.delete(client.sessionId);
            if (ticketClaimed) releaseTicketToIssued();
            throw joinRefused(code);
        };
        if (access.kind === "create") {
            // 房主：creation claim 已在 onCreate 原子占有并固定 expectedOwnerUid；这里做
            // uid 与 ticket 的逐字一致校验（恒定时间比较），落座后再 CAS 到 seated。
            if (this.expectedOwnerUid === null || auth.userId !== this.expectedOwnerUid
                || this.creationTicket === null || !safeSecretEqual(ticket, this.creationTicket)) {
                fail(ErrorCode.BadRequest, false);
            }
            return { kind: "create", ticket };
        }
        const lease = this.inviteLease;
        if (!lease) fail(ErrorCode.BadRequest, false);
        let claimedUid: string;
        try {
            // 第 3 步：异步 claim + 绑定校验（Lua CAS 原子段内完成）。
            const claim = await this.accessTickets().claimJoin({
                sId: this.sId,
                ticket,
                sessionId: client.sessionId,
                roomId: this.roomId,
                mode: this.modeId,
                profile: this.profile?.id ?? DEFAULT_ROOM_PROFILE_ID,
                code: lease!.code,
                generation: lease!.generation,
            });
            if (claim.kind !== "ok") fail(ErrorCode.BadRequest, false);
            claimedUid = (claim as { readonly kind: "ok"; readonly uid: string }).uid;
        } catch (error) {
            if (error instanceof ServerError) throw error;
            // 协调 Redis 不可达：可重试的准入失败（⛔ 不降级为确定性结论）。
            console.error(`[GameRoom ${this.roomId}] join ticket claim 基础设施失败`, error);
            fail(ErrorCode.Unknown, false);
            throw error; // unreachable；类型收窄
        }
        // ticket 绑定的 uid 必须等于本连接的权威 uid（§6.8 绑定字段之一）。
        if (claimedUid !== auth.userId) fail(ErrorCode.BadRequest, true);
        // 第 4 步：同步重验 fence、phase、roster 与容量（await 期间可能发生任何交错）。
        const mode = this.requireMode();
        if (this.disposed || this.state.phase !== GamePhase.Waiting || this.starting || this.lateLockPending) {
            fail(ErrorCode.GameAlreadyStarted, true);
        }
        if (this.state.players.size + this.pendingAdmissions.size > mode.roster.max) {
            fail(ErrorCode.RoomFull, true);
        }
        if (this.userSessionId.has(auth.userId) || this.state.players.has(client.sessionId)) {
            fail(ErrorCode.AlreadyInRoom, true);
        }
        return { kind: "join", ticket };
    }

    async onJoin(client: Client, options: unknown) {
        const mode = this.requireMode();
        // 准入时序第 1 步（§6.8 固定时序，⛔ 不得重排）：同步校验 start/admission fence 与 phase。
        // auto/owner-ready：对局已开/已结算的房间不收新客（M8a：参与者集合在开局时固定，中途进人
        // 会污染名次与证据的 09·K5 输入完整性）。撮合层已由开局时的 lock() 挡住，此闸兜底 joinById 直连。
        // drop-in：动态 roster 是策略定义——Waiting 与 Playing 都可入座（Playing 的容量前提由下方
        // 既有 roster.max 闸承担，含 pending 与重连宽限占座）；starting 窗口内的 join 允许落座并成为
        // 创始成员（⛔ 不得因窗口内 join 使开局失效，见 assertMatchStartBoundary 的 drop-in 分支）；
        // 只有 Settle/disposed 拒收（对局已收局，无座可入）。drop-in 开局不 lock，lateLockPending
        // 在该策略下不可能置位，不参与判定。
        const refuseJoinByPhase = this.startPolicyKind() === "drop-in"
            ? this.disposed || this.state.phase === GamePhase.Settle
            : this.disposed || this.state.phase !== GamePhase.Waiting || this.starting || this.lateLockPending;
        if (refuseJoinByPhase) {
            throw joinRefused(ErrorCode.GameAlreadyStarted); // ⛔ 曾硬编码 4002（越界 status + 与关闭码混淆）
        }
        const auth = client.auth as GameRoomAuth | undefined;
        // `filterBy(["sId", "mode", "profile"])` 只约束 joinOrCreate；joinById 可指定任意房间，
        // 必须在房内用 onAuth 已验证过的权威区号再闸一次。⛔ 不比较 options.sId（客户端可伪造/省略）。
        if (!auth || typeof auth.userId !== "string" || auth.userId.length < 1 || auth.sId !== this.sId) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        // `filterBy` covers normal matchmaking; this check
        // closes the joinById/direct-connect path with the same mode identity.
        if (typeof auth.mode !== "string" || auth.mode !== this.modeId) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // profile 双查（§4.4 admission 双重拒绝）：filterBy(["…","profile"]) 只约束 joinOrCreate，
        // joinById 可带任意 profile 直连任何房间——auth.profile 已由 onAuth 验 ∈ catalog，
        // 此处必须再与**本房间实际 profile** 相等，⛔ 不读 options（客户端可伪造）。
        if (typeof auth.profile !== "string" || auth.profile !== (this.profile?.id ?? DEFAULT_ROOM_PROFILE_ID)) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        // 第五人由 admission 与 maxClients 双重拒绝（§6.2）；容量计算包含 pending 占位
        // （异步 ticket 检查期间的座位也占容量，失败无泄漏——§6.8 时序第 2 步）。
        if (this.state.players.size + this.pendingAdmissions.size >= mode.roster.max) {
            throw joinRefused(ErrorCode.RoomFull);
        }
        // 同一框架账号禁止占双座（对齐 Arthur VersusRoom）：证据里同一 userId 出现两个名次会污染战绩。
        // 反向索引使该检查与离开清理保持 O(1) 且不会遗漏 stale session；pending uid 同样禁止双开。
        if (this.userSessionId.has(auth.userId) || [...this.sessionUserId.values()].includes(auth.userId)) {
            throw joinRefused(ErrorCode.AlreadyInRoom); // ⛔ 曾硬编码 4003
        }
        for (const pending of this.pendingAdmissions.values()) {
            if (pending.uid === auth.userId) throw joinRefused(ErrorCode.AlreadyInRoom);
        }
        if (this.state.players.has(client.sessionId) || this.sessionUserId.has(client.sessionId)
            || this.pendingAdmissions.has(client.sessionId)) {
            throw joinRefused(ErrorCode.AlreadyInRoom);
        }

        // ── invite-code profile：第 2 步同步占位 → 第 3 步异步 claim → 第 4 步同步重验 ──
        let claimedTicket: { readonly kind: "create" | "join"; readonly ticket: string } | null = null;
        if (this.inviteAccessPolicy()) {
            claimedTicket = await this.claimAccessForJoin(client, auth, options);
        }

        const releaseClaim = (): void => {
            if (!claimedTicket) return;
            this.pendingAdmissions.delete(client.sessionId);
            if (claimedTicket.kind === "join") {
                // 入座前的安全失败：ticket 在原 exp 内退回 issued（§6.8）。
                void trackTask(
                    "game:ticket-release",
                    this.accessTickets().releaseJoin(this.sId, claimedTicket.ticket, client.sessionId),
                );
            }
        };

        // 第 4.5 步：**异步** mode.onBeforeAdmission（唯一允许 await 的 join 钩子）。排在这里的理由：
        // 它要 uid（auth 已完成）、又必须早于同步的 createPlayer（后者要读回灌后的档案），而且
        // ⛔ 不能排在公共的重复/满员/ticket 检查之前——那样会为一个注定被拒的 join 打存储。
        // 契约说明与「⛔ 不得分配房间资源」的理由见 GameMode.onBeforeAdmission。
        if (mode.onBeforeAdmission) {
            try {
                await mode.onBeforeAdmission({ ...this.modeContext(), client });
            } catch (error) {
                console.error(`[GameRoom ${this.roomId}] mode ${mode.id} before-admission hook failed`, error);
                releaseClaim();
                throw joinRefused(ErrorCode.BadRequest);
            }
        }

        // 第 5 步：**同步** mode.onAdmission（⛔ 不允许把它排在 ticket claim 之前——玩法资源
        // 分配不得先于权威准入）。Run the mode hook only after all common, side-effect-free
        // rejection checks. A duplicate/full join must not let a mode reserve resources
        // for a client that will never receive onLeave.
        if (mode.onAdmission) {
            let admitted = true;
            try {
                const result = mode.onAdmission({ ...this.modeContext(), client });
                if (isPromiseLike(result)) {
                    // Admission must remain synchronous so common duplicate/full
                    // checks and mode resource ownership stay atomic.
                    this.observeModePromise(result, "admission");
                    admitted = false;
                } else {
                    admitted = result !== false;
                }
            } catch (error) {
                console.error(`[GameRoom ${this.roomId}] mode ${mode.id} admission hook failed`, error);
                admitted = false;
            }
            if (!admitted) {
                releaseClaim();
                throw joinRefused(ErrorCode.BadRequest);
            }
        }
        this.modeAdmissions.add(client.sessionId);

        // ⛔ factory 与 registration 必须分开兜底：两者对客户端同样是 BadRequest，但只有分开的
        // 内部原因码能把「mode 返回了非 Schema / 身份被篡改的 player」（本仓守卫）与
        // 「@colyseus/schema 在 MapSchema.set 里 assertInstanceType 兜底」区分开——合并成一个
        // catch 时，删掉 createModePlayer 的守卫不会改变任何可观测输出。
        let player!: RuntimeModePlayer;
        try {
            player = this.createModePlayer(mode, client.sessionId, randomNickname(this.admissionRng));
        } catch (error) {
            releaseClaim();
            throw await this.refuseModePlayer(client, mode, MODE_PLAYER_FACTORY_REASON, error);
        }
        try {
            this.state.players.set(client.sessionId, player as PlayerState);
        } catch (error) {
            releaseClaim();
            throw await this.refuseModePlayer(client, mode, MODE_PLAYER_REGISTER_REASON, error);
        }
        this.sessionUserId.set(client.sessionId, auth.userId);
        this.userSessionId.set(auth.userId, client.sessionId);
        this.participantUserId.set(client.sessionId, auth.userId);

        // ── 第 6 步：落座簿记（§6.4 推进点表：join 落座 rosterRevision+1）+ ticket → seated ──
        this.pendingAdmissions.delete(client.sessionId);
        if (this.modeHasFragment("ownerReady")) {
            const view = this.ownerReadyView();
            view.rosterRevision++;
            // 入座默认未 Ready、在线（生成默认已是 false/true；此处显式声明语义）。
            const seated = view.players.get(client.sessionId);
            if (seated) {
                seated.ready = false;
                seated.connected = true;
            }
            // owner 只由 creation claim 固定的 expectedOwnerUid 落座认定（§6.8：⛔ 不用
            // 「第一个入座者」推断房主）。
            if (this.expectedOwnerUid !== null && auth.userId === this.expectedOwnerUid && view.ownerId === "") {
                view.ownerId = client.sessionId;
            }
        }
        if (claimedTicket) {
            const ticket = claimedTicket;
            void trackTask("game:ticket-seat", (async () => {
                try {
                    if (ticket.kind === "create") {
                        await this.accessTickets().seatCreation(this.sId, ticket.ticket, this.roomId);
                    } else {
                        await this.accessTickets().seatJoin(this.sId, ticket.ticket, client.sessionId);
                    }
                } catch (error) {
                    // 落座已是权威事实；seated CAS 失败只记日志（记录随 exp 收敛，重放已被拒）。
                    console.error(`[GameRoom ${this.roomId}] ticket seated CAS 失败`, error);
                }
            })());
        }

        // drop-in 复用同一 autoStart 阈值路径（其注册期断言钉死 autoStart === 1 ⇒ 首人即开局）；
        // starting 窗口内的后续 join 命中同一分支时，startMatch 返回在途的 startPromise——
        // 新成员与创始事务共同等待 Playing 发布（⛔ 不另起第二个开局事务）。失败归属同 auto：
        // 回滚触发者的 roster 槽位并以 join 拒绝回给触发者。
        const startKind = this.startPolicyKind();
        if ((startKind === "auto" || startKind === "drop-in")
            && this.state.phase === GamePhase.Waiting && this.state.players.size >= mode.roster.autoStart) {
            try {
                // startMatch 先 await lock（drop-in 除外——不锁房，见 performStartMatch），
                // 再把 phase 切到 Playing；锁失败时不会公开一个仍可被撮合/直连塞人的 Playing 房。
                const started = await this.startMatch();
                if (!started) throw new Error("match did not start");
            } catch (error) {
                this.removePlayer(client.sessionId, true);
                await this.releaseModeAdmission(client);
                console.error(`[GameRoom] 开局失败，回滚到 Waiting roomId=${this.roomId}`, error);
                throw joinRefused(ErrorCode.Unknown);
            }
        }

        const welcome: IWelcomeRes = {
            sessionId: client.sessionId,
            tickRate: Math.round(1000 / this.fixedStepMs),
            motd: `欢迎来到 ${PROJECT_DISPLAY_NAME} · ${DEMO_BRAND}`,
        };
        // onJoin 里同步 send 是安全的：@colyseus/ws-transport 在客户端 JOIN ack 之前
        //（state !== JOINED）把所有 send 缓冲进 _enqueuedMessages，ack 后先发全量 state
        // 再 flush——Welcome 不可能先于客户端 joinOrCreate 的 resolve 到达，⛔ 不需要
        // 延迟一拍（曾误诊为竞态；int 日志里的 's2c.welcome' 告警实为 settlement 测试
        // 未注册 Welcome 处理器所致，延迟也消不掉）。
        this.sendS2C(client, S2C.Welcome, welcome);
        console.log(`[GameRoom ${this.roomId}] ${player.name}(${client.sessionId}) 加入，当前 ${this.state.players.size} 人`);
    }

    async onLeave(client: Client, code: number) {
        if (this.disposed) return;
        const mode = this.requireMode();
        const consented = code === CloseCode.CONSENTED;
        if (!consented) {
            const disconnectedPlayer = this.state.players.get(client.sessionId) as RuntimeModePlayer | undefined;
            if (disconnectedPlayer) {
                this.runModeConnectionChanged(mode, client, disconnectedPlayer, false);
            }
            // §6.4：可重试 transport close 进入宽限——seat/owner/Ready 保留，但 connected=false
            // 并推进 connectionRevision（在途 Start 据此失效；离线成员存在时不能 Start）。
            // 必须在 allowReconnection await **之前**的同步段完成。
            if (this.modeHasFragment("ownerReady")) {
                const view = this.ownerReadyView();
                const dropped = view.players.get(client.sessionId);
                if (dropped && dropped.connected) {
                    dropped.connected = false;
                    view.connectionRevision++;
                }
            }
            try {
                // 非主动断线（微信切后台必断 socket / 网络抖动）：保留座位等重连，
                // 宽限期内玩家仍在 state 里照常被模拟、不阻塞他人；客户端用 SDK 的
                // reconnect(reconnectionToken) 归位。M8a 簿记必须推迟到重连失败——
                // 在这里先记会把重连成功者也算成阵亡，污染名次与证据。
                // ⚠ 重连使用 Colyseus reconnection token，⛔ 不重复消费 access ticket（§6.8）。
                await this.allowReconnection(client, RECONNECT_GRACE_S);
                if (this.modeHasFragment("ownerReady")) {
                    const view = this.ownerReadyView();
                    const restored = view.players.get(client.sessionId);
                    if (restored && !restored.connected) {
                        restored.connected = true;
                        view.connectionRevision++; // reconnect 再次推进（§6.4 推进点表）
                    }
                }
                const reconnectedPlayer = this.state.players.get(client.sessionId) as RuntimeModePlayer | undefined;
                if (reconnectedPlayer) {
                    this.runModeConnectionChanged(mode, client, reconnectedPlayer, true);
                }
                console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 断线后重连成功`);
                return; // seat/owner/Ready 原样保留，无其余簿记
            } catch {
                // 宽限到期未归 → 按真离开走下方清理
            }
        }
        if (this.disposed) return;
        const player = this.state.players.get(client.sessionId);
        const leftDuringMatch = player !== undefined && this.state.phase === GamePhase.Playing;
        const acceptedTick = this.state.tick;
        if (player) {
            // ⚠ mode 的离场证据簿记住在 onPlayerLeaving 里，且必须消费 context 携带的
            // **捕获时** player 引用（钩子可同步删 players 条目；重取会漏记阵亡 →
            // 整局证据被静默丢弃）。shell 只负责传引用，不再有任何玩法分支。
            this.runModePlayerLeaving(mode, client, player, acceptedTick, leftDuringMatch, code, consented);
        }
        // Waiting 离开没有结算证据需求，参与者快照也必须删除；Playing/Settle
        // 则保留 participantUserId，供退房者的最终名次回读 uid。
        this.removePlayer(client.sessionId, this.state.phase === GamePhase.Waiting);
        // owner 仅在**最终离开**后按确定规则转移（宽限内不转移 seat/owner/Ready，§6.2）。
        this.transferOwnerAfterFinalLeave(client.sessionId);
        // Freeze phase/evidence before awaiting extension cleanup. Otherwise a
        // slow onLeave hook leaves a one-player room in Playing, allowing ticks
        // or inputs after the authoritative leave event.
        this.maybeSettle();
        await this.releaseModeAdmission(client);
        console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 离开（${consented ? "主动" : `code=${code}，宽限已过`}），剩余 ${this.state.players.size} 人`);
    }

    onDispose(): Promise<void> {
        if (this.disposePromise) return this.disposePromise;
        // A lock/start continuation may resume after Colyseus has disposed the
        // room.  Advance the generation before clearing state so its late
        // continuation can only observe a stale token and exit.
        if (this.disposed) return Promise.resolve();
        this.disposed = true;
        this.lifecycleGeneration++;
        this.startAbort?.reject(new Error("room disposed during match start"));
        this.startAbort = null;
        this.lateLockPending = false;
        this.retryFenceArmedAt = null;
        // 私房收尾（§6.4/§6.7 第 7 条）：dispose 也把码转入隔离态（tombstone，⛔ 非 DEL），
        // 并释放房主的配额槽位；定时器全部停表。
        this.inviteRenewTimer?.clear();
        this.inviteRenewTimer = null;
        this.privateTimer?.clear();
        this.privateTimer = null;
        this.retireInviteCode("dispose");
        if (this.expectedOwnerUid !== null && this.inviteAccessPolicy()) {
            const ownerUid = this.expectedOwnerUid;
            void trackTask(
                "game:invite-quota-release",
                this.accessTickets().releaseRoomQuota(this.sId, ownerUid, this.roomId),
            );
        }
        const pendingStart = this.startPromise;
        const mode = this.mode;
        const context = mode ? this.modeContext() : null;
        // Defer extension code by one microtask so the shared promise is stored
        // before a synchronous/re-entrant hook can call onDispose again.
        const disposal = Promise.resolve().then(async () => {
            try {
                // An initialize/start/rollback hook may already own mode state or
                // external resources.  Let that captured transaction settle
                // before publishing the mode's final disposal boundary.
                if (pendingStart) {
                    try { await pendingStart; } catch { /* start failure is observed by its caller */ }
                }
                if (mode && context) await mode.onDispose?.(context);
            } catch (error) {
                console.error(`[GameRoom ${this.roomId}] mode ${mode?.id ?? this.modeId} dispose hook failed`, error);
            } finally {
                this.messageBudget.clear();
                this.sessionUserId.clear();
                this.userSessionId.clear();
                this.participantUserId.clear();
                this.modeAdmissions.clear();
                this.pendingAdmissions.clear();
                console.log(`[GameRoom ${this.roomId}] 销毁`);
            }
        });
        this.disposePromise = disposal;
        return disposal;
    }

    /**
     * 等待撮合锁成功后才开始正式对局。该方法是唯一的 Waiting → Playing 入口，
     * 也可由 deterministic test/replay harness 直接调用。
     */
    async startMatch(): Promise<boolean> {
        if (this.disposed) return false;
        const mode = this.requireMode();
        if (this.state.phase === GamePhase.Playing) return true;
        if (this.state.phase !== GamePhase.Waiting || this.state.players.size < mode.roster.min) return false;
        if (this.startPromise) return this.startPromise;
        // A previous timed-out Room.lock() can still mutate the listing.  Do
        // not start another match until its late completion has been observed
        // and any acquired lock has been released.
        if (this.lateLockPending) return false;

        const generation = this.lifecycleGeneration;
        const promise = this.performStartMatch(generation);
        this.startPromise = promise;
        try {
            return await promise;
        } finally {
            if (this.startPromise === promise) this.startPromise = null;
        }
    }

    private async performStartMatch(generation: number): Promise<boolean> {
        // §6.3 同一同步段：置位 starting（内部 fence + 客户端可见 state 字段——客户端据此
        // 禁用 Ready/Start 按钮）+ 一次性快照**整个 fence 元组**为不可变值。
        this.starting = true;
        if (this.modeHasFragment("ownerReady")) this.ownerReadyView().starting = true;
        let rejectAbort!: (reason: unknown) => void;
        const abort = new Promise<never>((_, reject) => { rejectAbort = reject; });
        this.startAbort = { generation, reject: rejectAbort };
        const wasLocked = this.locked;
        // drop-in 轻量开局事务：⛔ 不 lock 房间——「房间必须始终可撮合」是策略定义（撮合层的
        // 满员排除/减员恢复由 Colyseus 按 maxClients 自动管理，⛔ 不与 start 绑定）。
        // auto/owner-ready 的 lock/unlock/retry-fence 路径原样保留。
        const dropIn = this.startPolicyKind() === "drop-in";
        const fence = this.snapshotStartFence();
        try {
            // lock() 可能需要访问 Redis/driver；在它完成前不公开 Playing。
            if (!this.isGenerationActive(generation)) throw new Error("room disposed before match start");
            if (!dropIn) await this.lockWithDeadline(abort, wasLocked);
            // Every awaited boundary below can interleave with leave/dispose.
            // Revalidate before invoking the next mode hook or publishing Playing.
            this.assertMatchStartBoundary(generation, fence, "locking");
            await this.initializeMatchState();
            this.assertMatchStartBoundary(generation, fence, "initialization");
            // The mode sees a fully reset state but the phase is published only
            // after its start hook succeeds, keeping Waiting -> Playing atomic.
            await this.requireMode().onMatchStart?.(this.modeContext());
            this.assertMatchStartBoundary(generation, fence, "mode start");
            // 声明了证据能力的 mode 在此冻结初始快照；throw = 开局失败，走下方回滚。
            this.requireMode().evidence?.captureInitialState();
            this.state.phase = GamePhase.Playing;
            if (this.modeHasFragment("ownerReady")) this.ownerReadyView().starting = false;
            // Start 成功的瞬间码即进隔离期（§6.7 第 7 条取 tombstone；§6.4 Playing/code inactive）。
            this.retireInviteCode("start");
            this.inviteRenewTimer?.clear();
            this.inviteRenewTimer = null;
            return true;
        } catch (error) {
            if (this.isGenerationActive(generation)) await this.rollbackMatchState();
            // Colyseus 的 lock() 先改内存再持久化；持久化失败时尽量恢复撮合状态。
            // 若 unlock 也失败，关闭房间是唯一不会继续接客的终态。
            // drop-in 从不 lock，跳过整个 unlock 回滚分支——此刻观测到的 locked 只可能来自
            // Colyseus 的满员自动锁（_lockedExplicitly=false），⛔ 不得替撮合层解开。
            if (!dropIn
                && this.isGenerationActive(generation)
                && !(error instanceof GameRoomStartLockTimeoutError)
                && !wasLocked
                && this.locked) {
                try {
                    await this.unlock();
                } catch (unlockError) {
                    console.error(`[GameRoom] lock 回滚失败，关闭房间 roomId=${this.roomId}`, unlockError);
                    // Disposal waits the current start transaction before final
                    // mode cleanup. Waiting for disposal from that same start
                    // promise would create a cycle, so only observe this close.
                    try {
                        void trackTask(
                            "game:start-failure-disconnect",
                            Promise.resolve(this.disconnect(CloseCode.WITH_ERROR)),
                        );
                    } catch { /* 手动单测可能尚未 __init */ }
                }
            }
            throw error;
        } finally {
            if (this.startAbort?.generation === generation) this.startAbort = null;
            this.starting = false;
        }
    }

    private isGenerationActive(generation: number): boolean {
        return !this.disposed && generation === this.lifecycleGeneration;
    }

    /**
     * §6.3 fence 元组：在同一个同步段内一次性快照为不可变值。分工——session 集合负责成员
     * 身份（join / 最终 leave），三个 revision 负责成员身份之外的属性变化（Ready、connected、
     * owner）。无 ownerReady fragment 的房（auto/matchmaking）revision 恒 0、owner 恒空，
     * 元组退化为既有的 session 集合语义。
     */
    private snapshotStartFence(): StartFenceSnapshot {
        const sessions = new Set<string>();
        this.state.players.forEach((_player, sessionId) => sessions.add(sessionId));
        if (!this.modeHasFragment("ownerReady")) {
            return Object.freeze({
                sessions,
                hasOwnerReady: false,
                ownerId: "",
                rosterRevision: 0,
                readyRevision: 0,
                connectionRevision: 0,
            });
        }
        const view = this.ownerReadyView();
        return Object.freeze({
            sessions,
            hasOwnerReady: true,
            ownerId: view.ownerId,
            rosterRevision: view.rosterRevision,
            readyRevision: view.readyRevision,
            connectionRevision: view.connectionRevision,
        });
    }

    /**
     * 每个 await 边界后按**整个元组**比较（§6.3 ⛔ 禁止分次读取或只比其中一项）：任何
     * join / 最终 leave / drop / reconnect / owner change / dispose 都使本次启动失效。
     * （Ready/Unready 在 starting 置位期间已被 core handler 拒绝，readyRevision 在健康路径
     * 不会移动；仍参与元组比较——直接改 state 的测试/缺陷据此转红。）
     */
    private assertMatchStartBoundary(
        generation: number,
        fence: StartFenceSnapshot,
        stage: string,
    ): void {
        if (!this.isGenerationActive(generation)) {
            throw new Error(`room disposed during match ${stage}`);
        }
        // drop-in 轻量边界：只验 generation（含 dispose，上面已判）+ phase，⛔ 不比 roster 快照。
        // owner-ready/auto 的整组元组重验在这里**不适用**：那套 fence 的目的（§6.3）是保证
        // 「开局时公布的参与者集合 = 玩家按下 Ready/触发 join 时看到的集合」——参与者集合是
        // 其证据与名次契约的输入。drop-in 的定义恰好相反：roster 是动态的，starting 窗口内的
        // join 是**合法落座**（成为创始成员，Playing 发布时已在 players map），⛔ 不得使开局
        // 失效；离开也不回退开局（留下的人继续玩，无 evidence 契约可污染——注册期已断言
        // drop-in ⛔ 不与 evidence capability 组合）。
        if (this.startPolicyKind() === "drop-in") {
            if (this.state.phase !== GamePhase.Waiting) {
                throw new Error(`match phase changed during ${stage}`);
            }
            return;
        }
        if (this.state.phase !== GamePhase.Waiting || fence.sessions.size < this.requireMode().roster.min
            || this.state.players.size !== fence.sessions.size) {
            throw new Error(`match participants or phase changed during ${stage}`);
        }
        for (const sessionId of fence.sessions) {
            if (!this.state.players.has(sessionId)) {
                throw new Error(`match participants changed during ${stage}`);
            }
        }
        if (fence.hasOwnerReady) {
            const view = this.ownerReadyView();
            if (view.ownerId !== fence.ownerId
                || view.rosterRevision !== fence.rosterRevision
                || view.readyRevision !== fence.readyRevision
                || view.connectionRevision !== fence.connectionRevision) {
                throw new Error(`start fence tuple changed during ${stage}`);
            }
        }
    }

    /**
     * Bound the external room lock.  Promise.race observes the lock promise's
     * eventual rejection; the late completion handler also releases a lock
     * acquired after a timeout while the generation is still live.
     */
    private async lockWithDeadline(abort: Promise<never>, wasLocked = false): Promise<void> {
        let timer: NodeJS.Timeout | undefined;
        let timedOut = false;
        let aborted = false;
        let lockPromise: Promise<void>;
        try {
            lockPromise = Promise.resolve(this.lock());
        } catch (error) {
            lockPromise = Promise.reject(error);
        }

        // `onDispose()` rejects this abort promise before an in-flight
        // `Room.lock()` necessarily settles.  Colyseus flips its local locked
        // bit before awaiting the driver, so a late successful lock must be
        // released even when the start was cancelled by disposal rather than
        // by the timeout branch below.
        void abort.catch(() => { aborted = true; });

        const releaseLateLock = async () => {
            if (!timedOut && !aborted) return;
            // Disposal invalidates state publication, but a Room.lock() that
            // already flipped the local/listing bit can still settle later.
            // Release that stale lock even after disposal; the best-effort call
            // is harmless when the matchmaker has already removed the room.
            // An already-locked room is owned by the caller that preceded this
            // start attempt.  Never release that lock as part of our late
            // cancellation cleanup.
            if (wasLocked || !this.locked) {
                this.lateLockPending = false;
                this.retryFenceArmedAt = null;
                return;
            }
            // `unlock()` is normally an async Room method.  Keep this callback
            // fail-closed even when a unit-test adapter replaces it with a
            // synchronous function or a throwing stub.
            try {
                const unlockResult = this.unlock();
                await Promise.resolve(unlockResult);
            } catch (error) {
                console.error(`[GameRoom] lock 取消/超时后的迟到 unlock 失败 roomId=${this.roomId}`, error);
                try { await this.disconnect(CloseCode.WITH_ERROR); } catch { /* 手动单测可能尚未 __init */ }
            } finally {
                this.lateLockPending = false;
                this.retryFenceArmedAt = null;
            }
        };
        // Attach handlers before racing so an eventual rejection is always observed.
        void lockPromise.then(releaseLateLock, releaseLateLock).catch((error) => {
            // The callback above is intentionally defensive; retain an
            // observation point if a future adapter still violates that rule.
            console.error(`[GameRoom] lock 超时回调异常 roomId=${this.roomId}`, error);
        });

        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                this.lateLockPending = true;
                // retry fence 绝对上限的观察起点（§6.3）：晚到结果永不到达时由
                // evaluatePrivateRoomTimers 在上限处 fail-closed dispose。
                this.retryFenceArmedAt = this.now();
                reject(new GameRoomStartLockTimeoutError());
            }, this.startLockTimeoutMs);
        });
        try {
            await Promise.race([lockPromise, timeout, abort]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /** 开局一次性复位所有会污染正式模拟的公共字段；玩法字段由 mode.onMatchInitialize 复位。 */
    private async initializeMatchState(): Promise<void> {
        const mode = this.requireMode();
        this.state.tick = 0;
        // 生产房已在 onCreate/admission 前生成；无头 harness 可能直接 startMatch，
        // 因此这里保留一次等价的 lazy capability 边界。
        if (mode.roomLifecycle?.stableRoomEpoch && this.roomEpochId === null) {
            const roomEpochId = this.matchIdFactory();
            this.roomEpochId = roomEpochId;
            this.state.matchId = roomEpochId;
            mode.roomLifecycle.onRoomInitialize({ ...this.modeContext(), roomEpochId });
        }
        this.state.matchId = this.roomEpochId ?? this.matchIdFactory();
        this.simulationAccumulatorMs = 0;
        this.messageBudget.clear();
        // ⚠ 在调用 mode.onMatchInitialize 之前重建 match 流：mode 经 context.random 消费的
        // 必须是本局的新流（出生点抽签序与 replay 一致）。
        this.rng = SeededRandom.stream(this.matchSeed, "match");

        // 只保留本次正式参与者的 uid 快照；活动双向索引由 onJoin/onLeave 维护，
        // 这里再做一次收口可避免测试或恢复流程注入孤儿 session。
        for (const sessionId of this.participantUserId.keys()) {
            if (!this.state.players.has(sessionId)) this.participantUserId.delete(sessionId);
        }

        await mode.onMatchInitialize?.(this.modeContext());
    }

    private async rollbackMatchState(): Promise<void> {
        const mode = this.requireMode();
        this.state.phase = GamePhase.Waiting;
        this.state.matchId = this.roomEpochId ?? "";
        this.state.tick = 0;
        this.simulationAccumulatorMs = 0;
        this.messageBudget.clear();
        // §6.3：rollback 只清除 start fence 与 starting 标记，⛔ 不改变 roster 与 owner；
        // **Ready 保留**（显式规定——否则每次 lock 抖动都要求全房重新 Ready）。
        if (this.modeHasFragment("ownerReady")) this.ownerReadyView().starting = false;
        try {
            await mode.onMatchRollback?.(this.modeContext());
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} rollback hook failed`, error);
        }
    }

    /** 公开一个固定步推进点，供回放/无头测试使用。 */
    stepFixed(): void {
        if (this.disposed) return;
        const mode = this.requireMode();
        if (this.state.phase !== GamePhase.Playing) return;
        if (mode.onBeforeStep) {
            try {
                const result = mode.onBeforeStep({ ...this.modeContext(), dtMs: this.fixedStepMs });
                if (isPromiseLike(result)) this.observeModePromise(result, "before-step");
            } catch (error) {
                console.error(`[GameRoom ${this.roomId}] mode ${mode.id} before-step hook failed`, error);
            }
        }
        // ⚠ onBeforeStep（如 ballMove 的注入输入应用）可能同步 settle；复查后才推进 tick。
        if (this.state.phase !== GamePhase.Playing) return;
        this.state.tick++;
        try {
            const result = mode.onStep?.({ ...this.modeContext(), dtMs: this.fixedStepMs });
            if (isPromiseLike(result)) this.observeModePromise(result, "step");
        } catch (error) {
            // Mode hooks are extension code. A faulty ruleset must not escape
            // into Colyseus' interval callback and kill the room loop.
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} step hook failed`, error);
        }
    }

    /** 逻辑帧：dt 只进入 fixed-step 累加器；Waiting/Settle 完全不推进。 */
    private update(dt: number) {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return;
        if (!Number.isFinite(dt) || dt <= 0) return;
        // Keep a finite, bounded backlog even when a host/adapter reports an
        // enormous elapsed interval.  Without this cap, `Infinity % step`
        // turns the accumulator into NaN and permanently stalls later frames.
        const maxBacklog = this.fixedStepMs * (MAX_CATCH_UP_STEPS + 1);
        const currentBacklog = Number.isFinite(this.simulationAccumulatorMs)
            && this.simulationAccumulatorMs >= 0
            ? this.simulationAccumulatorMs
            : 0;
        this.simulationAccumulatorMs = Math.min(maxBacklog, currentBacklog + Math.min(dt, maxBacklog));
        let steps = 0;
        while (this.simulationAccumulatorMs >= this.fixedStepMs && steps < MAX_CATCH_UP_STEPS) {
            this.simulationAccumulatorMs -= this.fixedStepMs;
            this.stepFixed();
            steps++;
        }
        // 丢弃极端停顿的过量 backlog，避免单个 wall-clock gap 卡死事件循环；
        // 正常固定步与注入 clock 不受此上限影响。
        if (steps === MAX_CATCH_UP_STEPS && this.simulationAccumulatorMs >= this.fixedStepMs) {
            this.simulationAccumulatorMs %= this.fixedStepMs;
        }
    }

    /** 活动 session/uid 双向索引的唯一删除点；玩法自有状态（如运动锚点）由 mode 在 onPlayerLeaving 清理。 */
    private removePlayer(sessionId: string, removeParticipant: boolean): void {
        const wasSeated = this.state.players.delete(sessionId);
        // §6.4 推进点表：最终 leave rosterRevision+1（seat 变化经唯一删除点统一推进）。
        if (wasSeated && this.modeHasFragment("ownerReady")) {
            this.ownerReadyView().rosterRevision++;
        }
        const userId = this.sessionUserId.get(sessionId);
        this.sessionUserId.delete(sessionId);
        if (userId !== undefined && this.userSessionId.get(userId) === sessionId) {
            this.userSessionId.delete(userId);
        }
        if (removeParticipant) this.participantUserId.delete(sessionId);
        this.messageBudget.delete(sessionId);
    }

    /**
     * owner 最终离开后的确定转移规则（§6.2/§6.4）：最早仍在房成员（players map 插入序 =
     * 入座序）；无人时留空（房间随 autoDispose 销毁）。转移后剩余成员即使已全 Ready，
     * 新 owner 仍需再次点击 Start（本方法不触发任何开局）。
     */
    private transferOwnerAfterFinalLeave(leftSessionId: string): void {
        if (!this.modeHasFragment("ownerReady")) return;
        const view = this.ownerReadyView();
        if (view.ownerId !== leftSessionId) return;
        let nextOwner = "";
        for (const sessionId of view.players.keys()) {
            nextOwner = sessionId;
            break;
        }
        view.ownerId = nextOwner;
        // §6.4 推进点表：owner 转移 rosterRevision+1（精确 session 集合不变，身份属性变了）。
        view.rosterRevision++;
    }

    get seedForReplay(): number {
        return this.matchSeed;
    }

    get fixedStep(): number {
        return this.fixedStepMs;
    }

    // ---------------- 结算 + 证据链（服务端框架 M8a） ----------------

    /** 结算谓词完全归 mode（`shouldSettle`）；shell 不再有任何默认结算规则。 */
    private maybeSettle() {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return;
        const mode = this.requireMode();
        if (!mode.shouldSettle) return;
        try {
            const result = mode.shouldSettle(this.modeContext());
            if (isPromiseLike(result)) {
                this.observeModePromise(result, "should-settle");
                return;
            }
            if (result) this.settle();
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} settlement hook failed`, error);
        }
    }

    /** 收局：先冻结 mode 的收局证据，再运行 mode finish hook；XADD 失败不阻塞房间结束。 */
    private settle() {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return;
        this.state.phase = GamePhase.Settle;
        const mode = this.requireMode();
        // ⚠ 顺序不可换：先 build 冻结证据快照，再让 onFinish 改 live state。
        const evidence = mode.evidence?.build() ?? null;
        try {
            const result = mode.onFinish?.(this.modeContext());
            if (isPromiseLike(result)) this.observeModePromise(result, "finish");
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} finish hook failed`, error);
        }
        if (!evidence) return;
        console.log(
            `[GameRoom ${this.roomId}] 收局 matchId=${this.state.matchId}：`
            + evidence.participants.map((participant) => `#${participant.place} ${participant.name}`).join("，"),
        );
        // 两类失败都不阻塞收局，但必须**可区分地**留下痕迹：自检失败是本房间的内部一致性
        // 缺陷（已由 emitMatchEvidence 写进 quarantine、被深度探针告警），传输失败是外部事故。
        void trackTask("game:match-evidence", this.evidenceEmitter(evidence).then((result) => {
            if (result.ok || result.kind !== "self-check") return;
            console.error(
                `[GameRoom ${this.roomId}] ⚠⚠ 收局证据自检失败 matchId=${this.state.matchId} `
                + `reason=${result.reason}——本房间状态与证据不自洽，已入 quarantine 待人工核查`,
            );
        }));
    }
}
