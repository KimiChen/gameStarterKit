import { Room, Client, CloseCode, type AuthContext } from "colyseus";
import { z } from "zod";
import {
    C2S,
    S2C,
    GamePhase,
    ErrorCode,
    ErrorMessage,
    TICK_MS,
    MAX_PLAYERS,
    MAP_WIDTH,
    MAP_HEIGHT,
    PLAYER_MOVE_SPEED,
    PLAYER_INIT_HP,
    clamp,
    normalize,
    getSkillDef,
    calcDamage,
    SeededRandom,
    PROTOCOL_VERSION,
    PROJECT_DISPLAY_NAME,
    DEMO_BRAND,
    validateRoomJoinOptions,
    validateS2CPayload,
    WireValidationError,
    type IRoomJoinOptions,
    type C2SType,
    type S2CType,
    type IPingReq,
    type IMoveReq,
    type ICastSkillReq,
    type IChatReq,
    type IWelcomeRes,
    type IPongRes,
    type ISkillResultRes,
    type IChatRes,
    type IErrorRes,
    type ErrorCodeType,
} from "@game/shared";
import { GameRoomState, PlayerState } from "./schema/GameRoomState";
import { groupAdmitsZone, normalizeSId } from "../core/infra/config";
import { verifyAndCacheWebPlatformSession } from "../platform/webPlatformClient";
import { joinRefused, joinRefusedAuth, toErrCode } from "../core/errors";
import { emitMatchEvidence, MATCH_MODE_CASUAL, newMatchId } from "../core/match/matchConsumer";
import { trackTask } from "../core/infra/lifecycle";
import {
    BALL_MOVE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
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
};

/** 非主动断线的重连宽限（秒）。微信小游戏切后台必断 socket，实机常态不是异常——
 *  没有宽限就等于「切个后台 = 弃赛」。回流自 Arthur 三房间标配。 */
const RECONNECT_GRACE_S = 10;

/**
 * 房间消息的应用层预算。Colyseus 也会在 transport 层按这个值做一次计数，
 * 这里保留一份房内计数是为了让直接调用 handler（以及未来的非 websocket transport）
 * 也拥有相同的边界。输入频率不是玩法契约，故只在本文件登记。
 */
export const GAME_ROOM_MAX_MESSAGES_PER_SECOND = 60;
const MAX_CHAT_LENGTH = 100;
const MAX_TARGET_ID_LENGTH = 64;
const MAX_CLIENT_TIME = Number.MAX_SAFE_INTEGER;
const MAX_SKILL_ID = 0xffff;
const MAX_CATCH_UP_STEPS = 120;
/** Keep the advertised rate inside shared S2C.Welcome's runtime contract. */
const MAX_WELCOME_TICK_RATE = 240;
/** A stalled room lock must not hold a matchmaking seat forever. */
export const GAME_ROOM_START_LOCK_TIMEOUT_MS = 10_000;
/** Bound replay input work before entering the synchronous simulation loop. */
const MAX_INPUTS_PER_SOURCE = 256;

/** 可替换的单调时间源。默认使用 Colyseus room clock。 */
export type GameRoomClock = (() => number) | { now?: () => number; currentTime?: number };

/**
 * 测试/回放可注入的输入。tick 为空时在当前逻辑帧应用；有值时只在指定帧应用。
 * 网络消息经过同一套 runtime schema 后也会落入 accepted input 序列。
 */
export type GameRoomInput =
    | { type: "move"; sessionId: string; dirX: number; dirY: number; tick?: number }
    | { type: "castSkill"; sessionId: string; skillId: number; targetId?: string; tick?: number };

export type GameRoomInputSource = (tick: number) => readonly GameRoomInput[] | undefined;

export interface GameRoomRuntimeOptions {
    /** 固定的对局种子；未提供时每个房间生成一个单调不重复的 seed。 */
    seed?: number;
    /** 可替换的 wall/monotonic clock，仅用于时间戳与开局基准。 */
    clock?: GameRoomClock;
    /** 固定逻辑步长，默认 shared TICK_MS。 */
    fixedStepMs?: number;
    /** 可选的回放输入源，在每个 fixed step 开始前读取。 */
    input?: GameRoomInputSource;
    /** 可选的 match id 工厂；测试可注入确定值，生产默认使用 newMatchId()。 */
    matchId?: () => string;
    /** 开局 lock 的最大等待时间；测试可缩短，生产使用有界默认值。 */
    startLockTimeoutMs?: number;
    /** Optional ruleset; transport/admission remains owned by GameRoom. */
    mode?: GameMode<GameRoomState>;
}

export type AcceptedGameInput = GameRoomInput & {
    /** 接受该输入时的逻辑帧。 */
    acceptedTick: number;
};

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
        && Number.isFinite(step)
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

/** Zod 的 strict object 是运行时 exact-key 闸；不要改成普通 z.object。 */
const C2S_RUNTIME_SCHEMA = {
    [C2S.Ping]: z.object({
        clientTime: z.number().finite().int().min(0).max(MAX_CLIENT_TIME),
    }).strict(),
    [C2S.Move]: z.object({
        dirX: z.number().finite().min(-1).max(1),
        dirY: z.number().finite().min(-1).max(1),
    }).strict(),
    [C2S.CastSkill]: z.object({
        skillId: z.number().finite().int().min(0).max(MAX_SKILL_ID),
        targetId: z.string().min(1).max(MAX_TARGET_ID_LENGTH).optional(),
    }).strict(),
    [C2S.Chat]: z.object({
        text: z.string().min(1).max(MAX_CHAT_LENGTH)
            .refine((value) => value.trim().length > 0),
    }).strict(),
} as const;

