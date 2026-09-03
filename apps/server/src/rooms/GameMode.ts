import type { Client } from "colyseus";
import {
    GAMEPLAY_CATALOG,
    gameplayC2STokens,
    GameplayModeId,
    MAX_PLAYERS,
    validateGameplayModeId,
    type ErrorCodeType,
    type GameplayS2CToken,
} from "@game/shared";
// ⚠ 仅类型：MatchEvidenceV3 是 core 拥有的通用证据格式（不是 ballMove 私有符号），
// evidence capability 的 build() 返回值需要它。本文件不 import 任何 ballMove 实现。
import type { MatchEvidenceV3 } from "../core/match/matchEvidence";
import { GameRoomState, PlayerState } from "./schema/GameRoomState";

/**
 * Server-side gameplay extension point.  GameRoom keeps ownership of the
 * Colyseus transport and admission invariants; a mode supplies only the
 * rules that vary between games.
 */
export interface GameModeContext<TState = GameRoomState> {
    readonly state: TState;
    readonly roomId: string;
    readonly sId: number;
    readonly fixedStepMs: number;
    /** 本局种子（进证据链供 verifier 重放）。 */
    readonly matchSeed: number;
    /**
     * 可选的房级稳定 epoch。声明 roomLifecycle capability 的玩法会在 admission 开放前
     * 获得一次值，并在整个房间生命周期内保持不变；普通玩法为 null。
     */
    readonly roomEpochId?: string | null;
    /**
     * 正式对局确定性随机流。⚠ 房间在 initializeMatchState 里**重建**该流，context 的
     * 两个方法始终转发到当前流（闭包引用，非快照）——mode 不得自己缓存底层流对象。
     */
    readonly random: {
        next(): number;
        nextInt(min: number, max: number): number;
    };
    /** Freeze the current match synchronously. Mode state must be finalized first. */
    settle(): void;
    /**
     * 出站 S2C 走 wire token：发送前验 `token.dir === "s2c"` 且 owner ∈ {core, 当前 mode}，
     * payload 过 `token.validate`（与拆分前的 shared validator 路径等价）。
     * client 允许为 undefined（注入/回放）。
     */
    sendS2C<TPayload>(client: Client | undefined, token: GameplayS2CToken<TPayload>, payload: TPayload): void;
    broadcastS2C<TPayload>(token: GameplayS2CToken<TPayload>, payload: TPayload): void;
    sendError(client: Client, code: ErrorCodeType): void;
    /** 注入/回放路径按 sessionId 反查真实连接；不存在时返回 undefined。 */
    findClientBySession(sessionId: string): Client | undefined;
    /** 当前对局参与者的框架账号 uid（participantUserId 快照）；无记录时 null。 */
    userIdOf(sessionId: string): string | null;
}

export interface GameModePlayerFactoryContext {
    readonly sessionId: string;
    readonly name: string;
    randomInt(min: number, max: number): number;
}

export interface GameModePlayerLeavingContext<TState, TPlayer> extends GameModeContext<TState> {
    readonly client: Client;
    readonly player: TPlayer;
    readonly acceptedTick: number;
    readonly duringMatch: boolean;
    readonly closeCode: number;
    readonly consented: boolean;
}

export interface GameModeConnectionChangedContext<TState, TPlayer> extends GameModeContext<TState> {
    readonly client: Client;
    readonly player: TPlayer;
    readonly connected: boolean;
}

/**
 * 只有需要跨个人 run 保持房级身份的玩法才声明此能力。shell 负责在 onCreate 内、
 * 首个 admission 之前生成 epoch 并前移 state.matchId；玩法只负责投影自有字段。
 */
export interface GameModeRoomLifecycleCapability<TState> {
    readonly stableRoomEpoch: true;
    onRoomInitialize(context: GameModeContext<TState> & { readonly roomEpochId: string }): void;
}

/** commands handler 收到的 context：房间 context + 发送方连接。 */
export type GameModeCommandContext<TState = GameRoomState> =
    GameModeContext<TState> & { readonly client: Client };

/**
 * 玩法输入的 typed handler map 值形态。
 * `payload: never` 是刻意的逆变收口：具体 handler 可以把 payload 声明成自己的精确
 * 类型（如 IMoveReq），仍可赋给本形态；调用方（GameRoom dispatcher）只会传入
 * 已经过该消息 wire token exact validate 的 payload。
 */
export type GameModeCommandHandler<TState = GameRoomState> =
    (context: GameModeCommandContext<TState>, payload: never) => void;

