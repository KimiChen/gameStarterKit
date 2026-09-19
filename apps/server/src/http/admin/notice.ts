/**
 * POST /admin/notice —— **GM 内部端点**：向 `sId` 全区在线连接推送 `server.notice{text}`（MMO MF6a-B5，
 * §6.7「消费方先于升格」：ServerNotice 是投递总线 realm 寻址的第二消费方——此前 `pushToAll` 预留无调用方）。
 *
 * - 经 core/push 的 `publishPush(kind=realm)`（⛔ 不本地直投）：本节点与其它节点各自消费、按本地在线表落地，
 *   GM 只需调**任一**节点（与 /admin/kick 的「逐节点」不同：踢人靠本地在线表自筛，公告靠总线扇出）。
 * - `published` = 已进入总线（XADD 成功）；到达与否 best-effort（提示语义）。
 * - 鉴权走共享密钥头（同 /admin/kick）；**未配置 `ADMIN_API_SECRET` 即端点关闭**（fail-closed）。
 */
import { LobbyPush, type RpcErrCode } from "@game/shared";
import { ADMIN_API_SECRET } from "../../core/infra/config";
import { safeSecretEqual } from "../../core/auth/session";
import { publishPush } from "../../core/push/pushBus";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("AdminNotice", {
  method: "POST",
}, async (ctx) => {
  const secret = ADMIN_API_SECRET();
  if (!safeSecretEqual(ctx.headers?.get?.("x-admin-secret"), secret)) { // 恒时；未配 secret 即拒（fail-closed）
    throw ctx.error(401, { error: "AUTH_REQUIRED" satisfies RpcErrCode });
  }
  const published = await publishPush({ kind: "realm", sId: ctx.body.sId, type: LobbyPush.ServerNotice, data: { text: ctx.body.text } });
  return { published: published > 0 };
});