/**
 * Zod's strict object check enumerates with Object.keys(), so a direct handler
 * call could otherwise smuggle a non-enumerable extra field past the wire
 * contract. Keep the own-key allowlist explicit and inspect it with
 * Reflect.ownKeys() before parsing.
 */
const C2S_REQUIRED_KEYS: Record<C2SType, readonly string[]> = {
    [C2S.Ping]: ["clientTime"],
    [C2S.Move]: ["dirX", "dirY"],
    [C2S.CastSkill]: ["skillId"],
    [C2S.Chat]: ["text"],
};

const C2S_OPTIONAL_KEYS: Record<C2SType, readonly string[]> = {
    [C2S.Ping]: [],
    [C2S.Move]: [],
    [C2S.CastSkill]: ["targetId"],
    [C2S.Chat]: [],
};

/** Exported for contract tests; production handlers still call acceptMessage(). */
export const GAME_ROOM_C2S_SCHEMAS = C2S_RUNTIME_SCHEMA;

type RuntimeSchema<T> = {
    safeParse(input: unknown): { success: true; data: T } | { success: false };
};

/**
 * Zod's object schemas intentionally accept class instances and inherited
 * properties.  A Colyseus wire payload is plain JSON, so reject those shapes
 * before parsing; this also keeps symbol keys out of the direct-handler path.
 */
function isPlainMessageRecord(input: unknown): input is Record<string, unknown> {
    try {
        if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
        const proto = Object.getPrototypeOf(input);
        if (proto !== Object.prototype && proto !== null) return false;
        return Reflect.ownKeys(input).every((key) => typeof key === "string");
    } catch {
        return false;
    }
}

function hasExactMessageKeys(input: Record<string, unknown>, messageType: C2SType): boolean {
    try {
        const allowed = new Set([...C2S_REQUIRED_KEYS[messageType], ...C2S_OPTIONAL_KEYS[messageType]]);
        const actual = Reflect.ownKeys(input);
        if (actual.some((key) => typeof key !== "string" || !allowed.has(key))) return false;
        return C2S_REQUIRED_KEYS[messageType].every((key) => Object.prototype.hasOwnProperty.call(input, key));
    } catch {
        return false;
    }
}

const INJECTED_MOVE_KEYS = ["type", "sessionId", "dirX", "dirY"] as const;
const INJECTED_CAST_KEYS = ["type", "sessionId", "skillId"] as const;
const INJECTED_MOVE_OPTIONAL_KEYS = ["tick"] as const;
const INJECTED_CAST_OPTIONAL_KEYS = ["targetId", "tick"] as const;

/**
 * `injectInput()` and replay adapters are test/server boundaries rather than a
 * JSON transport.  Keep their values just as defensive as wire payloads:
 * inspect a hostile object once, then return a fresh plain-data snapshot.
 * Every reflective/property operation is deliberately inside the catch so a
 * revoked Proxy or throwing getter is treated as a dropped input.
 */
function snapshotInjectedInput(input: unknown): GameRoomInput | undefined {
    try {
        if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
        const proto = Object.getPrototypeOf(input);
        if (proto !== Object.prototype && proto !== null) return undefined;

        const names = Object.getOwnPropertyNames(input);
        if (Object.getOwnPropertySymbols(input).length > 0) return undefined;
        const record = input as Record<string, unknown>;
        const type = record.type;
        const required = type === "move" ? INJECTED_MOVE_KEYS : type === "castSkill" ? INJECTED_CAST_KEYS : undefined;
        const optional = type === "move"
            ? INJECTED_MOVE_OPTIONAL_KEYS
            : type === "castSkill"
                ? INJECTED_CAST_OPTIONAL_KEYS
                : undefined;
        if (!required || !optional) return undefined;
        const allowed = new Set<string>([...required, ...optional]);
        if (names.length < required.length || names.some((name) => !allowed.has(name))) return undefined;
        if (required.some((name) => !names.includes(name))) return undefined;
        if (names.length !== required.length
            + names.filter((name) => (optional as readonly string[]).includes(name)).length) {
            return undefined;
        }

        const sessionId = record.sessionId;
        if (typeof sessionId !== "string" || sessionId.length < 1 || sessionId.length > MAX_TARGET_ID_LENGTH) {
            return undefined;
        }
        const rawTick: unknown = names.includes("tick") ? record.tick : undefined;
        let tick: number | undefined;
        if (rawTick !== undefined) {
            if (typeof rawTick !== "number" || !Number.isSafeInteger(rawTick) || rawTick < 0) return undefined;
            tick = rawTick;
        }

        if (type === "move") {
            const schema = C2S_RUNTIME_SCHEMA[C2S.Move];
            const parsed = schema.safeParse({ dirX: record.dirX, dirY: record.dirY });
            if (!parsed.success) return undefined;
            const data = parsed.data as IMoveReq;
            return tick === undefined
                ? { type: "move", sessionId, dirX: data.dirX, dirY: data.dirY }
                : { type: "move", sessionId, dirX: data.dirX, dirY: data.dirY, tick };
        }

        const targetId = names.includes("targetId") ? record.targetId : undefined;
        const schema = C2S_RUNTIME_SCHEMA[C2S.CastSkill];
        const parsed = schema.safeParse({
            skillId: record.skillId,
            ...(targetId === undefined ? {} : { targetId }),
        });
        if (!parsed.success) return undefined;
        const data = parsed.data as ICastSkillReq;
        return tick === undefined
            ? (data.targetId === undefined
                ? { type: "castSkill", sessionId, skillId: data.skillId }
                : { type: "castSkill", sessionId, skillId: data.skillId, targetId: data.targetId })
            : (data.targetId === undefined
                ? { type: "castSkill", sessionId, skillId: data.skillId, tick }
                : { type: "castSkill", sessionId, skillId: data.skillId, targetId: data.targetId, tick });
    } catch {
        return undefined;
    }
}

