import { ArenaCaptureCapture, GameplayModeId, MAX_PLAYERS, gameplayC2STokens } from "@game/shared";
import { ArenaCapturePlayerState, ArenaCaptureRoomState } from "../../schema/GameRoomState";
import {
    gameModeRegistry,
    type GameMode,
    type GameModeRegistry,
    type GameplayCommandsFor,
} from "../../GameMode";

/**
 * arenaCapture 服务端 GameMode（kits/arena 的占领赛 mode）。规则：每次 capture +1，先到 captureGoal 者胜并结算；
 * roster min=1/autoStart=1（首人即开局），单人也能跑完一局——预览/实证用。
 * ⛔ 只消费框架 API：GameMode 接缝 + 生成的 ArenaCaptureRoomState/ArenaCapturePlayerState + wire token。
 */
export const ARENA_CAPTURE_DEFAULT_GOAL = 5;
export const ARENA_CAPTURE_MAX_GOAL = 10_000;

export interface ArenaCaptureGameModeOptions {
    /** 测试注入；生产登记恒用缺省。 */
    readonly captureGoal?: number;
}

function normalizeGoal(value: number | undefined): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= ARENA_CAPTURE_MAX_GOAL
        ? value
        : ARENA_CAPTURE_DEFAULT_GOAL;
}

function resetMatchState(state: ArenaCaptureRoomState, captureGoal: number): void {
    state.captureGoal = captureGoal;
    state.winnerId = "";
    state.players.forEach((player) => { player.captures = 0; });
}

export function createArenaCaptureGameMode(
    options: ArenaCaptureGameModeOptions = {},
): GameMode<ArenaCaptureRoomState, ArenaCapturePlayerState> {
    const captureGoal = normalizeGoal(options.captureGoal);
    return {
        id: GameplayModeId.ArenaCapture,
        roster: { min: 1, max: MAX_PLAYERS, autoStart: 1 },
        createPlayer: ({ sessionId, name }) => {
            const player = new ArenaCapturePlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        commands: {
            [ArenaCaptureCapture.type]: ({ state, client, settle }) => {
                const player = state.players.get(client.sessionId);
                if (!player || state.winnerId !== "") return;
                player.captures++;
                if (player.captures >= state.captureGoal) {
                    state.winnerId = client.sessionId;
                    settle();
                }
            },
        } satisfies GameplayCommandsFor<ArenaCaptureRoomState, typeof gameplayC2STokens.arenaCapture>,
        onMatchInitialize: ({ state }) => resetMatchState(state, captureGoal),
        onMatchRollback: ({ state }) => resetMatchState(state, captureGoal),
        onStep: () => undefined,
        onPlayerLeaving: ({ state, client, duringMatch }) => {
            if (!duringMatch || state.winnerId !== "") return;
            // 对局中有人离开：剩下的最后一人直接获胜（没人剩下则无赢家，shouldSettle 收局）。
            let remaining: string | null = null;
            let count = 0;
            state.players.forEach((_player, sessionId) => {
                if (sessionId === client.sessionId) return;
                count += 1;
                remaining = sessionId;
            });
            if (count === 1 && remaining) state.winnerId = remaining;
        },
        shouldSettle: ({ state }) => state.winnerId !== "" || state.players.size === 0,
    };
}

/** 模块自有登记；通用 GameRoom 与传输层零改动。 */
export function registerArenaCaptureGameMode(registry: GameModeRegistry = gameModeRegistry): () => void {
    return registry.register<ArenaCaptureRoomState, ArenaCapturePlayerState>(GameplayModeId.ArenaCapture, createArenaCaptureGameMode);
}
