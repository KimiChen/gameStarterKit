/**
 * arenaDuel 的 transport 适配：adapter（mode/outbound/validateState）+ 绑定到一间物理房的 ArenaDuelRoom 端口 + joiner。
 * 只消费框架的 RoomClient 类型与 joinGameRoom，⛔ 不改 GameRoomTransport.ts（kit 玩法与插件玩法同一约束）。
 */
import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type { ArenaDuelRoom, ArenaDuelRoomObserver } from "../../logic/rooms/arenaDuel/ArenaDuelGameplay";
import { ARENA_DUEL_GAMEPLAY_ID } from "../../logic/rooms/arenaDuel/ArenaDuelGameplay";
import {
    C2S,
    GameplayModeId,
    S2C,
    validateRoomStateForMode,
    type IArenaDuelPlayerState,
} from "../../shared/index";
import { RoomClient, type GameplayRoomAdapter, type TypedGameRoom } from "../RoomClient";
import { joinGameRoom } from "./GameRoomTransport";

export type ArenaDuelTypedRoom = TypedGameRoom<typeof GameplayModeId.ArenaDuel, typeof C2S.ArenaDuelStrike>;
export type ArenaDuelRoomAdapter = GameplayRoomAdapter<typeof GameplayModeId.ArenaDuel, typeof C2S.ArenaDuelStrike>;

export function createArenaDuelRoomAdapter(): ArenaDuelRoomAdapter {
    return {
        mode: GameplayModeId.ArenaDuel,
        outbound: [C2S.ArenaDuelStrike] as const,
        validateState: (input) => validateRoomStateForMode(GameplayModeId.ArenaDuel, input),
        // 无 reconcile：strike 是幂等的 +1 意图，不需要重放。
    };
}

/** 把玩法操作绑定到**这一间**物理房（⛔ 不是全局 current room）。 */
export function createArenaDuelRoom(room: ArenaDuelTypedRoom, adapter: ArenaDuelRoomAdapter): ArenaDuelRoom {
    if (room.mode !== ARENA_DUEL_GAMEPLAY_ID || adapter.mode !== ARENA_DUEL_GAMEPLAY_ID) {
        throw new TypeError("[ArenaDuelRoom] room mode 与 adapter 不匹配");
    }
    if (!room.current) throw new Error("[ArenaDuelRoom] room 已失效");
    const isCurrent = () => room.current;
    return {
        roomId: room.roomId,
        sessionId: room.sessionId,
        get dropping() { return room.dropping; },
        strike() {
            if (isCurrent()) room.send(C2S.ArenaDuelStrike, {});
        },
        observe(observer) {
            return observeArenaDuel(room, observer, isCurrent);
        },
    };
}

export function createArenaDuelRoomJoiner(adapter: ArenaDuelRoomAdapter, client: RoomClient = RoomClient.inst): GameplayRoomJoiner<ArenaDuelRoom> {
    return {
        join(signal) {
            const ownership = joinGameRoom(client, adapter, signal);
            return {
                ready: ownership.ready.then((room) => createArenaDuelRoom(room, adapter)),
                leave: () => ownership.leave(),
            };
        },
    };
}

function observeArenaDuel(room: ArenaDuelTypedRoom, observer: ArenaDuelRoomObserver, isCurrent: () => boolean): () => void {
    const state = room.state$();
    const playerChanges = new Map<string, () => void>();
    let active = true;
    const isActive = () => active && isCurrent();
    const emitRoot = () => {
        if (!isActive()) return;
        observer.root(room.state.phase, room.state.hp, room.state.winnerId);
    };
    // shell 公共 S2C：welcome 不消费但要登记（否则 SDK 每局告警 onMessage() not registered），error 记日志。
    const offWelcome = room.onMessage(S2C.Welcome, () => undefined);
    const offError = room.onMessage(S2C.Error, (message) => {
        if (isActive()) console.warn(`[arenaDuel] 服务端错误 ${String(message.code)}: ${message.message}`);
    });
    const offRoot = state(room.state).onChange(emitRoot);
    const offAdd = state(room.state).players.onAdd((player: IArenaDuelPlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) { console.error("[ArenaDuelRoom] 旧 player change 解绑异常", error); }
        observer.addPlayer(sessionId, player.name, player.hits, sessionId === room.sessionId);
        const off = state(player).onChange(() => {
            if (isActive()) observer.changePlayer(sessionId, player.hits);
        });
        if (typeof off === "function") playerChanges.set(sessionId, off);
    });
    const offRemove = state(room.state).players.onRemove((_player: IArenaDuelPlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) { console.error("[ArenaDuelRoom] player change 解绑异常", error); }
        playerChanges.delete(sessionId);
        observer.removePlayer(sessionId);
    });
    emitRoot();
    return () => {
        if (!active) return;
        active = false;
        for (const off of [offWelcome, offError, offRoot, offAdd, offRemove, ...playerChanges.values()]) {
            if (typeof off !== "function") continue;
            try { off(); } catch (error) { console.error("[ArenaDuelRoom] Schema 解绑异常", error); }
        }
        playerChanges.clear();
    };
}
