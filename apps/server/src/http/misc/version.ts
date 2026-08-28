/**
 * GET /version —— 部署自检：协议版本随 shared 同源下发，灰度/热更混跑期
 * 客户端启动时探测双端是否匹配。无鉴权。
 */
import { PROJECT_NAME, PROTOCOL_VERSION, type IVersionRes } from "@game/shared";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("Version", { method: "GET" }, async (ctx) => {
  return ctx.json({ name: `${PROJECT_NAME}-server`, protocol: PROTOCOL_VERSION } satisfies IVersionRes);
});
