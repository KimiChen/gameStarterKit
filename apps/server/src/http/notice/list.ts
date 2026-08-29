/**
 * GET /notice/list —— 公告列表（登录前展示，无鉴权）。
 * 只读工具端点；starter kit 用服务端 demo 配置（_support/noticeCatalog.ts），无需本地栈。
 */
import { type INoticeListRes } from "@game/shared";
import { listNotices } from "../_support/noticeCatalog";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("NoticeList", { method: "GET" }, async (ctx) => {
  return ctx.json({ list: listNotices() } satisfies INoticeListRes);
});
