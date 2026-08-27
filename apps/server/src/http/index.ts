/**
 * 真实 HTTP 端点装配（Colyseus 0.17 createRouter，better-call）。
 *
 * 新增端点：建 `<域>/<接口>.ts`（default 导出 createEndpoint 产物）→ 在此 import + 表里加一行。
 * ⚠ typed router 优先于 express：路径撞车时 express 侧（`/monitor`、playground）永远打不到，
 * 新增端点前先确认路径不与它们冲突。（mock 层已随「去 mock」移除，仓库当前没有 `src/mock`。）
 *
 * ⚠ 登录与选服属于独立 WebPlatform Public API，不在游戏服挂兼容代理。
 */
import { createRouter } from "@colyseus/core";
import version from "./misc/version";
import clockNow from "./misc/clockNow";
import healthz from "./misc/healthz";
import wxPayNotify from "./pay/wxNotify";
import noticeList from "./notice/list";
import adminKick from "./admin/kick";

export const routes = createRouter({
  version, clockNow, healthz, wxPayNotify, noticeList, adminKick,
});
