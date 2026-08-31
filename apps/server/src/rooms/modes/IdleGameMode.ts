import { C2S, MAX_PLAYERS } from "@game/shared";
import {
    IdlePlayerState,
    IdleRoomState,
} from "../schema/GameRoomState";
import {
    IDLE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
    type GameModeRegistry,
} from "../GameMode";

export const IDLE_DEFAULT_PULSE_GOAL = 3;
export const IDLE_MAX_PULSE_GOAL = 1_000;

export interface IdleGameModeOptions {
    /** Deterministic test override; production registration always uses the default. */
    readonly pulseGoal?: number;
}

function normalizePulseGoal(value: number | undefined): number {
    return typeof value === "number"
        && Number.isSafeInteger(value)
        && value >= 1
        && value <= IDLE_MAX_PULSE_GOAL
        ? value
        : IDLE_DEFAULT_PULSE_GOAL;
}

function resetIdleMatchState(state: IdleRoomState, pulseGoal: number): void {
    state.pulseGoal = pulseGoal;
    state.winnerId = "";
    state.players.forEach((player) => { player.pulses = 0; });
}

/**
 * A structurally independent second mode. Transport/admission remains in
 * GameRoom while every stateful rule below is typed to IdleRoomState.
 */
export function createIdleGameMode(options: IdleGameModeOptions = {}): GameMode<IdleRoomState, IdlePlayerState> {
    const pulseGoal = normalizePulseGoal(options.pulseGoal);
    return {
        id: IDLE_GAME_MODE_ID,
        // 与去硬编码前的 shell 行为逐值一致；roster 现在是 mode 的声明而不是 shell 的字面量。
        roster: { min: 2, max: MAX_PLAYERS, autoStart: 2 },
        // IdlePulse 此前写死在通用 shell 的 phaseAllows switch 里，现由本 mode 自己声明。
        inputs: { accepts: [C2S.IdlePulse] },
        // 不声明 evidence capability：idle settle 时明确不产出任何收局证据。
        createPlayer: ({ sessionId, name }) => {
            const player = new IdlePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        // Ping and Chat remain shared transport capabilities. Gameplay inputs
        // are exclusive: unsupported Move/Cast return false and GameRoom rejects
        // them before any ballMove fallback can run.
        onMessage: ({ type, client, context }) => {
            if (type !== C2S.IdlePulse) return false;
            const player = context.state.players.get(client.sessionId);
            if (!player) return true;
            player.pulses++;
            if (player.pulses >= context.state.pulseGoal) {
                context.state.winnerId = client.sessionId;
                context.settle();
            }
            return true;
        },
        onMatchInitialize: ({ state }) => resetIdleMatchState(state, pulseGoal),
        onMatchRollback: ({ state }) => resetIdleMatchState(state, pulseGoal),
        onStep: () => undefined,
        onPlayerLeaving: ({ state, client, duringMatch }) => {
            if (!duringMatch) return;
            state.winnerId = "";
            state.players.forEach((_player, sessionId) => {
                if (sessionId !== client.sessionId) state.winnerId = sessionId;
            });
        },
        shouldSettle: ({ state }) => state.players.size <= 1,
    };
}

/** Module-owned registration; generic GameRoom and transport code stay unchanged. */
export function registerIdleGameMode(
    registry: GameModeRegistry = gameModeRegistry,
): () => void {
    return registry.register<IdleRoomState, IdlePlayerState>(IDLE_GAME_MODE_ID, createIdleGameMode);
}
