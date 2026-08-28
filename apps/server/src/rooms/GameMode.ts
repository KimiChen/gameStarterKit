import type { Client } from "colyseus";
import type { C2SType } from "@game/shared";
import type { GameRoomState } from "./schema/GameRoomState";

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
}

export interface GameModeMessage<TState = GameRoomState> {
    readonly type: C2SType;
    readonly client: Client;
    readonly payload: unknown;
    readonly context: GameModeContext<TState>;
}

export interface GameMode<TState = GameRoomState> {
    readonly id: string;
    /** Return false to reject the client after auth but before state mutation. */
    onAdmission?(context: GameModeContext<TState> & { readonly client: Client }): boolean | void;
    /** Return true when the mode fully consumes a validated message. */
    onMessage?(message: GameModeMessage<TState>): boolean | void;
    onMatchStart?(context: GameModeContext<TState>): void;
    onStep?(context: GameModeContext<TState> & { readonly dtMs: number }): void;
    onLeave?(context: GameModeContext<TState> & { readonly client: Client }): void;
    onFinish?(context: GameModeContext<TState>): void;
}

export type GameModeFactory<TState = GameRoomState> = () => GameMode<TState>;

/** Process-local mode registry. Registration is ownership-safe and reversible. */
export class GameModeRegistry<TState = GameRoomState> {
    private readonly factories = new Map<string, GameModeFactory<TState>>();

    register(id: string, factory: GameModeFactory<TState>, options: { readonly replace?: boolean } = {}): () => void {
        const key = normalizeModeId(id);
        if (typeof factory !== "function") throw new TypeError("[GameModeRegistry] factory 必须是函数");
        if (this.factories.has(key) && !options.replace) {
            throw new Error(`[GameModeRegistry] 玩法已登记：${key}`);
        }
        this.factories.set(key, factory);
        return () => {
            if (this.factories.get(key) === factory) this.factories.delete(key);
        };
    }

    has(id: string): boolean { return this.factories.has(normalizeModeId(id)); }

    list(): readonly string[] { return [...this.factories.keys()].sort(); }

    create(id: string): GameMode<TState> {
        const key = normalizeModeId(id);
        const factory = this.factories.get(key);
        if (!factory) throw new Error(`[GameModeRegistry] 未登记玩法：${key}`);
        const mode = factory();
        if (!mode || typeof mode !== "object" || mode.id !== key) {
            throw new Error(`[GameModeRegistry] 插件 id 不匹配：登记 ${key}，实际 ${String(mode?.id)}`);
        }
        return mode;
    }
}

export const BALL_MOVE_GAME_MODE_ID = "ballMove";

/** Default mode keeps the existing GameRoom rules as the compatibility mode. */
export const gameModeRegistry = new GameModeRegistry<GameRoomState>();
gameModeRegistry.register(BALL_MOVE_GAME_MODE_ID, () => ({ id: BALL_MOVE_GAME_MODE_ID }));

function normalizeModeId(id: string): string {
    if (typeof id !== "string" || id.trim().length === 0) {
        throw new TypeError("[GameModeRegistry] 玩法 id 不能为空");
    }
    return id.trim();
}
