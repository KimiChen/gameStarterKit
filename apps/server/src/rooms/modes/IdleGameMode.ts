import { IdlePulse, MAX_PLAYERS, gameplayC2STokens } from "@game/shared";
import {
    IdlePlayerState,
    IdleRoomState,
} from "../schema/GameRoomState";
import {
    IDLE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
    type GameModeRegistry,
    type GameplayCommandsFor,
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
        // 不声明 evidence capability：idle settle 时明确不产出任何收局证据。
        createPlayer: ({ sessionId, name }) => {
            const player = new IdlePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        // Ping/Chat 仍是 shell 的公共传输能力。玩法输入按 wire token owner 独占分发：
        // Move/Cast 属 ballMove，catch-all dispatcher 在 owner 闸就会拒绝，⛔ 不会到达本表。
        // 键由本玩法 wire token 派生（satisfies 钉住键集与 payload 类型）。
        commands: {
            [IdlePulse.type]: ({ state, client, settle }) => {
                const player = state.players.get(client.sessionId);
                if (!player) return;
                player.pulses++;
                if (player.pulses >= state.pulseGoal) {
                    state.winnerId = client.sessionId;
                    settle();
                }
            },
        } satisfies GameplayCommandsFor<IdleRoomState, typeof gameplayC2STokens.idle>,
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