/**
 * 主玩法房间（玩法逻辑仍为演示/假数据，用于跑通链路）：
 *  - 玩家进出：随机出生点 + demo 昵称（真实项目从档案取）
 *  - 移动：客户端发方向输入，服务端按逻辑帧积分位置
 *  - 技能：使用 shared 战斗公式结算伤害并广播
 *  - 结算（服务端框架 M8a）：存活 ≤1 → Settle + 证据链 XADD stream:match:v2
 *    （消费落库见 core/match/matchConsumer）
 */
export class GameRoom extends Room {
    maxClients = MAX_PLAYERS;
    /** Colyseus transport 层的每客户端消息闸；handler 还会做一次本地预算检查。 */
    maxMessagesPerSecond = GAME_ROOM_MAX_MESSAGES_PER_SECOND;
    state = new GameRoomState();
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
    private simulationTimeMs = 0;
    private readonly runtimeClock: () => number;
    private readonly matchIdFactory: () => string;
    private readonly mode: GameMode<GameRoomState>;
    private inputSource?: GameRoomInputSource;
    private readonly injectedInputs: GameRoomInput[] = [];
    private readonly acceptedInputSequence: AcceptedGameInput[] = [];
    private readonly messageBudget = new Map<string, { windowStart: number; count: number }>();
    private startPromise: Promise<boolean> | null = null;
    private startAbort: { generation: number; reject: (reason: unknown) => void } | null = null;
    /** A timed-out lock may still complete later; block a retry until it is released. */
    private lateLockPending = false;
    private starting = false;
    /** Invalidates asynchronous start continuations after room disposal. */
    private lifecycleGeneration = 0;
    private disposed = false;

    /** sessionId → 框架账号 uid（M8a 证据链 userId 来源；onAuth 严格化后必有值） */
    private sessionUserId = new Map<string, string>();
    /** uid → sessionId 的反向活动索引；离开时必须与 sessionUserId 同步删除。 */
    private userSessionId = new Map<string, string>();
    /** 当前对局参与者快照；活动索引清理后仍供结算证据查 uid。 */
    private participantUserId = new Map<string, string>();
    /** 死亡顺序（sessionId，先死在前）；结算名次 = 存活者优先、其余按死亡逆序 */
    private deathOrder: string[] = [];
    /** 中途退房者的昵称快照（state.players 里已删，结算证据还需要名字） */
    private departedNames = new Map<string, string>();
    /** 开局时刻（clock 毫秒），证据 elapsedMs 用 */
    private matchStartMs = 0;

