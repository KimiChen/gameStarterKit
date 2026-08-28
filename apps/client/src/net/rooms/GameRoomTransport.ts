import { getToken } from "../../core/http";
import type { GameplayModeIdType } from "../../shared/index";
import { RoomClient, type GameRoomOwnership } from "../RoomClient";
import { getCurrentGameWsUrl, getCurrentServer } from "../serverSession";

/** Join one raw GameRoom with an explicit matchmaking mode. */
export function joinGameRoom(
    client: RoomClient,
    mode: GameplayModeIdType,
    signal: AbortSignal,
): GameRoomOwnership {
    const server = getCurrentServer();
    if (!server) throw new Error("[GameRoom] 尚未选择区服，不能进入玩法");
    client.init(getCurrentGameWsUrl());
    return client.joinGame({
        token: getToken(),
        sId: server.serverId,
        mode,
    }, signal);
}
