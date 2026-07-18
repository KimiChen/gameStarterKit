/**
 * GET /version —— 部署自检：协议版本随 shared 同源下发，灰度/热更混跑期
 * 客户端启动时探测双端是否匹配。无鉴权。
 */
import { createEndpoint } from "@colyseus/core";
import { PROTOCOL_VERSION, type IVersionRes } from "@game/shared";

export default createEndpoint("/version", { method: "GET" }, async (ctx) => {
  return ctx.json({ name: "game-server", protocol: PROTOCOL_VERSION } satisfies IVersionRes);
});