    constructor(options: GameRoomRuntimeOptions = {}) {
        super();
        this.configuredSeed = normalizeSeed(options.seed);
        this.matchSeed = this.configuredSeed;
        this.admissionRng = SeededRandom.stream(this.configuredSeed, "admission");
        this.rng = SeededRandom.stream(this.configuredSeed, "match");
        this.fixedStepMs = normalizeFixedStep(options.fixedStepMs);
        this.startLockTimeoutMs = normalizeStartLockTimeout(options.startLockTimeoutMs);
        this.runtimeClock = this.makeClock(options.clock);
        this.inputSource = options.input;
        this.matchIdFactory = options.matchId ?? newMatchId;
        this.mode = options.mode ?? gameModeRegistry.create(BALL_MOVE_GAME_MODE_ID);
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

    private modeContext(): GameModeContext<GameRoomState> {
        return {
            state: this.state,
            roomId: this.roomId,
            sId: this.sId,
            fixedStepMs: this.fixedStepMs,
        };
    }

    private modeMessage(type: C2SType, client: Client, payload: unknown): boolean {
        if (!this.mode.onMessage) return false;
        try {
            return this.mode.onMessage({ type, client, payload, context: this.modeContext() }) === true;
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${this.mode.id} 消息钩子失败`, error);
            this.sendError(client, ErrorCode.Unknown);
            return true;
        }
    }

    /**
     * 账号绑定（M8a）：WebPlatform 签发的不透明 token 反查 uid 存入 client.auth（09·G1
     * ⛔ 不信客户端单独传的 userId）。token 缺失/伪造/过期一律拒连（去 mock 后无游客模式）。
     */
    static async onAuth(token: string, options: IRoomJoinOptions | undefined, _context: AuthContext) {
        let joinOptions: IRoomJoinOptions;
        try {
            // Colyseus forwards untrusted JSON here; validate the complete object before
            // any field-level checks so extra keys cannot silently alter admission semantics.
            joinOptions = validateRoomJoinOptions(options);
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
        // 协议版本硬闸（缺省按 1 兼容首版客户端）：服务端升协议后旧包 join 即拒——
        // 给出可识别错误码，而不是让旧客户端在 Schema 对不上的畸形状态里挂死
        if ((joinOptions.v ?? 1) !== PROTOCOL_VERSION) {
            throw joinRefused(ErrorCode.ProtocolMismatch); // ⚠ 业务码走 message（status 必须 200–599）
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
            } satisfies GameRoomAuth;
        } catch (e) {
            // 只有 WebPlatform 的 valid:false 才是玩家身份失败；超时、5xx、服务密钥错误等
            // 必须保持 INTERNAL，⛔ 不能谎报成 token 过期。
            throw joinRefusedAuth(toErrCode(e));
        }
    }

    /**
     * Colyseus 0.17 消息处理表，消息名来自双端共享的 C2S 常量。
     *
     * 这里保留函数形态（而不是只依赖 Room.onMessage 的 validator），因为测试、
     * replay adapter 和未来的非 websocket transport 可能直接调用 handler；每个入口
     * 都必须经过同一个 `acceptMessage()` exact runtime schema 与预算闸。
     */
    messages = {
        [C2S.Ping]: (client: Client, raw: IPingReq) => {
            const msg = this.acceptMessage(client, C2S.Ping, raw, C2S_RUNTIME_SCHEMA[C2S.Ping]);
            if (!msg) return;
            if (this.modeMessage(C2S.Ping, client, msg)) return;
            const res: IPongRes = { clientTime: msg.clientTime, serverTime: this.now() };
            this.sendS2C(client, S2C.Pong, res);
        },

        [C2S.Move]: (client: Client, raw: IMoveReq) => {
            const msg = this.acceptMessage(client, C2S.Move, raw, C2S_RUNTIME_SCHEMA[C2S.Move]);
            if (!msg) return;
            if (this.modeMessage(C2S.Move, client, msg)) return;
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.alive) return;
            const dir = normalize(msg.dirX, msg.dirY);
            this.recordInput({
                type: "move",
                sessionId: client.sessionId,
                dirX: dir.x,
                dirY: dir.y,
            });
            player.dirX = dir.x;
            player.dirY = dir.y;
        },

        [C2S.CastSkill]: (client: Client, raw: ICastSkillReq) => {
            const msg = this.acceptMessage(client, C2S.CastSkill, raw, C2S_RUNTIME_SCHEMA[C2S.CastSkill]);
            if (!msg) return;
            if (this.modeMessage(C2S.CastSkill, client, msg)) return;
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.alive) return;
            const accepted = this.handleCastSkill(client, msg);
            if (!accepted) return;
            this.recordInput({
                type: "castSkill",
                sessionId: client.sessionId,
                skillId: msg.skillId,
                ...(msg.targetId === undefined ? {} : { targetId: msg.targetId }),
            });
        },

        [C2S.Chat]: (client: Client, raw: IChatReq) => {
            const msg = this.acceptMessage(client, C2S.Chat, raw, C2S_RUNTIME_SCHEMA[C2S.Chat]);
            if (!msg) return;
            if (this.modeMessage(C2S.Chat, client, msg)) return;
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
        },
    };

    private phaseAllows(messageType: C2SType): boolean {
        // Ping 是连接级心跳，结算阶段也允许；聊天只在房间仍可互动时开放；
        // Move/CastSkill 是正式模拟输入，绝不在 Waiting/Settle 改状态。
        switch (messageType) {
            case C2S.Ping:
                return this.state.phase === GamePhase.Waiting
                    || this.state.phase === GamePhase.Playing
                    || this.state.phase === GamePhase.Settle;
            case C2S.Chat:
                return this.state.phase === GamePhase.Waiting || this.state.phase === GamePhase.Playing;
            case C2S.Move:
            case C2S.CastSkill:
                return this.state.phase === GamePhase.Playing;
            default:
                return false;
        }
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

    private acceptMessage<T>(
        client: Client,
        messageType: C2SType,
        raw: unknown,
        schema: RuntimeSchema<T>,
    ): T | undefined {
        if (this.disposed) return undefined;
        if (!this.consumeMessageBudget(client)) return undefined;
        if (!isPlainMessageRecord(raw)) {
            this.sendError(client, ErrorCode.BadRequest);
            return undefined;
        }
        if (!hasExactMessageKeys(raw, messageType)) {
            this.sendError(client, ErrorCode.BadRequest);
            return undefined;
        }
        let parsed: { success: true; data: T } | { success: false };
        try {
            parsed = schema.safeParse(raw);
        } catch {
            this.sendError(client, ErrorCode.BadRequest);
            return undefined;
        }
        if (!parsed.success) {
            this.sendError(client, ErrorCode.BadRequest);
            return undefined;
        }
        if (!this.phaseAllows(messageType)) {
            this.sendError(client, ErrorCode.BadRequest);
            return undefined;
        }
        return parsed.data;
    }

    /**
     * **房级区上下文**（DUAL_MODE §4.1）：`filterBy(["sId"])` 隔离常规 joinOrCreate，
     * `onJoin` 再比较认证区与房间区，兜住不经过撮合筛选的 joinById，保证一间房里的所有人同区。
     * 故区是**房级常量**，⛔ 不需要像 LobbyRoom 那样每消息 `zoneCtx.run`。
     *
     * ⚠ 缺省 0 = 大混服/单形态（老客户端不带 sId）。
     * ⚠ **为什么现在就要存它，哪怕本房还没有按区的读写**：收局证据一旦 XADD 进 `stream:match:v2`，
     * 房间就 dispose 了 —— 那时再想知道"这局属于哪个区"**无处可查**。发奖（U6）要按区记账
     * （`deriveOpId(uid, sId, …)` 把 sId 编进幂等键），拿错区 = 钱记到别的区且幂等键错误、重发也修不回。
     */
    private sId = 0;

    onCreate(options: IRoomJoinOptions | undefined) {
        if (this.disposed) return;
        const sId = normalizeSId(options?.sId);
        if (sId === null) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        this.sId = sId;
        this.setSimulationInterval((dt) => this.update(dt), this.fixedStepMs);
        console.log(`[GameRoom ${this.roomId}] 创建 sId=${this.sId}`);
    }

    async onJoin(client: Client, _options: unknown) {
        // 对局已开/已结算的房间不收新客（M8a：参与者集合在开局时固定，中途进人会污染名次与
        // 证据的 09·K5 输入完整性）。撮合层已由开局时的 lock() 挡住，此闸兜底 joinById 直连。
        if (this.disposed || this.state.phase !== GamePhase.Waiting || this.starting || this.lateLockPending) {
            throw joinRefused(ErrorCode.GameAlreadyStarted); // ⛔ 曾硬编码 4002（越界 status + 与关闭码混淆）
        }
        const auth = client.auth as GameRoomAuth | undefined;
        // `filterBy(["sId"])` 只约束 joinOrCreate；joinById 可指定任意房间，必须在房内用
        // onAuth 已验证过的权威区号再闸一次。⛔ 不比较 _options.sId（客户端可伪造/省略）。
        if (!auth || typeof auth.userId !== "string" || auth.userId.length < 1 || auth.sId !== this.sId) {
            throw joinRefused(ErrorCode.WrongServer);
        }
        if (this.mode.onAdmission) {
            let admitted = true;
            try {
                admitted = this.mode.onAdmission({ ...this.modeContext(), client }) !== false;
            } catch (error) {
                console.error(`[GameRoom ${this.roomId}] mode ${this.mode.id} admission hook failed`, error);
                admitted = false;
            }
            if (!admitted) throw joinRefused(ErrorCode.BadRequest);
        }
        if (this.state.players.size >= MAX_PLAYERS) {
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

        const player = new PlayerState();
        player.id = client.sessionId;
        player.name = randomNickname(this.admissionRng);
        player.x = this.admissionRng.nextInt(100, MAP_WIDTH - 100);
        player.y = this.admissionRng.nextInt(100, MAP_HEIGHT - 100);
        this.state.players.set(client.sessionId, player);
        this.sessionUserId.set(client.sessionId, auth.userId);
        this.userSessionId.set(auth.userId, client.sessionId);
        this.participantUserId.set(client.sessionId, auth.userId);

        if (this.state.phase === GamePhase.Waiting && this.state.players.size >= 2) {
            try {
                // startMatch 先 await lock，再把 phase 切到 Playing；锁失败时不会公开一个
                // 仍可被撮合/直连塞人的 Playing 房。
                const started = await this.startMatch();
                if (!started) throw new Error("match did not start");
            } catch (error) {
                this.removePlayer(client.sessionId, true);
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
        if (player && this.state.phase === GamePhase.Playing) {
            // 结算证据还需要退房者的名字——无论死活都先快照（state.players 马上要删）
            this.departedNames.set(client.sessionId, player.name);
            // 活着退房视为阵亡（M8a：名次/证据完整性要求每个参与者都有归宿）；已死者已在 deathOrder
            if (player.alive) this.recordDeath(client.sessionId);
        }
        // Waiting 离开没有结算证据需求，参与者快照也必须删除；Playing/Settle
        // 则保留 participantUserId，供退房者的最终名次回读 uid。
        this.removePlayer(client.sessionId, this.state.phase === GamePhase.Waiting);
        try {
            this.mode.onLeave?.({ ...this.modeContext(), client });
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${this.mode.id} leave hook failed`, error);
        }
        console.log(`[GameRoom ${this.roomId}] ${client.sessionId} 离开（${consented ? "主动" : `code=${code}，宽限已过`}），剩余 ${this.state.players.size} 人`);
        this.maybeSettle();
    }

