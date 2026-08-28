import type { GameplayRoomJoiner } from "../../logic/gameplay/RoomController";
import type { IdleRoom } from "../../logic/rooms/idle/IdleGameplay";
import { IDLE_GAMEPLAY_ID } from "../../logic/rooms/idle/IdleGameplay";
import { RoomClient } from "../RoomClient";
import { joinGameRoom } from "./GameRoomTransport";

/**
 * Real starter adapter for the second gameplay. It reuses the hardened raw
 * GameRoom ownership path while keeping idle separate from the BallMove room
 * adapter.
 */
export function createIdleRoomJoiner(
    client: RoomClient = RoomClient.inst,
): GameplayRoomJoiner<IdleRoom> {
    return {
        join(signal) {
            const ownership = joinGameRoom(client, IDLE_GAMEPLAY_ID, signal);
            return {
                ready: ownership.ready.then((room) => ({
                    kind: "idle" as const,
                    roomId: room.roomId,
                    sessionId: room.sessionId,
                })),
                leave: () => ownership.leave(),
            };
        },
    };
}
