/**
 * 真实 HTTP 端点装配（Colyseus 0.17 createRouter，better-call）。
 *
 * 新增端点：建 `<域>/<接口>.ts`（default 导出 createEndpoint 产物）→ 在此 import + 表里加一行。
 * `/mock/*` 假数据接口在 src/mock（前缀隔离）。⚠ typed router 优先于 express（mock/面板）：
 * 路径撞车时 express 侧永远打不到——真实端点与 mock 前缀不得混用。
 *
 * ⚠ 本组端点依赖本地栈（Redis + MySQL，`npm --workspace @game/server run stack`）
 *   与微信凭证（WX_APPID / WX_SECRET 环境变量）；纯 mock 联调不受影响。
 */
import { createRouter } from "@colyseus/core";
import version from "./misc/version";
import clockNow from "./misc/clockNow";
import healthz from "./misc/healthz";
import wxLogin from "./account/wxLogin";
import devLogin from "./account/devLogin";
import wxPayNotify from "./pay/wxNotify";
import areaList from "./area/list";
import noticeList from "./notice/list";

export const routes = createRouter({
  version, clockNow, healthz, wxLogin, devLogin, wxPayNotify, areaList, noticeList,
});
