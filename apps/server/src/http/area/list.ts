/**
 * POST /area/list —— 选服列表（登录前展示，无鉴权；`token` 可选，带上则 best-effort 回填最近登录区服 ul）。
 *
 * M12c 2f：目录（al/wsUrl/isOps/h）+ ul 组装整体迁 WebPlatform lib（DUAL_MODE §2.7 门户 = 目录）。
 * 本端点在 in-process 模式下**薄委托** `lib.areaList`；split 后客户端直连 WebPlatform `/area/list`（见 2g）。
 * ⛔ 不信客户端传的 uid/sId——token 反查在 lib 内（09·G1）。只读工具端点（HTTP 仅 auth/支付/utility）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { areaList } from "@game/webplatform/lib";

export default createEndpoint("/area/list", {
  method: "POST",
  body: z.object({ token: z.string().optional() }),
}, async (ctx) => {
  return ctx.json(await areaList(ctx.body.token ?? null));
});
