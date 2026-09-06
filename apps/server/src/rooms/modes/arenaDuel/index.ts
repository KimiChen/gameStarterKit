import { ArenaDuelStrike, GAMEPLAY_CATALOG, GameplayModeId, gameplayC2STokens } from "@game/shared";
import { ArenaDuelPlayerState, ArenaDuelRoomState } from "../../schema/GameRoomState";
import {
    gameModeRegistry,
    type GameMode,
    type GameModeRegistry,
    type GameplayCommandsFor,
} from "../../GameMode";

/**
 * arenaDuel 服务端 GameMode（kits/arena 的决斗 mode）。规则：每次 strike 让自己的 hits +1，先让 hits ≥ hp 者胜并结算；
 * roster max 来自本 mode manifest（2 人），min=1/autoStart=1（首人即开局），单人也能跑完一局——预览/实证用。
 * ⛔ 只消费框架 API：GameMode 接缝 + 生成的 ArenaDuelRoomState/ArenaDuelPlayerState + wire token。
 */
export const ARENA_DUEL_DEFAULT_HP = 3;
export const ARENA_DUEL_MAX_HP = 10_000;

export interface ArenaDuelGameModeOptions {
    /** 测试注入；生产登记恒用缺省。 */
    readonly hp?: number;
}

function normalizeHp(value: number | undefined): number {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= ARENA_DUEL_MAX_HP
        ? value
        : ARENA_DUEL_DEFAULT_HP;
}

function resetMatchState(state: ArenaDuelRoomState, hp: number): void {
    state.hp = hp;
    state.winnerId = "";
    state.players.forEach((player) => { player.hits = 0; });
}

export function createArenaDuelGameMode(options: ArenaDuelGameModeOptions = {}): GameMode<ArenaDuelRoomState, ArenaDuelPlayerState> {
    const hp = normalizeHp(options.hp);
    return {
        id: GameplayModeId.ArenaDuel,
        roster: { min: 1, max: GAMEPLAY_CATALOG.arenaDuel.maxPlayers, autoStart: 1 },
        createPlayer: ({ sessionId, name }) => {
            const player = new ArenaDuelPlayerState();
            player.id = sessionId;
            player.name = name;
            return player;
        },
        commands: {
            [ArenaDuelStrike.type]: ({ state, client, settle }) => {
                const player = state.players.get(client.sessionId);
                if (!player || state.winnerId !== "") return;
                player.hits++;
                if (player.hits >= state.hp) {
                    state.winnerId = client.sessionId;
                    settle();
                }
            },
        } satisfies GameplayCommandsFor<ArenaDuelRoomState, typeof gameplayC2STokens.arenaDuel>,
        onMatchInitialize: ({ state }) => resetMatchState(state, hp),
        onMatchRollback: ({ state }) => resetMatchState(state, hp),
        onStep: () => undefined,
        onPlayerLeaving: ({ state, client, duringMatch }) => {
            if (!duringMatch || state.winnerId !== "") return;
            // 对局中对手离开：剩下的那个人直接获胜（没人剩下则无赢家，shouldSettle 收局）。
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
export function registerArenaDuelGameMode(registry: GameModeRegistry = gameModeRegistry): () => void {
    return registry.register<ArenaDuelRoomState, ArenaDuelPlayerState>(GameplayModeId.ArenaDuel, createArenaDuelGameMode);
}
