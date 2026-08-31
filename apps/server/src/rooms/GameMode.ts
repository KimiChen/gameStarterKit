import type { Client } from "colyseus";
import {
    C2S,
    GamePhase,
    GameplayModeId,
    MAP_HEIGHT,
    MAP_WIDTH,
    MAX_PLAYERS,
    validateGameplayModeId,
    type C2SType,
    type GamePhaseType,
} from "@game/shared";
import {
    BALL_MOVE_ROSTER_SIZE,
    BALL_MOVE_RULESET_ID,
    BALL_MOVE_RULESET_VERSION,
} from "../core/match/matchEvidence";
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
    /** Freeze the current match synchronously. Mode state must be finalized first. */
    settle(): void;
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
}

export interface GameModeMessage<TState = GameRoomState> {
    readonly type: C2SType;
    readonly client: Client;
    readonly payload: unknown;
    readonly context: GameModeContext<TState>;
}

/**
 * 一个玩法的人数事实。GameRoom 是通用 shell，⛔ 不得再在 shell 里写死人数字面量——
 * 「几个人算满」「几个人能开」「几个人自动开」是玩法事实，不是传输层事实。
 *
 * `max` 的上界不是随便定的：root players map 的容量由生成 validator 按 shared 的
 * `MAX_PLAYERS` 烧死（manifest 的 `maxSizeConstant`），声明超过它的 mode 会在 schema
 * 层炸，所以这里 fail-closed 挡在**建 mode 实例时**（`GameModeRegistry.create`，即建房那一刻）。
 * ⚠ 不是 `register()`：register 只收一个 factory，不调用它，所以拿不到可校验的实例。
 */
export interface GameModeRoster {
    /** 开局所需最少人数；低于它 startMatch 不开局。 */
    readonly min: number;
    /** 房间容量上限，写进 Colyseus 的 `maxClients`。必须 ≤ shared 的 MAX_PLAYERS。 */
    readonly max: number;
    /** 达到该人数时自动开局；必须落在 [min, max]。 */
    readonly autoStart: number;
}

/**
 * 每个玩法自己声明它收哪些 C2S 输入、各自在哪些 phase 开放。
 *
 * ⚠ handler 表本身**不能**按 mode 构建：Colyseus 0.17 在 `Room.__init()` 里就消费掉
 * `this.messages`，而 `__init()` 跑在 `onCreate()` 之前，生产房的 mode 直到 onCreate 才选定。
 * 所以形态固定为「全 C2S 联合的静态 handler 表 + 在 acceptMessage 里按 mode 声明准入」。
 */
export interface GameModeInputs {
    /** 本玩法接受的 C2S 输入。⛔ 不含 Ping/Chat：那两条是 shell 的公共传输能力。 */
    readonly accepts: readonly C2SType[];
    /** 各输入开放的 phase；未列出的输入默认只在 Playing 开放。 */
    readonly phases?: { readonly [K in C2SType]?: readonly GamePhaseType[] };
}

export interface GameMode<TState = GameRoomState, TPlayer = PlayerState> {
    readonly id: string;
    /** 人数事实；shell 只按它分发，不再写死字面量。 */
    readonly roster: GameModeRoster;
    /** 输入事实；shell 只按它准入，不再在 switch 里穷举玩法消息名。 */
    readonly inputs: GameModeInputs;
    /** Creates the exact per-mode Schema value inserted into the root players map. */
    createPlayer(context: GameModePlayerFactoryContext): TPlayer;
    /**
     * True delegates simulation fallbacks to the starter's ballMove rules;
     * false guarantees GameRoom never reads ball-only fields for this mode.
     */
    readonly usesDefaultBallMoveRules: boolean;
    /** Exact replay contract implemented by this mode, when any. */
    readonly matchEvidenceRuleset?: {
        readonly id: string;
        readonly version: number;
    };
    /** Return false to reject the client after auth but before state mutation. */
    onAdmission?(context: GameModeContext<TState> & { readonly client: Client }): boolean | void;
    /** Return true when the mode fully consumes a validated message. */
    onMessage?(message: GameModeMessage<TState>): boolean | void;
    /** Runs after common tick/match bookkeeping has been reset. */
    onMatchInitialize?(context: GameModeContext<TState>): void | Promise<void>;
    onMatchStart?(context: GameModeContext<TState>): void | Promise<void>;
    /** Restores mode-owned fields when an attempted start is rolled back. */
    onMatchRollback?(context: GameModeContext<TState>): void | Promise<void>;
    onStep?(context: GameModeContext<TState> & { readonly dtMs: number }): void;
    /** Synchronous state transition before the departing player is removed. */
    onPlayerLeaving?(context: GameModePlayerLeavingContext<TState, TPlayer>): void;
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
        if (typeof mode.usesDefaultBallMoveRules !== "boolean") {
            throw new Error(`[GameModeRegistry] mode ${key} 必须声明 usesDefaultBallMoveRules boolean`);
        }
        if (typeof mode.createPlayer !== "function") {
            throw new Error(`[GameModeRegistry] mode ${key} 必须声明 createPlayer factory`);
        }
        assertGameModeRoster(key, mode.roster, mode.matchEvidenceRuleset);
        assertGameModeInputs(key, mode.inputs);
        // The id check above is the registry's runtime erasure boundary. The
        // selected mode keeps its precise state/player types within its hooks.
        return mode as GameMode<TModeState, TModePlayer>;
    }
}

export const BALL_MOVE_GAME_MODE_ID = GameplayModeId.BallMove;
export const IDLE_GAME_MODE_ID = GameplayModeId.Idle;

