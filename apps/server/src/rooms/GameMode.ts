import type { Client } from "colyseus";
import {
    GameplayModeId,
    MAP_HEIGHT,
    MAP_WIDTH,
    validateGameplayModeId,
    type C2SType,
} from "@game/shared";
import { BALL_MOVE_RULESET_ID, BALL_MOVE_RULESET_VERSION } from "../core/match/matchEvidence";
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

export interface GameMode<TState = GameRoomState, TPlayer = PlayerState> {
    readonly id: string;
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

function normalizeModeId(id: string): string {
    try {
        return validateGameplayModeId(id, "gameplay.id");
    } catch {
        throw new TypeError("[GameModeRegistry] 玩法 id 必须是规范的 1..64 字符标识");
    }
}