/**
 * 从该玩法的 wire token 表派生 commands 的键与 payload 类型；
 * mode 实现用 `satisfies GameplayCommandsFor<TState, typeof gameplayC2STokens.<id>>` 钉住。
 */
export type GameplayCommandsFor<
    TState,
    TTokens extends { readonly [type: string]: { readonly type: string; validate(input: unknown): unknown } },
> = {
    readonly [K in keyof TTokens & string]: (
        context: GameModeCommandContext<TState>,
        payload: ReturnType<TTokens[K]["validate"]>,
    ) => void;
};

/**
 * 一个玩法的人数事实。GameRoom 是通用 shell，⛔ 不得再在 shell 里写死人数字面量——
 * 「几个人算满」「几个人能开」「几个人自动开」是玩法事实，不是传输层事实。
 *
 * `max` 的上界不是随便定的：root players map 的容量由该 mode 自己的 state descriptor 提供
 * （`GAMEPLAY_CATALOG[modeId].maxPlayers`，来自 manifest.json），生成 validator 按它烧死字面量，
 * 声明超过它的 mode 会在 schema 层炸，所以这里 fail-closed 挡在**建 mode 实例时**
 * （`GameModeRegistry.create`，即建房那一刻）。
 * ⚠ 不是 `register()`：register 只收一个 factory，不调用它，所以拿不到可校验的实例。
 */
export interface GameModeRoster {
    /** 开局所需最少人数；低于它 startMatch 不开局。 */
    readonly min: number;
    /** 房间容量上限，写进 Colyseus 的 `maxClients`。必须 ≤ 该 mode 的 players map 容量。 */
    readonly max: number;
    /** 达到该人数时自动开局；必须落在 [min, max]。 */
    readonly autoStart: number;
}

/**
 * mode 的可选证据能力。声明了它的 mode 拥有可重放的收局证据契约；未声明的 mode
 * （如 idle）在 settle 时明确不产出任何证据。
 */
export interface GameModeEvidenceCapability {
    /**
     * roster 与证据契约的自洽闸。registry.create 与注入两条路径都在 roster/commands 闸后调用，
     * 保持「非法 roster+证据耦合在建 mode 实例时抛」的既有时机。
     */
    assertRosterCompatible(key: string, roster: GameModeRoster): void;
    /**
     * 开局边界（mode start boundary 之后、phase=Playing 之前）冻结初始快照；
     * throw = 开局失败，走既有 rollback。
     */
    captureInitialState(): void;
    /** settle 时、onFinish 之前调用；null = 本局无证据（静默丢弃/不产出）。 */
    build(): MatchEvidenceV3 | null;
}

export interface GameMode<TState = GameRoomState, TPlayer = PlayerState> {
    readonly id: string;
    /** 人数事实；shell 只按它分发，不再写死字面量。 */
    readonly roster: GameModeRoster;
    /**
     * 玩法输入的 typed handler map：键必须是**本玩法** wire token 的消息名
     * （`gameplayC2STokens[id]` 的键集；create 与注入两路径都校验）。
     * 准入（owner/phase/预算/exact validate）全部由 GameRoom 的 catch-all dispatcher
     * 按生成的 wire catalog 执行，⚠ handler 收到的 payload 已过 exact validate。
     *
     * ⚠ handler 表不能按 mode 换表：Colyseus 0.17 在 `Room.__init()` 里就消费掉
     * `this.messages`，而 `__init()` 跑在 `onCreate()` 之前——所以 GameRoom 只注册
     * 一个 catch-all，运行时按 owner/mode 分发到这里。
     */
    readonly commands?: { readonly [type: string]: GameModeCommandHandler<TState> };
    /** Creates the exact per-mode Schema value inserted into the root players map. */
    createPlayer(context: GameModePlayerFactoryContext): TPlayer;
    /** 可选证据能力；未声明的 mode settle 时不产出证据。 */
    readonly evidence?: GameModeEvidenceCapability;
    readonly roomLifecycle?: GameModeRoomLifecycleCapability<TState>;
    /** Return false to reject the client after auth but before state mutation. */
    onAdmission?(context: GameModeContext<TState> & { readonly client: Client }): boolean | void;
    /** Runs after common tick/match bookkeeping has been reset. */
    onMatchInitialize?(context: GameModeContext<TState>): void | Promise<void>;
    onMatchStart?(context: GameModeContext<TState>): void | Promise<void>;
    /** Restores mode-owned fields when an attempted start is rolled back. */
    onMatchRollback?(context: GameModeContext<TState>): void | Promise<void>;
    /**
     * stepFixed 在 `tick++` **之前**调用（ballMove 在此应用注入/回放输入）。
     * ⚠ 该钩子可能同步 settle；shell 调用后必须复查 phase===Playing 再推进 tick。
     */
    onBeforeStep?(context: GameModeContext<TState> & { readonly dtMs: number }): void;
    onStep?(context: GameModeContext<TState> & { readonly dtMs: number }): void;
    /** Synchronous state transition before the departing player is removed. */
    onPlayerLeaving?(context: GameModePlayerLeavingContext<TState, TPlayer>): void;
    /** 断线宽限开始/重连成功边界；最终离场仍只走 onPlayerLeaving。 */
    onConnectionChanged?(context: GameModeConnectionChangedContext<TState, TPlayer>): void;
    /** Mode-owned settlement predicate, evaluated after a real leave. */
    shouldSettle?(context: GameModeContext<TState>): boolean;
    onLeave?(context: GameModeContext<TState> & { readonly client: Client }): void | Promise<void>;
    onFinish?(context: GameModeContext<TState>): void;
    /** Final room-level cleanup; called once whether or not a match settled. */
    onDispose?(context: GameModeContext<TState>): void | Promise<void>;
}

