/**
 * arenaCapture 的 transport 适配：adapter（mode/outbound/validateState）+ 绑定到一间物理房的 ArenaCaptureRoom 端口 + joiner。
 * 只消费框架的 RoomClient 类型与 joinGameRoom，⛔ 不改 GameRoomTransport.ts（kit 玩法与插件玩法同一约束）。
 */
import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type { ArenaCaptureRoom, ArenaCaptureRoomObserver } from "../../logic/rooms/arenaCapture/ArenaCaptureGameplay";
import { ARENA_CAPTURE_GAMEPLAY_ID } from "../../logic/rooms/arenaCapture/ArenaCaptureGameplay";
import {
    C2S,
    GameplayModeId,
    S2C,
    validateRoomStateForMode,
    type IArenaCapturePlayerState,
} from "../../shared/index";
import { RoomClient, type GameplayRoomAdapter, type TypedGameRoom } from "../RoomClient";
import { joinGameRoom } from "./GameRoomTransport";

export type ArenaCaptureTypedRoom = TypedGameRoom<typeof GameplayModeId.ArenaCapture, typeof C2S.ArenaCaptureCapture>;
export type ArenaCaptureRoomAdapter = GameplayRoomAdapter<typeof GameplayModeId.ArenaCapture, typeof C2S.ArenaCaptureCapture>;

export function createArenaCaptureRoomAdapter(): ArenaCaptureRoomAdapter {
    return {
        mode: GameplayModeId.ArenaCapture,
        outbound: [C2S.ArenaCaptureCapture] as const,
        validateState: (input) => validateRoomStateForMode(GameplayModeId.ArenaCapture, input),
        // 无 reconcile：capture 是幂等的 +1 意图，不需要重放。
    };
}

/** 把玩法操作绑定到**这一间**物理房（⛔ 不是全局 current room）。 */
export function createArenaCaptureRoom(room: ArenaCaptureTypedRoom, adapter: ArenaCaptureRoomAdapter): ArenaCaptureRoom {
    if (room.mode !== ARENA_CAPTURE_GAMEPLAY_ID || adapter.mode !== ARENA_CAPTURE_GAMEPLAY_ID) {
        throw new TypeError("[ArenaCaptureRoom] room mode 与 adapter 不匹配");
    }
    if (!room.current) throw new Error("[ArenaCaptureRoom] room 已失效");
    const isCurrent = () => room.current;
    return {
        roomId: room.roomId,
        sessionId: room.sessionId,
        get dropping() { return room.dropping; },
        capture() {
            if (isCurrent()) room.send(C2S.ArenaCaptureCapture, {});
        },
        observe(observer) {
            return observeArenaCapture(room, observer, isCurrent);
        },
    };
}

export function createArenaCaptureRoomJoiner(
    adapter: ArenaCaptureRoomAdapter, client: RoomClient = RoomClient.inst,
): GameplayRoomJoiner<ArenaCaptureRoom> {
    return {
        join(signal) {
            const ownership = joinGameRoom(client, adapter, signal);
            return {
                ready: ownership.ready.then((room) => createArenaCaptureRoom(room, adapter)),
                leave: () => ownership.leave(),
            };
        },
    };
}

function observeArenaCapture(room: ArenaCaptureTypedRoom, observer: ArenaCaptureRoomObserver, isCurrent: () => boolean): () => void {
    const state = room.state$();
    const playerChanges = new Map<string, () => void>();
    let active = true;
    const isActive = () => active && isCurrent();
    const emitRoot = () => {
        if (!isActive()) return;
        observer.root(room.state.phase, room.state.captureGoal, room.state.winnerId);
    };
    // shell 公共 S2C：welcome 不消费但要登记（否则 SDK 每局告警 onMessage() not registered），error 记日志。
    const offWelcome = room.onMessage(S2C.Welcome, () => undefined);
    const offError = room.onMessage(S2C.Error, (message) => {
        if (isActive()) console.warn(`[arenaCapture] 服务端错误 ${String(message.code)}: ${message.message}`);
    });
    const offRoot = state(room.state).onChange(emitRoot);
    const offAdd = state(room.state).players.onAdd((player: IArenaCapturePlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) { console.error("[ArenaCaptureRoom] 旧 player change 解绑异常", error); }
        observer.addPlayer(sessionId, player.name, player.captures, sessionId === room.sessionId);
        const off = state(player).onChange(() => {
            if (isActive()) observer.changePlayer(sessionId, player.captures);
        });
        if (typeof off === "function") playerChanges.set(sessionId, off);
    });
    const offRemove = state(room.state).players.onRemove((_player: IArenaCapturePlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) { console.error("[ArenaCaptureRoom] player change 解绑异常", error); }
        playerChanges.delete(sessionId);
        observer.removePlayer(sessionId);
    });
    emitRoot();
    return () => {
        if (!active) return;
        active = false;
        for (const off of [offWelcome, offError, offRoot, offAdd, offRemove, ...playerChanges.values()]) {
            if (typeof off !== "function") continue;
            try { off(); } catch (error) { console.error("[ArenaCaptureRoom] Schema 解绑异常", error); }
        }
        playerChanges.clear();
    };
}
