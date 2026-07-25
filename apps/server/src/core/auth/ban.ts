/**
 * 封号 / 强制下线的**编排**（DUAL_MODE §2.3 封号 SOP，M12d）。
 *
 * 两步、都必做：
 *  ① **写权威**（`account.ban/revoke` 走接缝：in-process 直调 lib、split 走 HTTP → WebPlatform）
 *     —— 一条 UPDATE：`status=1` / `token_hash=NULL` = **下次登不上**；
 *  ② **踢在线** —— 本节点即时 + 控制总线广播其它节点（`kickBus`，**在本组发起：游戏服持 coord Redis**；
 *     WebPlatform 刻意不广播，见 WEBPLATFORM.md §5）。
 *
 * ⚠ ②（本模块的广播）是 **best-effort、无 ack**：封号的**送达保证**来自 GM 工具逐节点
 * `POST /admin/kick` 并按 ack 确认（规则 09·G7b）。⛔ 缺那一步，在场连接可存活至 sess TTL（3d）
 * 且无自动收敛——快路径是纯缓存 hash 比对、零权威回源。
 *
 * ⚠ 本模块**不删 `sess:{uid}`**（TTL 自然过期）、⛔ 绝不删 `user:{uid}`（09·G7）。
 */
import { ForceLogoutReason } from "@game/shared";
import { account } from "../../platform/accountClient";
import { auditLogin } from "./session";
import { broadcastKick, kickLocal } from "./kickBus";

/** 封号（账号级，所有区）：写权威 → 踢在线，逼其重走登录被 status 拦。 */
export async function banUser(uid: string, reason: string): Promise<void> {
  const hit = await account.ban(uid); // ① 权威：status=1 + token_hash=NULL（下次登不上）
  if (hit) {
    kickLocal(uid, ForceLogoutReason.Banned);           // ② 本节点在线即时踢（先推 reason 再关）
    await broadcastKick(uid, ForceLogoutReason.Banned); // ② 其它组/节点自筛踢（best-effort）
  }
  await auditLogin("ban", uid, reason, null, null);
}

/** 强制下线/换端：权威 `token_hash=NULL`（status 不变，可重新登录换发）→ 踢在线。 */
export async function revokeSessions(uid: string, reason: string): Promise<void> {
  const hit = await account.revoke(uid);
  if (hit) {
    kickLocal(uid, ForceLogoutReason.Revoked);
    await broadcastKick(uid, ForceLogoutReason.Revoked);
  }
  await auditLogin("revoke", uid, reason, null, null);
}