    onDispose() {
        // A lock/start continuation may resume after Colyseus has disposed the
        // room.  Advance the generation before clearing state so its late
        // continuation can only observe a stale token and exit.
        if (this.disposed) return;
        this.disposed = true;
        this.lifecycleGeneration++;
        this.startAbort?.reject(new Error("room disposed during match start"));
        this.startAbort = null;
        this.lateLockPending = false;
        this.messageBudget.clear();
        this.injectedInputs.length = 0;
        this.acceptedInputSequence.length = 0;
        this.inputSource = undefined;
        this.sessionUserId.clear();
        this.userSessionId.clear();
        this.participantUserId.clear();
        this.deathOrder = [];
        this.departedNames.clear();
        console.log(`[GameRoom ${this.roomId}] 销毁`);
    }

    /**
     * 等待撮合锁成功后才开始正式对局。该方法是唯一的 Waiting → Playing 入口，
     * 也可由 deterministic test/replay harness 直接调用。
     */
    async startMatch(): Promise<boolean> {
        if (this.disposed) return false;
        if (this.state.phase === GamePhase.Playing) return true;
        if (this.state.phase !== GamePhase.Waiting || this.state.players.size < 2) return false;
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
            // The room may have been disposed while the external lock was in
            // flight.  Never publish a stale match after that boundary.
            if (!this.isGenerationActive(generation)) throw new Error("room disposed during match start");
            // 等待外部 lock 时可能有玩家离开；不能把只剩一人的房间切成 Playing。
            let participantsUnchanged = this.state.players.size >= 2;
            if (participantsUnchanged) {
                this.state.players.forEach((_player, sessionId) => {
                    if (!startingSessions.has(sessionId)) participantsUnchanged = false;
                });
                for (const sessionId of startingSessions) {
                    if (!this.state.players.has(sessionId)) participantsUnchanged = false;
                }
            }
            if (!participantsUnchanged) throw new Error("match participants changed while locking");
            this.initializeMatchState();
            // The mode sees a fully reset state but the phase is published only
            // after its start hook succeeds, keeping Waiting -> Playing atomic.
            this.mode.onMatchStart?.(this.modeContext());
            this.state.phase = GamePhase.Playing;
            return true;
        } catch (error) {
            if (this.isGenerationActive(generation)) this.rollbackMatchState();
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
                    try { await this.disconnect(CloseCode.WITH_ERROR); } catch { /* 手动单测可能尚未 __init */ }
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

    /** 开局一次性复位所有会污染正式模拟的字段。 */
    private initializeMatchState(): void {
        this.state.tick = 0;
        this.state.matchId = this.matchIdFactory();
        this.matchStartMs = this.now();
        this.simulationAccumulatorMs = 0;
        this.simulationTimeMs = 0;
        this.deathOrder = [];
        this.departedNames.clear();
        this.messageBudget.clear();
        this.acceptedInputSequence.length = 0;
        this.injectedInputs.length = 0;
        this.rng = SeededRandom.stream(this.matchSeed, "match");

        // 只保留本次正式参与者的 uid 快照；活动双向索引由 onJoin/onLeave 维护，
        // 这里再做一次收口可避免测试或恢复流程注入孤儿 session。
        for (const sessionId of this.participantUserId.keys()) {
            if (!this.state.players.has(sessionId)) this.participantUserId.delete(sessionId);
        }

        // 出生点在正式 RNG 流中重新生成，因而等待期的展示 RNG/历史不会改变本局初始状态。
        this.state.players.forEach((player, sessionId) => {
            player.id = sessionId;
            player.hp = PLAYER_INIT_HP;
            player.maxHp = PLAYER_INIT_HP;
            player.alive = true;
            player.dirX = 0;
            player.dirY = 0;
            player.lastCastAt = {};
            player.level = 1;
            player.x = this.rng.nextInt(100, Math.max(101, MAP_WIDTH - 100));
            player.y = this.rng.nextInt(100, Math.max(101, MAP_HEIGHT - 100));
        });
    }

    private rollbackMatchState(): void {
        this.state.phase = GamePhase.Waiting;
        this.state.matchId = "";
        this.state.tick = 0;
        this.matchStartMs = 0;
        this.simulationAccumulatorMs = 0;
        this.simulationTimeMs = 0;
        this.deathOrder = [];
        this.departedNames.clear();
        this.messageBudget.clear();
        this.acceptedInputSequence.length = 0;
        this.injectedInputs.length = 0;
        this.state.players.forEach((player) => {
            player.hp = PLAYER_INIT_HP;
            player.maxHp = PLAYER_INIT_HP;
            player.alive = true;
            player.dirX = 0;
            player.dirY = 0;
            player.lastCastAt = {};
            player.level = 1;
        });
    }

    /** 公开一个固定步推进点，供回放/无头测试使用。 */
    stepFixed(): void {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return;
        this.applyInjectedInputs(this.state.tick);
        if (this.state.phase !== GamePhase.Playing) return;
        this.state.tick++;
        const seconds = this.fixedStepMs / 1000;
        this.state.players.forEach((player) => {
            if (!player.alive) return;
            if (player.dirX === 0 && player.dirY === 0) return;
            player.x = clamp(player.x + player.dirX * PLAYER_MOVE_SPEED * seconds, 0, MAP_WIDTH);
            player.y = clamp(player.y + player.dirY * PLAYER_MOVE_SPEED * seconds, 0, MAP_HEIGHT);
        });
        this.simulationTimeMs += this.fixedStepMs;
        try {
            this.mode.onStep?.({ ...this.modeContext(), dtMs: this.fixedStepMs });
        } catch (error) {
            // Mode hooks are extension code. A faulty ruleset must not escape
            // into Colyseus' interval callback and kill the room loop.
            console.error(`[GameRoom ${this.roomId}] mode ${this.mode.id} step hook failed`, error);
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

    /** 活动 session/uid 双向索引的唯一删除点。 */
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

    private recordDeath(sessionId: string): void {
        if (!this.deathOrder.includes(sessionId)) this.deathOrder.push(sessionId);
    }

    private recordInput(input: GameRoomInput): void {
        this.acceptedInputSequence.push({
            ...input,
            acceptedTick: this.state.tick,
        });
    }

    /** 注入一条已经过调用方验证的输入；非法输入直接拒绝，不进入 replay 序列。 */
    injectInput(input: GameRoomInput): boolean {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return false;
        const snapshot = snapshotInjectedInput(input);
        if (!snapshot) return false;
        this.injectedInputs.push(snapshot);
        return true;
    }

    setInputSource(source: GameRoomInputSource | undefined): void {
        this.inputSource = this.disposed ? undefined : source;
    }

    /** 只读副本，避免测试/回放调用方改写房内输入历史。 */
    getAcceptedInputs(): readonly AcceptedGameInput[] {
        return this.acceptedInputSequence.map((input) => ({ ...input }));
    }

    /** 回放适配器的只读别名，避免直接暴露内部数组。 */
    get acceptedInputs(): readonly AcceptedGameInput[] {
        return this.getAcceptedInputs();
    }

    get seedForReplay(): number {
        return this.matchSeed;
    }

    get fixedStep(): number {
        return this.fixedStepMs;
    }

    private applyInjectedInputs(tick: number): void {
        if (this.disposed) return;
        // 丢弃已经错过的定时输入，避免坏回放数据无限滞留。
        for (let i = this.injectedInputs.length - 1; i >= 0; i--) {
            try {
                const queuedTick = this.injectedInputs[i].tick;
                if (queuedTick !== undefined && queuedTick < tick) this.injectedInputs.splice(i, 1);
            } catch {
                // The queue is normally made only of snapshots.  If a test or
                // adapter has tampered with it, discard the hostile entry.
                this.injectedInputs.splice(i, 1);
            }
        }
        const queued: GameRoomInput[] = [];
        for (let i = 0; i < this.injectedInputs.length; i++) {
            try {
                const input = this.injectedInputs[i];
                if (input.tick === undefined || input.tick === tick) queued.push(input);
            } catch {
                this.injectedInputs.splice(i, 1);
                i--;
            }
        }
        if (queued.length > 0) {
            for (const input of queued) {
                try { this.applyInjectedInput(input); } catch { /* drop this input */ }
            }
            for (const input of queued) {
                const index = this.injectedInputs.indexOf(input);
                if (index >= 0) this.injectedInputs.splice(index, 1);
            }
        }
        const sourced = this.readInputSource(tick);
        for (const input of sourced) {
            // `readInputSource` has already copied the value, so no hostile
            // getter can run during application.  Keep an item-level catch as
            // a final guard around injected gameplay/adapters.
            try { this.applyInjectedInput(input); } catch { /* drop this input */ }
        }
    }

    private readInputSource(tick: number): GameRoomInput[] {
        if (this.disposed) return [];
        try {
            const candidate = this.inputSource?.(tick);
            if (!Array.isArray(candidate)) return [];
            // Read and validate the complete iterator before applying anything;
            // a broken iterator therefore cannot leave a half-applied frame.
            const length = candidate.length;
            if (!Number.isSafeInteger(length) || length < 0 || length > MAX_INPUTS_PER_SOURCE) return [];
            const iteratorFactory = (candidate as unknown as { [Symbol.iterator]?: unknown })[Symbol.iterator];
            if (typeof iteratorFactory !== "function") return [];
            const iterator = (iteratorFactory as () => Iterator<unknown>).call(candidate);
            const values: unknown[] = [];
            for (;;) {
                const step = iterator.next();
                if (!step || typeof step !== "object") return [];
                if (step.done) break;
                values.push(step.value);
                if (values.length > MAX_INPUTS_PER_SOURCE) return [];
            }

            const valid: GameRoomInput[] = [];
            for (const value of values) {
                const snapshot = snapshotInjectedInput(value);
                if (!snapshot || (snapshot.tick !== undefined && snapshot.tick !== tick)) continue;
                valid.push(snapshot);
            }
            return valid;
        } catch {
            // Replay/input adapters are outside the room boundary. A faulty
            // callback, iterator, or property must not abort the room loop.
            return [];
        }
    }

    private applyInjectedInput(input: GameRoomInput): void {
        if (this.disposed) return;
        const player = this.state.players.get(input.sessionId);
        if (!player || !player.alive || this.state.phase !== GamePhase.Playing) return;
        if (input.type === "move") {
            const dir = normalize(input.dirX, input.dirY);
            this.recordInput({ type: "move", sessionId: input.sessionId, dirX: dir.x, dirY: dir.y, ...(input.tick === undefined ? {} : { tick: input.tick }) });
            player.dirX = dir.x;
            player.dirY = dir.y;
            return;
        }
        const client = this.clients.find((candidate) => candidate.sessionId === input.sessionId);
        const accepted = this.handleCastSkill(client, input, input.sessionId);
        if (!accepted) return;
        this.recordInput({
            type: "castSkill",
            sessionId: input.sessionId,
            skillId: input.skillId,
            ...(input.targetId === undefined ? {} : { targetId: input.targetId }),
            ...(input.tick === undefined ? {} : { tick: input.tick }),
        });
    }

    private handleCastSkill(client: Client | undefined, msg: ICastSkillReq, sessionIdOverride?: string): boolean {
        // 只有 Playing 能改变模拟；入口 handler 已做 phase 闸，注入/replay 也必须兜底。
        if (this.disposed || this.state.phase !== GamePhase.Playing) return false;
        const sessionId = client?.sessionId ?? sessionIdOverride;
        if (!sessionId) return false;
        const caster = this.state.players.get(sessionId);
        if (!caster || !caster.alive) return false;

        const skill = getSkillDef(msg?.skillId ?? -1);
        if (!skill) {
            const err: IErrorRes = { code: ErrorCode.SkillUnavailable, message: ErrorMessage[ErrorCode.SkillUnavailable] };
            this.sendS2C(client, S2C.Error, err);
            return false;
        }

        // 冷却检查（服务端内部字段，不同步）
        const now = this.simulationTimeMs;
        const lastAt = caster.lastCastAt[skill.id];
        if (lastAt !== undefined && now - lastAt < skill.cooldownMs) return false;
        caster.lastCastAt[skill.id] = now;

        // 用双端共享公式结算伤害
        const damage = calcDamage(skill, caster.level, this.rng.next());

        const target = msg.targetId ? this.state.players.get(msg.targetId) : undefined;
        if (target && target.alive) {
            target.hp = clamp(target.hp - damage, 0, target.maxHp);
            if (target.hp <= 0) {
                target.alive = false;
                this.recordDeath(target.id);
            }
        }

        const res: ISkillResultRes = {
            casterId: sessionId,
            skillId: skill.id,
            targetId: msg.targetId,
            damage,
        };
        this.broadcastS2C(S2C.SkillResult, res);
        this.maybeSettle();
        return true;
    }

    // ---------------- 结算 + 证据链（服务端框架 M8a） ----------------

    /** 结算条件：对局中存活 ≤1。 */
    private maybeSettle() {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return;
        let alive = 0;
        this.state.players.forEach((p) => { if (p.alive) alive++; });
        if (alive <= 1) this.settle();
    }

    /**
     * 收局：phase → Settle + 证据链生产（02·P7）。一局一条 XADD `stream:match:v2`，
     * 含全部名次 + verifier 重放所需输入（seed 等，09·K5）。emitMatchEvidence 内部吞错——
     * XADD 失败只告警，⛔ 不阻塞收局。落库消费见 gameplay/matchConsumer（consumer group `settle`）。
     * 纯游客局（无任何绑定账号）无落库效应、审计无对象 → 不产证据
     * （也让纯 mock 联调的房间路径不隐性依赖 Redis）。
     */
    private settle() {
        if (this.disposed || this.state.phase !== GamePhase.Playing) return;
        this.state.phase = GamePhase.Settle;
        try {
            this.mode.onFinish?.(this.modeContext());
        } catch (error) {
            console.error(`[GameRoom ${this.roomId}] mode ${this.mode.id} finish hook failed`, error);
        }
        // 结算耗时取 fixed-step 逻辑时钟，而不是 wall-clock/dt；注入同一 seed、步长和
        // accepted inputs 的回放会得到完全相同的 elapsedMs。
        const elapsedMs = this.now() >= this.matchStartMs
            ? Math.max(0, this.simulationTimeMs)
            : 0;

        // 名次：存活者在前，其余按死亡逆序（后死名次高）
        const order: { sessionId: string; name: string; survived: boolean }[] = [];
        this.state.players.forEach((p, sid) => {
            if (p.alive) order.push({ sessionId: sid, name: p.name, survived: true });
        });
        for (let i = this.deathOrder.length - 1; i >= 0; i--) {
            const sid = this.deathOrder[i];
            const name = this.state.players.get(sid)?.name ?? this.departedNames.get(sid) ?? "";
            order.push({ sessionId: sid, name, survived: false });
        }
        console.log(`[GameRoom ${this.roomId}] 收局 matchId=${this.state.matchId}：${order.map((o, i) => `#${i + 1} ${o.name}`).join("，")}`);

        if (!order.some((o) => this.participantUserId.has(o.sessionId))) return;
        void trackTask("game:match-evidence", emitMatchEvidence({
            matchId: this.state.matchId,
            sId: this.sId, // ⚠ 房级区（见 onCreate）：证据发出后房间即 dispose，⛔ 此处不带就永久丢失
            mode: MATCH_MODE_CASUAL, // 排位房型接入后按房型切 MATCH_MODE_RANKED
            seed: this.matchSeed,
            mapIndex: 0, // 单地图演示
            loadout: null,
            injectWaves: [], // 本作暂无服务端注入事件；有则仿 Arthur VersusRoom 记 injectLog
            participants: order.map((o, i) => ({
                sessionId: o.sessionId,
                userId: this.participantUserId.get(o.sessionId) ?? null, // 游客 null
                name: o.name,
                place: i + 1,
                round: 0, // 本作无波次概念
                elapsedMs,
                survived: o.survived,
            })),
        }));
    }
}
