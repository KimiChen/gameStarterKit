/**
 * GET /clock/now —— 服务端权威时钟（无鉴权）：每日奖励/跨天判定/体力恢复展示的对时真源，防改本地时钟。
 */
import { createEndpoint } from "@colyseus/core";
import type { IClockNowRes } from "@game/shared";

export default createEndpoint("/clock/now", { method: "GET" }, async (ctx) => {
  return ctx.json({ serverTime: Date.now() } satisfies IClockNowRes);
});
