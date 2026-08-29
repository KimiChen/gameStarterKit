import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type { IdleRoom } from "../../logic/rooms/idle/IdleGameplay";
import { IDLE_GAMEPLAY_ID } from "../../logic/rooms/idle/IdleGameplay";
import { C2S } from "../../shared/index";
import { RoomClient } from "../RoomClient";
import {
    joinGameRoom,
    type IdleRoomAdapter,
    type IdleTypedRoom,
} from "./GameRoomTransport";

export function createIdleRoom(room: IdleTypedRoom, adapter: IdleRoomAdapter): IdleRoom {
    if (room.mode !== IDLE_GAMEPLAY_ID || adapter.mode !== IDLE_GAMEPLAY_ID) {
        throw new TypeError("[IdleRoom] room mode 与 adapter 不匹配");
    }
    if (!room.current) throw new Error("[IdleRoom] room 已失效");
    return {
        kind: "idle",
        roomId: room.roomId,
        sessionId: room.sessionId,
        pulse() {
            if (room.current) room.send(C2S.IdlePulse, {});
        },
    };
}

/**
 * Real starter adapter for the second gameplay. It reuses the hardened raw
 * GameRoom ownership path while keeping idle separate from the BallMove room
 * adapter.
 */
export function createIdleRoomJoiner(
    adapter: IdleRoomAdapter,
    client: RoomClient = RoomClient.inst,
): GameplayRoomJoiner<IdleRoom> {
    return {
        join(signal) {
            const ownership = joinGameRoom(client, adapter, signal);
            return {
                ready: ownership.ready.then((room) => createIdleRoom(room, adapter)),
                leave: () => ownership.leave(),
            };
        },
    };
}
