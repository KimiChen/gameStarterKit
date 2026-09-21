import { defineRoom, defineServer } from "colyseus";
import { RoomName } from "@game/shared";
import { GameRoom } from "./rooms/GameRoom";
import { assertRoomProfilesConfigured } from "./rooms/core/RoomProfile";
import { registerDefaultGameModes } from "./rooms/modes/catalog";
import { processServerOptions } from "./process.config";

export function registerGameRuntime(): void {
    registerDefaultGameModes();
    assertRoomProfilesConfigured();
}

// 同区、同 mode、同 profile 才能匹配；缺失字段由 join 信封校验拒绝。
// 邀请码房 setPrivate(true)，不进入普通匹配，roomCode 不作为 filter / metadata。
export const gameRooms = { [RoomName.Game]: defineRoom(GameRoom).filterBy(["sId", "mode", "profile"]) };

export function createGameServer() {
    registerGameRuntime();
    return defineServer({ ...processServerOptions(), rooms: gameRooms });
}
