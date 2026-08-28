/**
 * GET /clock/now —— 服务端权威时钟（无鉴权）：每日奖励/跨天判定/体力恢复展示的对时真源，防改本地时钟。
 */
import { type IClockNowRes } from "@game/shared";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("ClockNow", { method: "GET" }, async (ctx) => {
  return ctx.json({ serverTime: Date.now() } satisfies IClockNowRes);
});
