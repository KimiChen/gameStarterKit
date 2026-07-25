/**
 * POST /area/list —— 选服列表（登录前展示，无鉴权；`token` 可选，带上则 best-effort 回填最近登录区服 ul）。
 *
 * M12c 2f：目录（al/wsUrl/isOps/h）+ ul 组装整体迁 WebPlatform lib（DUAL_MODE §2.7 门户 = 目录）。
 * 本端点**薄委托** `account.areaList`（接缝：in-process 直调 lib、split 走 HTTP）；split 后客户端直连 WebPlatform `/area/list`（见 2g）。
 * ⛔ 不信客户端传的 uid/sId——token 反查在 lib 内（09·G1）。只读工具端点（HTTP 仅 auth/支付/utility）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { account } from "../../platform/accountClient";

export default createEndpoint("/area/list", {
  method: "POST",
  body: z.object({ token: z.string().optional() }),
}, async (ctx) => {
  return ctx.json(await account.areaList(ctx.body.token ?? null));
});
