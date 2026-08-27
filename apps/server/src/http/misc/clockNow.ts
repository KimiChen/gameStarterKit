/**
 * GET /clock/now —— 服务端权威时钟（无鉴权）：每日奖励/跨天判定/体力恢复展示的对时真源，防改本地时钟。
 */
import { createEndpoint } from "@colyseus/core";
import { ApiPath, type IClockNowRes } from "@game/shared";

export default createEndpoint(ApiPath.ClockNow, { method: "GET" }, async (ctx) => {
  return ctx.json({ serverTime: Date.now() } satisfies IClockNowRes);
});
