/**
 * **踢人通道**（kick bus，DUAL_MODE §2.3 / M12d）。⚠ 本文件只负责「把在线连接踢下线」这一件事——
 * 撤销的**权威**在 `accounts.status/token_hash`（WebPlatform lib 写，见 core/auth/ban.ts 的编排）。
 *
 * **封号语义 = 账号级「下次登不上」**：权威真相是 `accounts.status=1` + `token_hash=NULL`（一条 UPDATE），
 * 由 WebPlatform lib 写。本模块只负责第二件事——**把在线连接踢下线，逼其重走登录流程**。
 *
 * 传输：**本组** coord Redis 的 `stream:kick`（组内跨节点通道；每节点独立游标 XREAD，⛔ 非 Pub/Sub）。
 * ⚠ coord 按组独占（DUAL_MODE §4.2）⇒ 扇出半径**只到组内**；跨组的撤销送达同样落在 GM 的逐节点 `/admin/kick` 上。
 * 事件只有 `{uid}`——**没有 epoch、没有 outbox**：踢是 **best-effort**，丢了不影响正确性，因为
 *   ① 新建连接 onAuth strict 回权威 verify 即拒；② 重新登录 SELECT status 即拒；
 *   ③ 发钱由结算 recheck 兜（U6）。
 * ⚠ 本通道是**程序化封号的便捷扇出，不构成保证**（fire-and-forget、无 ack）：封号 SOP 要求 GM 工具
 * 直连各节点 `/admin/kick` 并按 ack 确认送达（§2.3）。⛔ 缺踢则在场连接可存活至 sess TTL（3d，无自动收敛）。
 */
import { ForceLogoutReason, type ForceLogoutReasonType } from "@game/shared";
import { KICK_STREAM_TRIM_MS } from "../infra/config";
import { K_STREAM_KICK } from "../infra/keys";
import { coordClient } from "../infra/redisRoute";
import { fieldOf, startStreamConsumer, type StreamConsumer } from "../infra/streamConsumer";

// 自筛踢句柄：websocket 层（online 表）在启动期注入 kickUser（core/auth ⛔ 不反向依赖 websocket 层）。
let kickHandler: ((uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string) => void) | null = null;
/** 注入本节点强制下线句柄（index.ts 启动期挂 push.kickUser）。 */
export function setKickHandler(fn: (uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string) => void): void { kickHandler = fn; }

/** 本节点自筛踢：命中本节点在线连接即强制下线（先推 reason 再关）；不在本节点直接跳过（§2.3 每节点自筛，⛔ 不查 presence）。 */
export function kickLocal(uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string): void {
  kickHandler?.(uid, reason, exceptTokenHash);
}

/** 广播踢人到控制总线（best-effort：Redis 抖动只是漏踢；权威撤销已落 MySQL，送达保证走 GM `/admin/kick`）。 */
export async function broadcastKick(uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string): Promise<void> {
  try {
    await coordClient().xadd(K_STREAM_KICK, "*", "uid", uid, "reason", reason,
      // 顶号判别位（可选）：消费侧据此跳过持新登录态的连接，⛔ 防迟到投递自踢
      ...(exceptTokenHash !== undefined ? ["exceptHash", exceptTokenHash] : []));
  } catch (e) {
    console.error(`[kick] 广播失败 uid=${uid}（权威已落库；GM 工具的 /admin/kick 才是保证送达的那一步）`, e);
  }
}

let consumer: StreamConsumer | null = null;
/** 控制总线消费（每节点一个，独立游标）：读 stream:kick → 本节点在线即踢。 */
export function startKickConsumer(): void {
  if (consumer) { return; }
  consumer = startStreamConsumer("kick", coordClient, K_STREAM_KICK, (fields) => {
    const uid = fieldOf(fields, "uid");
    // reason 缺省按封号（兼容旧条目/别的发布端只带 uid 的情况）
    // reason 缺省/非法一律按封号兜底（兼容旧条目、别的发布端只带 uid；⛔ 不裸 cast 未校验值）
    const raw = fieldOf(fields, "reason");
    const reason = (Object.values(ForceLogoutReason) as string[]).includes(raw ?? "")
      ? raw as ForceLogoutReasonType : ForceLogoutReason.Banned;
    if (uid) { kickLocal(uid, reason, fieldOf(fields, "exceptHash")); }
  }, { trimMs: KICK_STREAM_TRIM_MS });
}
export function stopKickConsumer(): void { consumer?.stop(); consumer = null; }
