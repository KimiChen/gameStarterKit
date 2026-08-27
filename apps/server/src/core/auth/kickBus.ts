/**
 * **踢人通道**（kick bus，DUAL_MODE §2.3 / M12d）。⚠ 本文件只负责「把在线连接踢下线」这一件事——
 * 撤销的**权威**由独立 WebPlatform 持有，GM 通过其 Admin HTTP API 写入。
 *
 * **封号语义 = 账号级「下次登不上」**。本模块只负责第二件事——
 * **把在线连接踢下线，逼其重走登录流程**。
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
import { K_STREAM_KICK, kSess } from "../infra/keys";
import { clientFor, coordClient } from "../infra/redisRoute";
import { fieldOf, startStreamConsumer, type StreamConsumer } from "../infra/streamConsumer";
import { defaultLifecycle } from "../infra/lifecycle";

// 自筛踢句柄：websocket 层（online 表）在启动期注入 kickUser（core/auth ⛔ 不反向依赖 websocket 层）。
let kickHandler: ((uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, sId?: number) => void) | null = null;
/** 注入本节点强制下线句柄（index.ts 启动期挂 push.kickUser）。 */
export function setKickHandler(fn: (uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, sId?: number) => void): void { kickHandler = fn; }

/** 本节点自筛踢：命中本节点在线连接即强制下线（先推 reason 再关）；不在本节点直接跳过（§2.3 每节点自筛，⛔ 不查 presence）。 */
/** @param sId 只踢该区的连接（顶号，M12e）；**省略 = 踢该 uid 在本节点的全部区**（封号/撤销：账号级）。 */
export function kickLocal(uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, sId?: number): void {
  kickHandler?.(uid, reason, exceptTokenHash, sId);
}

/** 广播踢人到控制总线（best-effort：Redis 抖动只是漏踢；权威撤销已落 MySQL，送达保证走 GM `/admin/kick`）。 */
export async function broadcastKick(
  uid: string, reason: ForceLogoutReasonType, exceptTokenHash?: string, issuedAtMs?: number, sId?: number,
): Promise<void> {
  try {
    await coordClient().xadd(K_STREAM_KICK, "*", "uid", uid, "reason", reason,
      // 顶号判别位（可选）：消费侧据此跳过持新登录态的连接，⛔ 防迟到投递自踢
      ...(exceptTokenHash !== undefined ? ["exceptHash", exceptTokenHash] : []),
      // ⚠ 单调栅栏（A6）：`exceptHash` 是**等值**判据、⛔ 不单调——消费循环卡顿导致事件积压时，
      // 晚到的旧事件拿**旧的** exceptHash 去比**新的**在线表，两者必然不等 ⇒ 把已经合法登录的
      // 赢家踢下线。带上发起方的签发时刻，消费侧即可认出"我已经过期了"。
      ...(issuedAtMs !== undefined ? ["issuedAt", String(issuedAtMs)] : []),
      // ⚠ 顶号的作用域是**区**（M12e）：带 sId ⇒ 消费侧只踢该区的连接。
      // ⛔ 封号/撤销**不带** sId（账号级，要踢光该 uid 的全部区）——两种语义靠"有没有这个字段"区分。
      ...(sId !== undefined ? ["sId", String(sId)] : []));
  } catch (e) {
    console.error(`[kick] 广播失败 uid=${uid}（权威已落库；GM 工具的 /admin/kick 才是保证送达的那一步）`, e);
  }
}

let consumer: StreamConsumer | null = null;
let consumerUnregister: (() => void) | null = null;
/** 控制总线消费（每节点一个，独立游标）：读 stream:kick → 本节点在线即踢。 */
export function startKickConsumer(): void {
  if (consumer) { return; }
  consumer = startStreamConsumer("kick", coordClient, K_STREAM_KICK, async (fields) => {
    const uid = fieldOf(fields, "uid");
    // reason 缺省按封号（兼容旧条目/别的发布端只带 uid 的情况）
    // reason 缺省/非法一律按封号兜底（兼容旧条目、别的发布端只带 uid；⛔ 不裸 cast 未校验值）
    const raw = fieldOf(fields, "reason");
    const reason = (Object.values(ForceLogoutReason) as string[]).includes(raw ?? "")
      ? raw as ForceLogoutReasonType : ForceLogoutReason.Banned;
    if (!uid) { return; }
    // ⚠ **单调栅栏（A6）：陈旧的顶号事件整条丢弃**。回读组 sess 的 `issuedAt`（A1 落地的单调量）：
    // 事件比它旧 ⇒ 说明这条广播发出之后**又发生过更晚的登录**，而那次登录已经发过自己的踢人事件
    // ⇒ 本条已无事可做，继续处理只会拿过期的 exceptHash 去踢掉赢家。
    // ⛔ **只对带 issuedAt 的事件做这个判断**：封号/撤销（GM 侧）不绑定任何一次登录，必须无条件踢；
    //    旧版本发布端的条目也没有该字段，⛔ 不能因为"没带"就丢弃（那会静默漏踢）。
    const rawSid = fieldOf(fields, "sId");
    const sId = rawSid !== undefined && /^\d+$/.test(rawSid) ? Number(rawSid) : undefined;
    const at = fieldOf(fields, "issuedAt");
    if (at !== undefined && sId !== undefined) {
      const stored = await clientFor(uid).hget(kSess(uid, sId), "issuedAt").catch(() => null);
      if (stored !== null && Number(stored) > Number(at)) {
        console.warn(`[kick] 丢弃陈旧顶号事件 uid=${uid}（事件 issuedAt=${at} < 组 sess ${stored}）`);
        return;
      }
    }
    kickLocal(uid, reason, fieldOf(fields, "exceptHash"), sId);
  }, { trimMs: KICK_STREAM_TRIM_MS });
  consumerUnregister = defaultLifecycle.register("kick", () => stopKickConsumer());
}
export async function stopKickConsumer(): Promise<void> {
  const current = consumer;
  consumer = null;
  consumerUnregister?.();
  consumerUnregister = null;
  await current?.stop();
}
