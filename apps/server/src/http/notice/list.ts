/**
 * GET /notice/list —— 公告列表（登录前展示，无鉴权）。
 * 只读工具端点；starter kit 用服务端 demo 配置（catalog.ts），无需本地栈。
 */
import { createEndpoint } from "@colyseus/core";
import type { INoticeListRes } from "@game/shared";
import { listNotices } from "./catalog";

export default createEndpoint("/notice/list", { method: "GET" }, async (ctx) => {
  return ctx.json({ list: listNotices() } satisfies INoticeListRes);
});