export type GameModeFactory<TState = GameRoomState, TPlayer = PlayerState> = () => GameMode<TState, TPlayer>;

interface GameModeRegistration {
    readonly factory: GameModeFactory<any, any>;
}

/** Process-local mode registry. Registration is ownership-safe and reversible. */
export class GameModeRegistry<TState = GameRoomState, TPlayer = PlayerState> {
    private readonly registrations = new Map<string, GameModeRegistration>();

    register<TModeState = TState, TModePlayer = TPlayer>(
        id: string,
        factory: GameModeFactory<TModeState, TModePlayer>,
        options: { readonly replace?: boolean } = {},
    ): () => void {
        const key = normalizeModeId(id);
        if (typeof factory !== "function") throw new TypeError("[GameModeRegistry] factory 必须是函数");
        if (this.registrations.has(key) && !options.replace) {
            throw new Error(`[GameModeRegistry] 玩法已登记：${key}`);
        }
        const registration: GameModeRegistration = { factory };
        this.registrations.set(key, registration);
        return () => {
            if (this.registrations.get(key) === registration) this.registrations.delete(key);
        };
    }

    has(id: string): boolean { return this.registrations.has(normalizeModeId(id)); }

    list(): readonly string[] { return [...this.registrations.keys()].sort(); }

    create<TModeState = TState, TModePlayer = TPlayer>(id: string): GameMode<TModeState, TModePlayer> {
        const key = normalizeModeId(id);
        const registration = this.registrations.get(key);
        if (!registration) throw new Error(`[GameModeRegistry] 未登记玩法：${key}`);
        const mode = registration.factory();
        if (!mode || typeof mode !== "object" || mode.id !== key) {
            throw new Error(`[GameModeRegistry] 插件 id 不匹配：登记 ${key}，实际 ${String(mode?.id)}`);
        }
        if (typeof mode.createPlayer !== "function") {
            throw new Error(`[GameModeRegistry] mode ${key} 必须声明 createPlayer factory`);
        }
        assertGameModeRoster(key, mode.roster);
        assertGameModeCommands(key, mode.commands);
        // 声明了证据能力的 mode，其 roster 必须与证据契约自洽（如 ballMove v1 的固定 2 人）。
        // 与 roster/commands 闸同一时机：create（建房）与注入构造期，⛔ register 不校验。
        mode.evidence?.assertRosterCompatible(key, mode.roster);
        // The id check above is the registry's runtime erasure boundary. The
        // selected mode keeps its precise state/player types within its hooks.
        return mode as GameMode<TModeState, TModePlayer>;
    }
}

export const BALL_MOVE_GAME_MODE_ID = GameplayModeId.BallMove;
export const IDLE_GAME_MODE_ID = GameplayModeId.Idle;

/**
 * Process-local production registry.  ⚠ 本文件不注册任何具体玩法：登记发生在进程组合根
 * `modes/catalog.ts`（ballMove 与 idle 对称），import 本文件不再带任何注册副作用。
 */
export const gameModeRegistry = new GameModeRegistry<GameRoomState>();

