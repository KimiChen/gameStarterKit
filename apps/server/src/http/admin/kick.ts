/**
 * POST /admin/kick —— **GM 内部端点**：踢掉本节点上该 uid 的在线连接，并回报是否命中（M12d §2.3 封号 SOP 第二步）。
 *
 * 封号是**两步都必做**的操作：① WebPlatform 事务写 `accounts.status=1`、删除全部
 * `account_sessions` 并记审计；② GM 工具**逐节点**调本端点、
 * 按 `kicked` 确认送达（不命中的节点返回 `kicked:false` 属正常——用户只连在一个节点）。⛔ 缺第二步，
 * 被封用户的在场连接可存活至 sess TTL（3d）且无自动收敛：快路径是纯缓存比对、不回权威。
 *
 * ⚠ 幂等、可重试：重复踢同一 uid 无害（不在线即 no-op）。⚠ 节点不可达通常无害——**节点挂了其上连接也没了**；
 * 真正危险的是「节点活着在服务玩家、但 GM 够不到它」，故 GM 工具必须重试并对最终失败告警。
 * ⚠ 鉴权走共享密钥头（同 pay/wxNotify 范式）；**未配置 `ADMIN_API_SECRET` 即端点关闭**（fail-closed）。
 * ⚠ 撤销覆盖 persona（MMO MF2-B5）：踢之前先抬高该 uid **全部区** persona 的 `session_generation`（权威写）；
 *   抬代失败 ⇒ 抛出（500）且**不踢**，GM 按 SOP 重试本节点即同时补抬 + 补踢（每节点各抬一次，+N 与 +1 等价）。
 */
import { ForceLogoutReason, type ForceLogoutReasonType, type RpcErrCode } from "@game/shared";
import { ADMIN_API_SECRET } from "../../core/infra/config";
import { safeSecretEqual } from "../../core/auth/session";
import { revokePersonaSessions } from "../../core/auth/kickBus";
import { kickUser } from "../../websocket/push";
import { createGameEndpoint } from "../contract";

export default createGameEndpoint("AdminKick", {
  method: "POST",
}, async (ctx) => {
  const secret = ADMIN_API_SECRET();
  if (!safeSecretEqual(ctx.headers?.get?.("x-admin-secret"), secret)) { // 恒时；未配 secret 即拒（fail-closed）
    throw ctx.error(401, { error: "AUTH_REQUIRED" satisfies RpcErrCode });
  }
  // 只踢本节点（online 表自筛）；GM 遍历全部节点即达成「全网踢干净」并可据 kicked 汇总确认。
  const reason = (ctx.body.reason ?? ForceLogoutReason.Banned) as ForceLogoutReasonType;
  // 先写权威（persona 会话代）、再处理在连——与「先写账号权威，再踢」同序；失败即 500、⛔ 不踢（GM 重试）。
  await revokePersonaSessions(ctx.body.uid);
  // ⚠ **刻意不带 sId** ⇒ 踢该 uid 在本节点的**全部区**。封号/强制下线是**账号级**的
  // （"这个人不能玩"，⛔ 不是"不能玩这个区"）；按区只适用于顶号（M12e），那条走 stream:kick。
  return { kicked: kickUser(ctx.body.uid, reason) };
});
