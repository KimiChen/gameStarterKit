import { Room, Client, CloseCode, type AuthContext, type Serializer } from "colyseus";
import type { ServerError } from "@colyseus/core";
import { Schema } from "@colyseus/schema";
import {
    C2S,
    S2C,
    GAME_WIRE_OWNERS,
    GAME_WIRE_PHASES,
    GAME_WIRE_RATE_COST,
    GamePhase,
    ErrorCode,
    ErrorMessage,
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
    type C2SType,
    type S2CType,
    type IPingReq,
    type IChatReq,
    type IWelcomeRes,
    type IPongRes,
    type IChatRes,
    type IErrorRes,
    type ErrorCodeType,
} from "@game/shared";
import {
    createRoomStateForMode,
    GameRoomState,
    PlayerState,
    type RoomStateLifecycle,
} from "./schema/GameRoomState";
import { groupAdmitsZone, normalizeSId } from "../core/infra/config";
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
};

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
/** A stalled room lock must not hold a matchmaking seat forever. */
export const GAME_ROOM_START_LOCK_TIMEOUT_MS = 10_000;
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
        // core S2C 名已在 validate 一步拒绝；这里是防御性兜底。
        this.sendError(client, ErrorCode.BadRequest);
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

    onCreate(options: IGameRoomJoinOptions | undefined) {
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
        // ⚠ 必须在 onCreate 里赋，不能提前到构造期：__init() 之后 maxClients 才是会同步
        // 更新 listing 的 accessor，而生产房的 mode 直到这里才选定。
        this.maxClients = mode.roster.max;
        this.sId = sId;
        this.creationConfigured = true;
        this.setSimulationInterval((dt) => this.update(dt), this.fixedStepMs);
        console.log(`[GameRoom ${this.roomId}] 创建 sId=${this.sId}`);
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
    ): void {
        if (!mode.onPlayerLeaving) return;
        try {
            const result = mode.onPlayerLeaving({
                ...this.modeContext(),
                client,
                player,
                acceptedTick,
                duringMatch,
            });
            if (isPromiseLike(result)) this.observeModePromise(result, "player-leaving");
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${mode.id} player-leaving hook failed`, error);
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

    async onJoin(client: Client, _options: unknown) {
        const mode = this.requireMode();
        // 对局已开/已结算的房间不收新客（M8a：参与者集合在开局时固定，中途进人会污染名次与
        // 证据的 09·K5 输入完整性）。撮合层已由开局时的 lock() 挡住，此闸兜底 joinById 直连。
        if (this.disposed || this.state.phase !== GamePhase.Waiting || this.starting || this.lateLockPending) {
            throw joinRefused(ErrorCode.GameAlreadyStarted); // ⛔ 曾硬编码 4002（越界 status + 与关闭码混淆）
        }
        const auth = client.auth as GameRoomAuth | undefined;
        // `filterBy(["sId", "mode"])` 只约束 joinOrCreate；joinById 可指定任意房间，必须在房内用
        // onAuth 已验证过的权威区号再闸一次。⛔ 不比较 _options.sId（客户端可伪造/省略）。
        if (!auth || typeof auth.userId !== "string" || auth.userId.length < 1 || auth.sId !== this.sId) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        // `filterBy(["sId", "mode"])` covers normal matchmaking; this check
        // closes the joinById/direct-connect path with the same mode identity.
        if (typeof auth.mode !== "string" || auth.mode !== this.modeId) {
            throw joinRefused(ErrorCode.BadRequest);
        }
        if (this.state.players.size >= mode.roster.max) {
            throw joinRefused(ErrorCode.RoomFull);
        }
        // 同一框架账号禁止占双座（对齐 Arthur VersusRoom）：证据里同一 userId 出现两个名次会污染战绩。
        // 反向索引使该检查与离开清理保持 O(1) 且不会遗漏 stale session。
        if (this.userSessionId.has(auth.userId) || [...this.sessionUserId.values()].includes(auth.userId)) {
            throw joinRefused(ErrorCode.AlreadyInRoom); // ⛔ 曾硬编码 4003
        }
        if (this.state.players.has(client.sessionId) || this.sessionUserId.has(client.sessionId)) {
            throw joinRefused(ErrorCode.AlreadyInRoom);
        }
        // Run the mode hook only after all common, side-effect-free rejection
        // checks. A duplicate/full join must not let a mode reserve resources
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
            if (!admitted) throw joinRefused(ErrorCode.BadRequest);
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
            throw await this.refuseModePlayer(client, mode, MODE_PLAYER_FACTORY_REASON, error);
        }
        try {
            this.state.players.set(client.sessionId, player as PlayerState);
        } catch (error) {
            throw await this.refuseModePlayer(client, mode, MODE_PLAYER_REGISTER_REASON, error);
        }
        this.sessionUserId.set(client.sessionId, auth.userId);
        this.userSessionId.set(auth.userId, client.sessionId);
        this.participantUserId.set(client.sessionId, auth.userId);

        if (this.state.phase === GamePhase.Waiting && this.state.players.size >= mode.roster.autoStart) {
            try {
                // startMatch 先 await lock，再把 phase 切到 Playing；锁失败时不会公开一个
                // 仍可被撮合/直连塞人的 Playing 房。
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
            try {
                // 非主动断线（微信切后台必断 socket / 网络抖动）：保留座位等重连，
                // 宽限期内玩家仍在 state 里照常被模拟、不阻塞他人；客户端用 SDK 的
                // reconnect(reconnectionToken) 归位。M8a 簿记必须推迟到重连失败——
                // 在这里先记会把重连成功者也算成阵亡，污染名次与证据。
                await this.allowReconnection(client, RECONNECT_GRACE_S);
                console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 断线后重连成功`);
                return; // 数据原样保留，无任何簿记
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
            this.runModePlayerLeaving(mode, client, player, acceptedTick, leftDuringMatch);
        }
        // Waiting 离开没有结算证据需求，参与者快照也必须删除；Playing/Settle
        // 则保留 participantUserId，供退房者的最终名次回读 uid。
        this.removePlayer(client.sessionId, this.state.phase === GamePhase.Waiting);
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
        this.starting = true;
        let rejectAbort!: (reason: unknown) => void;
        const abort = new Promise<never>((_, reject) => { rejectAbort = reject; });
        this.startAbort = { generation, reject: rejectAbort };
        const wasLocked = this.locked;
        const startingSessions = new Set<string>();
        this.state.players.forEach((_player, sessionId) => startingSessions.add(sessionId));
        try {
            // lock() 可能需要访问 Redis/driver；在它完成前不公开 Playing。
            if (!this.isGenerationActive(generation)) throw new Error("room disposed before match start");
            await this.lockWithDeadline(abort, wasLocked);
            // Every awaited boundary below can interleave with leave/dispose.
            // Revalidate before invoking the next mode hook or publishing Playing.
            this.assertMatchStartBoundary(generation, startingSessions, "locking");
            await this.initializeMatchState();
            this.assertMatchStartBoundary(generation, startingSessions, "initialization");
            // The mode sees a fully reset state but the phase is published only
            // after its start hook succeeds, keeping Waiting -> Playing atomic.
            await this.requireMode().onMatchStart?.(this.modeContext());
            this.assertMatchStartBoundary(generation, startingSessions, "mode start");
            // 声明了证据能力的 mode 在此冻结初始快照；throw = 开局失败，走下方回滚。
            this.requireMode().evidence?.captureInitialState();
            this.state.phase = GamePhase.Playing;
            return true;
        } catch (error) {
            if (this.isGenerationActive(generation)) await this.rollbackMatchState();
            // Colyseus 的 lock() 先改内存再持久化；持久化失败时尽量恢复撮合状态。
            // 若 unlock 也失败，关闭房间是唯一不会继续接客的终态。
            if (this.isGenerationActive(generation)
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

    private assertMatchStartBoundary(
        generation: number,
        startingSessions: ReadonlySet<string>,
        stage: string,
    ): void {
        if (!this.isGenerationActive(generation)) {
            throw new Error(`room disposed during match ${stage}`);
        }
        if (this.state.phase !== GamePhase.Waiting || startingSessions.size < this.requireMode().roster.min
            || this.state.players.size !== startingSessions.size) {
            throw new Error(`match participants or phase changed during ${stage}`);
        }
        for (const sessionId of startingSessions) {
            if (!this.state.players.has(sessionId)) {
                throw new Error(`match participants changed during ${stage}`);
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
        this.state.matchId = this.matchIdFactory();
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
        this.state.matchId = "";
        this.state.tick = 0;
        this.simulationAccumulatorMs = 0;
        this.messageBudget.clear();
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
        this.state.players.delete(sessionId);
        const userId = this.sessionUserId.get(sessionId);
        this.sessionUserId.delete(sessionId);
        if (userId !== undefined && this.userSessionId.get(userId) === sessionId) {
            this.userSessionId.delete(userId);
        }
        if (removeParticipant) this.participantUserId.delete(sessionId);
        this.messageBudget.delete(sessionId);
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
