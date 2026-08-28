import { C2S } from "@game/shared";
import type { GameRoomState } from "../schema/GameRoomState";
import {
    IDLE_GAME_MODE_ID,
    gameModeRegistry,
    type GameMode,
    type GameModeRegistry,
} from "../GameMode";

/**
 * A minimal but real second GameRoom mode. It shares authenticated room
 * admission with the starter while consuming gameplay messages without
 * applying ballMove rules.
 */
export function createIdleGameMode(): GameMode<GameRoomState> {
    return {
        id: IDLE_GAME_MODE_ID,
        // Ping and Chat remain room/transport capabilities. Idle only consumes
        // the rule-specific inputs that ballMove would otherwise apply.
        onMessage: ({ type }) => type === C2S.Move || type === C2S.CastSkill,
    };
}

/** Module-owned registration; generic GameRoom and transport code stay unchanged. */
export function registerIdleGameMode(
    registry: GameModeRegistry<GameRoomState> = gameModeRegistry,
): () => void {
    return registry.register(IDLE_GAME_MODE_ID, createIdleGameMode);
}
