import { GameplayModeId, MAX_PLAYERS, TallyTap, gameplayC2STokens } from "@game/shared";
import { TallyPlayerState, TallyRoomState } from "../../schema/GameRoomState";
import {
    gameModeRegistry,
    type GameMode,
    type GameModeRegistry,
    type GameplayCommandsFor,
} from "../../GameMode";

/**
 * tally 服务端 GameMode（plugins/tally）。规则：每个 tap +1，先到 tapGoal 者胜并结算；
 * roster min=1/autoStart=1（首人即开局的 auto 策略），单人也能跑完一局——预览/实证用。
 * ⛔ 只消费框架 API：GameMode 接缝 + 生成的 TallyRoomState/TallyPlayerState + wire token。
 */
export const TALLY_DEFAULT_TAP_GOAL = 10;
export const TALLY_MAX_TAP_GOAL = 10_000;

export interface TallyGameModeOptions {
    /** 测试注入；生产登记恒用缺省。 */
    readonly tapGoal?: number;
}

function normalizeTapGoal(value: number | undefined): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= TALLY_MAX_TAP_GOAL
        ? value
        : TALLY_DEFAULT_TAP_GOAL;
}

function resetTallyMatchState(state: TallyRoomState, tapGoal: number): void {
    state.tapGoal = tapGoal;
    state.winnerId = "";
    state.players.forEach((player) => { player.taps = 0; });
}

export function createTallyGameMode(options: TallyGameModeOptions = {}): GameMode<TallyRoomState, TallyPlayerState> {
    const tapGoal = normalizeTapGoal(options.tapGoal);
    return {
        id: GameplayModeId.Tally,
        roster: { min: 1, max: MAX_PLAYERS, autoStart: 1 },
        createPlayer: ({ sessionId, name }) => {
            const player = new TallyPlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        commands: {
            [TallyTap.type]: ({ state, client, settle }) => {
                const player = state.players.get(client.sessionId);
                if (!player || state.winnerId !== "") return;
                player.taps++;
                if (player.taps >= state.tapGoal) {
                    state.winnerId = client.sessionId;
                    settle();
                }
            },
        } satisfies GameplayCommandsFor<TallyRoomState, typeof gameplayC2STokens.tally>,
        onMatchInitialize: ({ state }) => resetTallyMatchState(state, tapGoal),
        onMatchRollback: ({ state }) => resetTallyMatchState(state, tapGoal),
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
export function registerTallyGameMode(registry: GameModeRegistry = gameModeRegistry): () => void {
    return registry.register<TallyRoomState, TallyPlayerState>(GameplayModeId.Tally, createTallyGameMode);
}
