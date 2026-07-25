/**
 * 撤销「踢在线」通道（DUAL_MODE §2.3，M12d 简化模型）。
 *
 * **封号语义 = 账号级「下次登不上」**：权威真相是 `accounts.status=1` + `token_hash=NULL`（一条 UPDATE），
 * 由 WebPlatform lib 写。本模块只负责第二件事——**把在线连接踢下线，逼其重走登录流程**。
 *
 * 传输：coord Redis 的 `stream:kick`（唯一合法跨组通道；每节点独立游标 XREAD，⛔ 非 Pub/Sub）。
 * 事件只有 `{uid}`——**没有 epoch、没有 outbox**：踢是 **best-effort**，丢了不影响正确性，因为
 *   ① 新建连接 onAuth strict 回权威 verify 即拒；② 重新登录 SELECT status 即拒；
 *   ③ 在连漏踢由快路径 `verifiedAt`（AUTH_REVERIFY_TTL_S=60s）回权威兜底；④ 发钱由结算 recheck 兜（U6）。
 * 四层里只有本通道依赖广播，故 ⛔ 不需要「可证明零漏发」的 outbox/relayer。
 */
import { KICK_STREAM_TRIM_MS } from "../infra/config";
import { K_STREAM_KICK } from "../infra/keys";
import { coordClient } from "../infra/redisRoute";
import { fieldOf, startStreamConsumer, type StreamConsumer } from "../infra/streamConsumer";

// 自筛踢句柄：websocket 层（online 表）在启动期注入 kickUser（core/auth ⛔ 不反向依赖 websocket 层）。
let kickHandler: ((uid: string) => void) | null = null;
/** 注入本节点强制下线句柄（index.ts 启动期挂 push.kickUser）。 */
export function setKickHandler(fn: (uid: string) => void): void { kickHandler = fn; }

/** 本节点自筛踢：命中本节点在线连接即强制下线；不在本节点直接跳过（§2.3 每节点自筛，⛔ 不查 presence）。 */
export function kickLocal(uid: string): void { kickHandler?.(uid); }

/** 广播踢人到控制总线（best-effort：Redis 抖动只是漏踢，权威撤销已落 MySQL，由兜底层收敛）。 */
export async function broadcastKick(uid: string): Promise<void> {
  try {
    await coordClient().xadd(K_STREAM_KICK, "*", "uid", uid);
  } catch (e) {
    console.error(`[kick] 广播失败 uid=${uid}（权威已落库，靠 verifiedAt 兜底）`, e);
  }
}

let consumer: StreamConsumer | null = null;
/** 控制总线消费（每节点一个，独立游标）：读 stream:kick → 本节点在线即踢。 */
export function startKickConsumer(): void {
  if (consumer) { return; }
  consumer = startStreamConsumer("kick", coordClient, K_STREAM_KICK, (fields) => {
    const uid = fieldOf(fields, "uid");
    if (uid) { kickLocal(uid); }
  }, { trimMs: KICK_STREAM_TRIM_MS });
}
export function stopKickConsumer(): void { consumer?.stop(); consumer = null; }
