/**
 * GET /area/list —— 选服列表（登录前展示，无鉴权；`token` 可选，带上则回填最近登录区服）。
 *
 * 只读工具端点（docs/SERVER.md 通道分工：HTTP 仅 auth/支付/utility）。starter kit 用服务端
 * demo 配置（catalog.ts），无需本地栈；真实实现从配置表 + 用户登录历史读。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import type { IAreaListRes } from "@game/shared";
import { AREA_DEMO_UL, AREA_IS_OPS, AREA_SERVERS, areaListHash, getUserRecentServers } from "./catalog";
import { uidFromToken } from "../common";

export default createEndpoint("/area/list", {
  method: "POST",
  body: z.object({ token: z.string().optional() }),
}, async (ctx) => {
  // token 可选：匿名请求 ul 为空；带 token 反查 uid 后回填最近登录区服（09·G1）
  let ul: number[] = [];
  if (ctx.body.token) {
    const uid = await uidFromToken(ctx.body.token);
    if (uid) { ul = await getUserRecentServers(uid); }
  }
  // demo 回落：mock 登录 token 过不了 verifyBearer，AREA_DEMO_UL 开时仍给「我的」页签内容
  if (ul.length === 0 && AREA_DEMO_UL) { ul = await getUserRecentServers("demo"); }
  return ctx.json({ isOps: AREA_IS_OPS, al: [...AREA_SERVERS], ul, h: areaListHash() } satisfies IAreaListRes);
});
