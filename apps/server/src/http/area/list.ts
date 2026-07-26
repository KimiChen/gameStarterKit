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
  // ⚠ 本端点的契约是 **best-effort ⛔不抛**（登录前无鉴权展示，token 只用于回填 ul）。
  // split 侧（WebPlatform index.ts）对**任何非串**一律收敛成 null 照常返回目录；此处若用
  // `z.string().optional()`/`.nullish()`，`null` 之外的非串（`123`/`false`/`[]`/`{}`）仍会 400
  // ⇒ 同一请求体一边 200 一边 400，正是要消灭的「两模式入参语义不同」。故收 `unknown` 后
  // **就地收敛**，判据与 split 侧逐字同形。⛔ 别改回 z.string()：那是把分叉又装回来。
  // ⚠ `.optional()` 不能省：本版 zod 下裸 `z.unknown()` 仍要求**键存在**，匿名请求体 `{}` 会被 400
  //（正是最常见的那个调用形态）。
  body: z.object({ token: z.unknown().optional() }),
}, async (ctx) => {
  const token = typeof ctx.body.token === "string" ? ctx.body.token : null;
  return ctx.json(await account.areaList(token));
});
