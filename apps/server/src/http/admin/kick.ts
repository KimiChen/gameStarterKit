/**
 * POST /admin/kick —— **GM 内部端点**：踢掉本节点上该 uid 的在线连接，并回报是否命中（M12d §2.3 封号 SOP 第二步）。
 *
 * 封号是**两步都必做**的操作：① WebPlatform 写权威（status=1 + token_hash=NULL）；② GM 工具**逐节点**调本端点、
 * 按 `kicked` 确认送达（不命中的节点返回 `kicked:false` 属正常——用户只连在一个节点）。⛔ 缺第二步，
 * 被封用户的在场连接可存活至 sess TTL（3d）且无自动收敛：快路径是纯缓存比对、不回权威。
 *
 * ⚠ 幂等、可重试：重复踢同一 uid 无害（不在线即 no-op）。⚠ 节点不可达通常无害——**节点挂了其上连接也没了**；
 * 真正危险的是「节点活着在服务玩家、但 GM 够不到它」，故 GM 工具必须重试并对最终失败告警。
 * ⚠ 鉴权走共享密钥头（同 pay/wxNotify 范式）；**未配置 `ADMIN_API_SECRET` 即端点关闭**（fail-closed）。
 */
import { createEndpoint } from "@colyseus/core";
import { z } from "zod";
import { ForceLogoutReason, type ForceLogoutReasonType, type RpcErrCode } from "@game/shared";
import { ADMIN_API_SECRET } from "../../core/infra/config";
import { safeSecretEqual } from "../../core/auth/session";
import { kickUser } from "../../websocket/push";

export default createEndpoint("/admin/kick", {
  method: "POST",
  // reason 决定客户端提示文案与关闭码（缺省 banned = GM 封号 SOP 的主用途）
  body: z.object({
    uid: z.string().min(1).max(32),
    reason: z.enum([ForceLogoutReason.Banned, ForceLogoutReason.Revoked]).optional(),
  }),
}, async (ctx) => {
  const secret = ADMIN_API_SECRET();
  if (!safeSecretEqual(ctx.headers?.get?.("x-admin-secret"), secret)) { // 恒时；未配 secret 即拒（fail-closed）
    throw ctx.error(401, { error: "AUTH_REQUIRED" satisfies RpcErrCode });
  }
  // 只踢本节点（online 表自筛）；GM 遍历全部节点即达成「全网踢干净」并可据 kicked 汇总确认。
  const reason = (ctx.body.reason ?? ForceLogoutReason.Banned) as ForceLogoutReasonType;
  // ⚠ **刻意不带 sId** ⇒ 踢该 uid 在本节点的**全部区**。封号/强制下线是**账号级**的
  // （"这个人不能玩"，⛔ 不是"不能玩这个区"）；按区只适用于顶号（M12e），那条走 stream:kick。
  return { kicked: kickUser(ctx.body.uid, reason) };
});
