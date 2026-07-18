/**
 * outbox relayer —— **独立单例进程**（[04 · relayer](docs/SERVER.md)）。
 *
 * - `singleton_lease('outbox_relayer')` 抢占；**续租守卫与业务批写同一 MySQL 事务、
 *   守卫作第一句、0 行即 ROLLBACK 自杀**（09·X7，僵尸 leader 绝不双写）。
 * - `FOR UPDATE SKIP LOCKED` 取行（RC 会话，09·DB5）。
 * - ⚠ relayer 不走 withUser（09·X5）；`cold` → M9 前 stub 成告警 + 跳过（保持 pending），
 *   M9 交付后换真 `ensureLive` 再重试。
 * - 死信：attempts > OUTBOX_MAX_ATTEMPTS → status=2 + 告警；人工处置走 replayDead（09·X6）。
 *
 * 启动：node --import tsx src/core/economy/relayer.ts
 */
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  LEASE_TTL_S, OUTBOX_DEAD, OUTBOX_DONE, OUTBOX_MAX_ATTEMPTS, OUTBOX_PENDING,
  OUTBOX_SWEEP_INTERVAL_MS, RELAYER_POLL_MS, RELAYER_VISIBILITY_S,
} from "../infra/config";
import { LeaseLostError, makeHolderId, tryAcquireLease, withLeaseTx, type SingletonLease } from "../infra/lease";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { ensureLive } from "../archive/thaw";
import { outboxStats, redisApply, sweepOutboxRetention, trimApplied, type Effect } from "./outbox";

const BATCH = 100;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface OutboxRow extends RowDataPacket {
  op_id: string; user_id: string; effect: Effect; attempts: number;
}

/** M9 挂接点：冷档解冻。M6 阶段是 stub（告警 + 跳过），⛔ 绝不在缺失 hash 上造残档。 */
let ensureLiveHook: ((uid: string) => Promise<void>) | null = null;
export function setEnsureLive(fn: (uid: string) => Promise<void>): void { ensureLiveHook = fn; }
setEnsureLive(ensureLive); // M9 接线：cold → 真 ensureLive（08 / 09·X5，冻结后仍可能有后到 outbox 行）

/** 单轮：续租守卫（第一句）+ 取批 + apply + 标记，全在一个 RC 事务。返回处理行数。 */
export async function relayerTick(lease: SingletonLease): Promise<number> {
  return withLeaseTx(lease, async (conn) => {
    const [rows] = await conn.query<OutboxRow[]>(
      `SELECT op_id, user_id, effect, attempts FROM gameplay_outbox
        WHERE status = ? AND created_at < NOW(3) - INTERVAL ? SECOND
        ORDER BY created_at, op_id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`,
      [OUTBOX_PENDING, RELAYER_VISIBILITY_S]);

    for (const row of rows) {
      try {
        let r = await redisApply(row.user_id, row.op_id, row.effect); // stringify 在 redisApply 内（09·DB8）
        if (r === "cold") {
          if (ensureLiveHook) {
            await ensureLiveHook(row.user_id);                        // 先解冻再重试（09·X5）
            r = await redisApply(row.user_id, row.op_id, row.effect);
          } else {
            // M9 前 stub：告警 + 跳过（保持 pending，不计失败——冷档不是本行的错）
            console.warn(`[relayer] ⚠ cold uid=${row.user_id} op=${row.op_id}（M9 ensureLive 未接线，保持 pending）`);
            continue;
          }
        }
        if (r !== "ok" && r !== "dup") { throw new Error(`apply=${r}`); }
        await conn.execute<ResultSetHeader>(
          "UPDATE gameplay_outbox SET status = ? WHERE op_id = ?", [OUTBOX_DONE, row.op_id]);
        if (Math.random() < 0.01) { await trimApplied(row.user_id).catch(() => {}); } // 顺路裁剪（09·I5）
      } catch (e) {
        // 真失败（Redis 连不上 / Lua 报错 / effect 非法）才累加；超限进死信
        const attempts = row.attempts + 1;
        const dead = attempts > OUTBOX_MAX_ATTEMPTS;
        await conn.execute<ResultSetHeader>(
          "UPDATE gameplay_outbox SET attempts = ?, last_error = ?, status = ? WHERE op_id = ?",
          [attempts, String(e).slice(0, 255), dead ? OUTBOX_DEAD : OUTBOX_PENDING, row.op_id]);
        if (dead) { console.error(`[relayer] ☠ 死信 op=${row.op_id} uid=${row.user_id}: ${String(e)}`); }
      }
    }
    return rows.length;
  });
}

/** 主循环：抢租约 → tick 循环 → 租约丢失即自杀（进程级，由 systemd/pm2 拉起新实例）。 */
export async function relayerMain(): Promise<never> {
  const holder = makeHolderId();
  let lease: SingletonLease | null = null;
  while (!lease) {
    lease = await tryAcquireLease("outbox_relayer", holder);
    if (!lease) { await sleep(LEASE_TTL_S * 1000 / 3); }
  }
  console.log(`[relayer] lease acquired holder=${holder} fence=${lease.fenceToken}`);

  let lastStats = 0;
  let lastSweep = 0;
  for (;;) {
    try {
      const n = await relayerTick(lease);
      // 核心告警随 M6 交付：pending 深度 / 最老 pending 年龄 / 死信行数
      if (Date.now() - lastStats > 30_000) {
        lastStats = Date.now();
        const s = await outboxStats();
        const level = s.dead > 0 || s.oldestPendingMs > 60_000 || s.pending > 1000 ? "⚠" : "·";
        console.log(`[relayer] ${level} pending=${s.pending} oldest=${Math.round(s.oldestPendingMs)}ms dead=${s.dead}`);
      }
      // 保留期清理（09·I5 前提）：只删超窗 done 行。不走 withLeaseTx——幂等删除，
      // 僵尸并发执行删的是同一批行，无害（与 outboxStats 同为租约外只读/幂等操作）
      if (Date.now() - lastSweep > OUTBOX_SWEEP_INTERVAL_MS) {
        lastSweep = Date.now();
        const swept = await sweepOutboxRetention();
        if (swept > 0) { console.log(`[relayer] outbox 保留期清理：删除 done 行 ${swept} 条`); }
      }
      await sleep(n >= BATCH ? 50 : RELAYER_POLL_MS); // 满批说明有积压，快追
    } catch (e) {
      if (e instanceof LeaseLostError) {
        console.error("[relayer] 守卫 UPDATE 0 行——已被顶替，自杀（09·X7）");
        process.exit(1);
      }
      console.error("[relayer] tick 失败", e);
      await sleep(RELAYER_POLL_MS);
    }
  }
}

// 独立进程入口
const isMain = process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
if (isMain) {
  relayerMain().catch((e) => { console.error("[relayer] 致命错误", e); process.exit(1); });
}