/**
 * roster 的 fail-closed 校验：漏配、非整数、或次序不成立都在**建 mode 实例时**抛，
 * ⛔ 不允许留到运行期由 shell 用 `?? 2` 之类的默认值兜底——那等于把硬编码从 shell 挪进兜底表达式。
 *
 * ⚠ 「建实例时」= `GameModeRegistry.create(id)`（建房那一刻）与注入式 mode 的构造期，
 * **不是** `register(id, factory)`：register 只登记 factory、不调用它，此时没有实例可校验。
 * 也就是说一个非法 mode 能被成功 register，直到第一次建房才炸——这是当前形状的真实边界。
 *
 * 导出是必要的：注入式 mode（test/replay harness 的 `GameRoomRuntimeOptions.mode`）
 * 不经过 `create()`，⛔ 若只在注册表里校验，注入路径就成了绕过闸的后门。
 */
export function assertGameModeRoster(
    key: string,
    roster: GameModeRoster | undefined,
): void {
    if (!roster || typeof roster !== "object") {
        throw new Error(`[GameModeRegistry] mode ${key} 必须声明 roster{min,max,autoStart}`);
    }
    for (const field of ["min", "max", "autoStart"] as const) {
        const value = roster[field];
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new Error(`[GameModeRegistry] mode ${key} 的 roster.${field} 必须是 ≥1 的整数，实际 ${String(value)}`);
        }
    }
    // 该 mode 的 players map 容量来自它自己的 manifest（GAMEPLAY_CATALOG.maxPlayers）；
    // 未进 catalog 的 mode id（测试探针/注入 mode）保留 MAX_PLAYERS 作为 shell 兜底上界。
    const capacity = (GAMEPLAY_CATALOG as Readonly<Partial<Record<string, { readonly maxPlayers: number }>>>)[key]
        ?.maxPlayers ?? MAX_PLAYERS;
    if (roster.max > capacity) {
        throw new Error(
            `[GameModeRegistry] mode ${key} 的 roster.max=${roster.max} 超过 root players map 的容量 ${capacity}`,
        );
    }
    if (roster.min > roster.max) {
        throw new Error(`[GameModeRegistry] mode ${key} 的 roster.min=${roster.min} 大于 roster.max=${roster.max}`);
    }
    if (roster.autoStart < roster.min || roster.autoStart > roster.max) {
        throw new Error(
            `[GameModeRegistry] mode ${key} 的 roster.autoStart=${roster.autoStart} `
            + `必须落在 [${roster.min}, ${roster.max}]`,
        );
    }
    // roster 与证据契约的耦合断言不在这里：它属于声明证据能力的 mode 自己
    //（`GameModeEvidenceCapability.assertRosterCompatible`，create/注入两路径都会调）。
}

/**
 * commands 的 fail-closed 校验；与 roster 同样在**建实例时**与注入期各跑一次（非 register 时）。
 *
 * 键集必须 ⊆ 该 mode 自己的 wire token 集合（生成的 `gameplayC2STokens[id]`）：
 * 声明别的玩法或 core 的消息名（Ping/Chat 属 shell）都会在这里抛——owner 分发由
 * dispatcher 按 wire catalog 执行，一个越权的 commands 键永远收不到消息，静默
 * 留着它只会掩盖配置错误。
 */
export function assertGameModeCommands(key: string, commands: unknown): void {
    if (commands === undefined) return;
    if (!commands || typeof commands !== "object" || Array.isArray(commands)) {
        throw new Error(`[GameModeRegistry] mode ${key} 的 commands 必须是「消息名 → handler」对象`);
    }
    const owned = (gameplayC2STokens as Readonly<Partial<Record<string, Readonly<Record<string, unknown>>>>>)[key]
        ?? {};
    for (const [type, handler] of Object.entries(commands)) {
        if (typeof handler !== "function") {
            throw new Error(`[GameModeRegistry] mode ${key} 的 commands["${type}"] 必须是函数`);
        }
        if (!Object.prototype.hasOwnProperty.call(owned, type)) {
            throw new Error(
                `[GameModeRegistry] mode ${key} 的 commands 键 ${type} 不属于该玩法的 wire token 集合`
                + `（gameplayC2STokens["${key}"]）`,
            );
        }
    }
}

function normalizeModeId(id: string): string {
    try {
        return validateGameplayModeId(id, "gameplay.id");
    } catch {
        throw new TypeError("[GameModeRegistry] 玩法 id 必须是规范的 1..64 字符标识");
    }
}
