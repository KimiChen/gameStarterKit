/**
 * GET /version —— 部署自检：两类协议身份随 shared 同源下发（§4.8：
 * gameRoomProtocol 管信封与 core wire、lobbyProtocol 管 Lobby RPC 面），
 * 灰度/热更混跑期启动时探测双端是否匹配。无鉴权。
 */
import { GAME_ROOM_PROTOCOL_VERSION, LOBBY_PROTOCOL_VERSION, PROJECT_NAME, type IVersionRes } from "@game/shared";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("Version", { method: "GET" }, async (ctx) => {
  return ctx.json({
    name: `${PROJECT_NAME}-server`,
    gameRoomProtocol: GAME_ROOM_PROTOCOL_VERSION,
    lobbyProtocol: LOBBY_PROTOCOL_VERSION,
  } satisfies IVersionRes);
});
