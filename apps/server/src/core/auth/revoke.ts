/**
 * 控制总线消费 + 撤销 outbox 发行 + 本地 maxEpoch（DUAL_MODE §2.3，M12d）。
 *
 * 撤销传播链（跨组唯一通道，只走幂等 epoch，⛔ 非 Pub/Sub）：
 *   封号/踢人 → lib banAccount/revokeAccount（accounts.token_epoch+1 与 revocation_log **同事务**）
 *   → relayer 扫 relayed=0 → coord Redis `XADD stream:revoke {uid,epoch}` → 标 relayed=1
 *   → **每节点**独立游标消费 → 更新本地 maxEpoch[uid]（max-wins）→ 快路径 verifySession 比对即拒。
 *
 * 每节点自持 maxEpoch、⛔ 不查 presence；发行幂等（重发 max-wins 无害），崩溃窗由 relayer 兜底扫描收敛。
 * 自筛踢在线连接见 M12d-b（applyRevoke 内追加）。
 */
import { REVOKE_RELAY_POLL_MS, REVOKE_STREAM_TRIM_MS } from "../infra/config";
import { K_STREAM_REVOKE } from "../infra/keys";
import { coordClient } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { fieldOf, startStreamConsumer, type StreamConsumer } from "../infra/streamConsumer";

// 本节点撤销 epoch 缓存（uid → 已知最大撤销 epoch）：控制总线消费维护 + 撤销源即时写。
// ⚠ 只增按 max-wins；条目量 = 本进程存活期见过的撤销 uid 数（封号低频、泄漏缓慢）——离线 uid 清理留 M12d-b，
//   且 evict 后的漏网由 verifiedAt 兜底权威回源逮住（AUTH_REVERIFY_TTL_S 内），非正确性依赖。
const maxEpoch = new Map<string, number>();

/** 本节点已知的撤销 epoch（快路径比对：sess.tokenEpoch < 此值 → 拒）。缺省 0。 */
export function revokedEpoch(uid: string): number { return maxEpoch.get(uid) ?? 0; }

/** 应用一条撤销（消费流 / 撤销源即时调）：max-wins 更新本地 maxEpoch。 */
export function applyRevoke(uid: string, epoch: number): void {
  if (epoch > (maxEpoch.get(uid) ?? 0)) { maxEpoch.set(uid, epoch); }
  // M12d-b：此处追加「本节点 online 命中即踢」自筛。
}

/** 测试用：清空本地 maxEpoch。 */
export function _resetMaxEpoch(): void { maxEpoch.clear(); }

/**
 * 发行 outbox：扫 revocation_log relayed=0 → 控制总线 XADD → 标 relayed=1。幂等
 * （XADD 后崩溃则行滞留 relayed=0，下轮重发+重标；重发经 epoch max-wins 无害）。
 * 撤销源即时调一次（低延迟）+ relayer 周期兜底崩溃窗。
 */
export async function drainRevocations(): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT id, user_id, epoch FROM revocation_log WHERE relayed = 0 ORDER BY id LIMIT 500");
  let n = 0;
  for (const row of rows) {
    await coordClient().xadd(K_STREAM_REVOKE, "*", "uid", String(row.user_id), "epoch", String(row.epoch));
    await getPool().execute<ResultSetHeader>("UPDATE revocation_log SET relayed = 1 WHERE id = ?", [row.id]);
    n++;
  }
  return n;
}

let relayer: ReturnType<typeof setInterval> | null = null;
/** 撤销发行 relayer（崩溃窗兜底周期扫描；happy path 由撤销源即时 drainRevocations）。幂等，多实例并发无害。 */
export function startRevokeRelayer(): void {
  if (relayer) { return; }
  relayer = setInterval(() => { void drainRevocations().catch((e) => console.error("[revoke-relayer]", e)); }, REVOKE_RELAY_POLL_MS);
  relayer.unref?.(); // ⛔ 不阻止进程退出
}
export function stopRevokeRelayer(): void { if (relayer) { clearInterval(relayer); relayer = null; } }

let consumer: StreamConsumer | null = null;
/** 控制总线消费（每节点一个，独立游标）：读 stream:revoke → applyRevoke 更新本地 maxEpoch。 */
export function startRevokeConsumer(): void {
  if (consumer) { return; }
  consumer = startStreamConsumer("revoke", coordClient, K_STREAM_REVOKE, (fields) => {
    const uid = fieldOf(fields, "uid");
    const epoch = fieldOf(fields, "epoch");
    if (uid && epoch !== undefined) { applyRevoke(uid, Number(epoch)); }
  }, { trimMs: REVOKE_STREAM_TRIM_MS });
}
export function stopRevokeConsumer(): void { consumer?.stop(); consumer = null; }