/** Default mode keeps the existing GameRoom rules as the compatibility mode. */
export const gameModeRegistry = new GameModeRegistry<GameRoomState>();
export function createBallMoveGameMode(): GameMode<GameRoomState, PlayerState> {
    return {
        id: BALL_MOVE_GAME_MODE_ID,
        // 与去硬编码前的 shell 行为逐值一致：满员 MAX_PLAYERS、两人开局、两人自动开局。
        roster: { min: 2, max: MAX_PLAYERS, autoStart: 2 },
        // Move/CastSkill 是正式模拟输入，⛔ 绝不在 Waiting/Settle 改状态。
        inputs: { accepts: [C2S.Move, C2S.CastSkill] },
        usesDefaultBallMoveRules: true,
        createPlayer: ({ sessionId, name, randomInt }) => {
            const player = new PlayerState();
            player.id = sessionId;
            player.name = name;
            player.x = randomInt(100, MAP_WIDTH - 100);
            player.y = randomInt(100, MAP_HEIGHT - 100);
            return player;
        },
        matchEvidenceRuleset: {
            id: BALL_MOVE_RULESET_ID,
            version: BALL_MOVE_RULESET_VERSION,
        },
    };
}
gameModeRegistry.register(BALL_MOVE_GAME_MODE_ID, createBallMoveGameMode);

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
    ruleset?: GameMode["matchEvidenceRuleset"],
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
    if (roster.max > MAX_PLAYERS) {
        throw new Error(
            `[GameModeRegistry] mode ${key} 的 roster.max=${roster.max} 超过 root players map 的容量 ${MAX_PLAYERS}`,
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
    // ballMove v1 证据把 initialRoster 冻结成**恰好** BALL_MOVE_ROSTER_SIZE 条（producer 与
    // verifier 两侧都按 exactArray 校验），所以声明该 ruleset 却配了别的开局人数，是一条自相
    // 矛盾的声明。此前它只在真开局时炸成给客户端的 1000/Unknown，这里提前到建 mode 实例时。
    // ⛔ 不连 max 一起断言：max 是座位上限，与「开局时恰好几人」不是同一件事。
    if (ruleset && ruleset.id === BALL_MOVE_RULESET_ID && ruleset.version === BALL_MOVE_RULESET_VERSION
        && (roster.min !== BALL_MOVE_ROSTER_SIZE || roster.autoStart !== BALL_MOVE_ROSTER_SIZE)) {
        throw new Error(
            `[GameModeRegistry] mode ${key} 声明了 ballMove v1 证据，其 roster.min/autoStart `
            + `必须都是 ${BALL_MOVE_ROSTER_SIZE}，实际 min=${roster.min} autoStart=${roster.autoStart}`,
        );
    }
}

/**
 * shell 自己拥有的公共传输能力，⛔ mode 不得在 `inputs.accepts` 里重复声明它们：
 * 那会让「谁决定 Ping 的准入」出现两个真源。
 */
export const SHELL_COMMON_INPUTS: readonly C2SType[] = [C2S.Ping, C2S.Chat];

const ALL_PHASES: readonly GamePhaseType[] = Object.values(GamePhase);

/** inputs 的 fail-closed 校验；与 roster 同样在**建实例时**与注入期各跑一次（非 register 时）。 */
export function assertGameModeInputs(key: string, inputs: GameModeInputs | undefined): void {
    if (!inputs || typeof inputs !== "object" || !Array.isArray(inputs.accepts)) {
        throw new Error(`[GameModeRegistry] mode ${key} 必须声明 inputs{accepts}`);
    }
    const known = Object.values(C2S) as readonly string[];
    const seen = new Set<string>();
    for (const type of inputs.accepts) {
        if (typeof type !== "string" || !known.includes(type)) {
            throw new Error(`[GameModeRegistry] mode ${key} 的 inputs.accepts 含未知 C2S：${String(type)}`);
        }
        if ((SHELL_COMMON_INPUTS as readonly string[]).includes(type)) {
            throw new Error(
                `[GameModeRegistry] mode ${key} 不得声明公共传输输入 ${type}——它由 shell 拥有`,
            );
        }
        if (seen.has(type)) {
            throw new Error(`[GameModeRegistry] mode ${key} 的 inputs.accepts 重复声明 ${type}`);
        }
        seen.add(type);
    }
    for (const [type, phases] of Object.entries(inputs.phases ?? {})) {
        if (!seen.has(type)) {
            throw new Error(
                `[GameModeRegistry] mode ${key} 为未接受的输入 ${type} 声明了 inputs.phases`,
            );
        }
        if (!Array.isArray(phases) || phases.length === 0) {
            throw new Error(`[GameModeRegistry] mode ${key} 的 inputs.phases.${type} 必须是非空 phase 数组`);
        }
        for (const phase of phases) {
            if (!ALL_PHASES.includes(phase)) {
                throw new Error(
                    `[GameModeRegistry] mode ${key} 的 inputs.phases.${type} 含未知 phase：${String(phase)}`,
                );
            }
        }
    }
}

/** 该 mode 是否在当前 phase 接受这条输入。未列 phases 的输入默认只在 Playing 开放。 */
export function modeAllowsInput(
    inputs: GameModeInputs,
    type: C2SType,
    phase: GamePhaseType,
): boolean {
    if (!inputs.accepts.includes(type)) return false;
    const phases = inputs.phases?.[type] ?? [GamePhase.Playing];
    return phases.includes(phase);
}

function normalizeModeId(id: string): string {
    try {
        return validateGameplayModeId(id, "gameplay.id");
    } catch {
        throw new TypeError("[GameModeRegistry] 玩法 id 必须是规范的 1..64 字符标识");
    }
}
