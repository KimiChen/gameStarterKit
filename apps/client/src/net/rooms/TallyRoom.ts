/**
 * tally 的 transport 适配：adapter（mode/outbound/validateState）+ 绑定到一间物理房的 TallyRoom 端口 + joiner。
 * 只消费框架的 RoomClient 类型与 joinGameRoom，⛔ 不改 GameRoomTransport.ts（插件形态的约束）。
 */
import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type { TallyRoom, TallyRoomObserver } from "../../logic/rooms/tally/TallyGameplay";
import { TALLY_GAMEPLAY_ID } from "../../logic/rooms/tally/TallyGameplay";
import {
    C2S,
    GameplayModeId,
    S2C,
    validateRoomStateForMode,
    type ITallyPlayerState,
} from "../../shared/index";
import { RoomClient, type GameplayRoomAdapter, type TypedGameRoom } from "../RoomClient";
import { joinGameRoom } from "./GameRoomTransport";

export type TallyTypedRoom = TypedGameRoom<typeof GameplayModeId.Tally, typeof C2S.TallyTap>;
export type TallyRoomAdapter = GameplayRoomAdapter<typeof GameplayModeId.Tally, typeof C2S.TallyTap>;

export function createTallyRoomAdapter(): TallyRoomAdapter {
    return {
        mode: GameplayModeId.Tally,
        outbound: [C2S.TallyTap] as const,
        validateState: (input) => validateRoomStateForMode(GameplayModeId.Tally, input),
        // 无 reconcile：tap 是幂等的 +1 意图，不需要重放。
    };
}

/** 把玩法操作绑定到**这一间**物理房（⛔ 不是全局 current room）。 */
export function createTallyRoom(room: TallyTypedRoom, adapter: TallyRoomAdapter): TallyRoom {
    if (room.mode !== TALLY_GAMEPLAY_ID || adapter.mode !== TALLY_GAMEPLAY_ID) {
        throw new TypeError("[TallyRoom] room mode 与 adapter 不匹配");
    }
    if (!room.current) throw new Error("[TallyRoom] room 已失效");
    const isCurrent = () => room.current;
    return {
        roomId: room.roomId,
        sessionId: room.sessionId,
        get dropping() { return room.dropping; },
        tap() {
            if (isCurrent()) room.send(C2S.TallyTap, {});
        },
        observe(observer) {
            return observeTally(room, observer, isCurrent);
        },
    };
}

export function createTallyRoomJoiner(adapter: TallyRoomAdapter, client: RoomClient = RoomClient.inst): GameplayRoomJoiner<TallyRoom> {
    return {
        join(signal) {
            const ownership = joinGameRoom(client, adapter, signal);
            return {
                ready: ownership.ready.then((room) => createTallyRoom(room, adapter)),
                leave: () => ownership.leave(),
            };
        },
    };
}

function observeTally(room: TallyTypedRoom, observer: TallyRoomObserver, isCurrent: () => boolean): () => void {
    const state = room.state$();
    const playerChanges = new Map<string, () => void>();
    let active = true;
    const isActive = () => active && isCurrent();
    const emitRoot = () => {
        if (!isActive()) return;
        observer.root(room.state.phase, room.state.tapGoal, room.state.winnerId);
    };
    // shell 公共 S2C：welcome 不消费但要登记（否则 SDK 每局告警 onMessage() not registered），error 记日志。
    const offWelcome = room.onMessage(S2C.Welcome, () => undefined);
    const offError = room.onMessage(S2C.Error, (message) => {
        if (isActive()) console.warn(`[tally] 服务端错误 ${String(message.code)}: ${message.message}`);
    });
    const offRoot = state(room.state).onChange(emitRoot);
    const offAdd = state(room.state).players.onAdd((player: ITallyPlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) { console.error("[TallyRoom] 旧 player change 解绑异常", error); }
        observer.addPlayer(sessionId, player.name, player.taps, sessionId === room.sessionId);
        const off = state(player).onChange(() => {
            if (isActive()) observer.changePlayer(sessionId, player.taps);
        });
        if (typeof off === "function") playerChanges.set(sessionId, off);
    });
    const offRemove = state(room.state).players.onRemove((_player: ITallyPlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) { console.error("[TallyRoom] player change 解绑异常", error); }
        playerChanges.delete(sessionId);
        observer.removePlayer(sessionId);
    });
    emitRoot();
    return () => {
        if (!active) return;
        active = false;
        for (const off of [offWelcome, offError, offRoot, offAdd, offRemove, ...playerChanges.values()]) {
            if (typeof off !== "function") continue;
            try { off(); } catch (error) { console.error("[TallyRoom] Schema 解绑异常", error); }
        }
        playerChanges.clear();
    };
}
