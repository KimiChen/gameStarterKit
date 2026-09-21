import { defineRoom, defineServer } from "colyseus";
import { RoomName } from "@game/shared";
import { LobbyRoom } from "./websocket/LobbyRoom";
import { processServerOptions } from "./process.config";

export const lobbyRooms = { [RoomName.Lobby]: defineRoom(LobbyRoom) };

/** 调用工厂时才创建 transport / Server，且只登记大厅。 */
export function createLobbyServer() {
    return defineServer({ ...processServerOptions(), rooms: lobbyRooms });
}
