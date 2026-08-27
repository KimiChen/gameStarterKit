import { getToken } from "../../core/http";
import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type {
    BallMovePlayerObserver,
    BallMoveRoom,
} from "../../logic/rooms/ballMove/BallMoveGameplay";
import {
    S2C,
    type IGameRoomState,
    type IPlayerState,
    type S2CPayloadMap,
} from "../../shared/index";
import { RoomClient } from "../RoomClient";
import { getCurrentServer, getListHash } from "../serverSession";

type MessageOff = () => void;

/** Bind gameplay operations to one captured physical room, never a global current room. */
export function createBallMoveRoom(
    room: Colyseus.Room<IGameRoomState>,
    client: RoomClient = RoomClient.inst,
): BallMoveRoom {
    const isCurrent = () => client.room === room;
    const inputGeneration = client.inputGeneration;
    const onMessage = <K extends keyof S2CPayloadMap>(
        type: K,
        callback: (message: S2CPayloadMap[K]) => void,
    ): MessageOff => client.onMessage(room, type, (message) => {
            if (isCurrent()) callback(message);
        });

    return {
        roomId: room.roomId,
        sessionId: room.sessionId,
        get dropping() {
            return isCurrent() && client.dropping;
        },
        onWelcome: (callback) => onMessage(S2C.Welcome, callback),
        onPong: (callback) => onMessage(S2C.Pong, callback),
        onChat: (callback) => onMessage(S2C.Chat, callback),
        onSkillResult: (callback) => onMessage(S2C.SkillResult, callback),
        onError: (callback) => onMessage(S2C.Error, callback),
        observePlayers(observer) {
            return observePlayers(client, room, observer, isCurrent);
        },
        move(dirX, dirY) {
            if (isCurrent()) client.move(dirX, dirY);
        },
        clearMove() {
            client.clearDesiredMove(inputGeneration);
        },
        ping() {
            if (isCurrent()) client.ping();
        },
    };
}

/** Production joiner used by Main; endpoint/session lookup stays outside the shell. */
export function createBallMoveRoomJoiner(
    client: RoomClient = RoomClient.inst,
): GameplayRoomJoiner<BallMoveRoom> {
    return {
        join(signal) {
            const server = getCurrentServer();
            if (!server) throw new Error("[ballMove] 尚未选择区服，不能进入战斗");
            client.init(server.gameWsUrl);
            const ownership = client.joinGame({
                token: getToken(),
                sId: server.serverId,
                listHash: getListHash(),
            }, signal);
            return {
                ready: ownership.ready.then((room) => createBallMoveRoom(room, client)),
                leave: () => ownership.leave(),
            };
        },
    };
}

function observePlayers(
    client: RoomClient,
    room: Colyseus.Room<IGameRoomState>,
    observer: BallMovePlayerObserver,
    isCurrent: () => boolean,
): () => void {
    const state = client.state$(room);
    const playerChanges = new Map<string, () => void>();
    let active = true;
    const isActive = () => active && isCurrent();
    const offAdd = state(room.state).players.onAdd((player: IPlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) {
            console.error("[BallMoveRoom] 旧 player change 解绑异常", error);
        }
        observer.add(player, sessionId === room.sessionId);
        const off = state(player).onChange(() => {
            if (isActive()) observer.change(player);
        });
        if (typeof off === "function") playerChanges.set(sessionId, off);
    });
    const offRemove = state(room.state).players.onRemove((_player: IPlayerState, sessionId: string) => {
        if (!isActive()) return;
        try { playerChanges.get(sessionId)?.(); } catch (error) {
            console.error("[BallMoveRoom] player change 解绑异常", error);
        }
        playerChanges.delete(sessionId);
        observer.remove(sessionId);
    });
    return () => {
        if (!active) return;
        active = false;
        const errors: unknown[] = [];
        if (typeof offAdd === "function") safeCleanup(offAdd, errors);
        if (typeof offRemove === "function") safeCleanup(offRemove, errors);
        for (const off of playerChanges.values()) safeCleanup(off, errors);
        playerChanges.clear();
        if (errors.length > 0) {
            console.error("[BallMoveRoom] Schema 解绑异常（其余监听已继续释放）", errors);
        }
    };
}

function safeCleanup(cleanup: () => unknown, errors: unknown[]): void {
    try {
        cleanup();
    } catch (error) {
        errors.push(error);
    }
}
