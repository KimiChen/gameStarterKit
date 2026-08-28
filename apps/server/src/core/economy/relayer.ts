/**
 * outbox relayer —— **独立单例进程**（[04 · relayer](docs/SERVER.md)）。
 *
 * - `singleton_lease('outbox_relayer')` 抢占；**续租守卫与业务批写同一 MySQL 事务、
 *   守卫作第一句、0 行即 ROLLBACK 自杀**（09·X7，僵尸 leader 绝不双写）。
 * - `FOR UPDATE SKIP LOCKED` 取行（RC 会话，09·DB5）。
 * - ⚠ relayer 不走 withUser（09·X5）；`cold` → 先 `ensureLive` 解冻再重试
 *   （M9 已接线；冻结后仍可能有后到 outbox 行，08 / 09·X5）。
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
import { zoneCtx } from "../infra/keys";
import { LeaseLostError, makeHolderId, tryAcquireLease, withLeaseTx, type SingletonLease } from "../infra/lease";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { ensureLive } from "../archive/thaw";
import { outboxStats, redisApply, sweepOutboxRetention, trimApplied, type Effect } from "./outbox";
import { storedInt } from "../infra/numbers";

const BATCH = 100;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface OutboxRow extends RowDataPacket {
  op_id: string; user_id: string; server_id: unknown; effect: Effect; attempts: unknown;
}

const MAX_SERVER_ID_FIELD = 65_535; // SMALLINT UNSIGNED（sql/schema.sql）
const MAX_OUTBOX_ATTEMPTS_FIELD = 65_535; // SMALLINT UNSIGNED（sql/schema.sql）
const CORRUPT_ROW_ATTEMPTS = Math.min(OUTBOX_MAX_ATTEMPTS + 1, MAX_OUTBOX_ATTEMPTS_FIELD);

export interface NormalizedOutboxMetadata {
  readonly serverId: number;
  readonly attempts: number;
}

/**
 * mysql2 的 numeric mode 可能把整数列交给我们时变成字符串；边界处统一归一化。
 * 这个函数故意不做任何默认值填充：缺失/损坏的 durable metadata 必须进入死信，
 * 不能拿一个猜出来的区号或 attempts 去写 Redis/重试计数。
 */
export function normalizeOutboxMetadata(
  row: Pick<OutboxRow, "server_id" | "attempts">,
): NormalizedOutboxMetadata {
  return {
    serverId: storedInt(row.server_id, "outbox.server_id", { min: 0, max: MAX_SERVER_ID_FIELD }),
    attempts: storedInt(row.attempts, "outbox.attempts", {
      min: 0,
      max: MAX_OUTBOX_ATTEMPTS_FIELD - 1,
    }),
  };
}

const errorText = (error: unknown): string => String(error).slice(0, 255);

/**
 * 记录单行失败。metadata 不存在表示 durable row 自身已损坏（通常是 server_id 或
 * attempts 无法解析）；此时按唯一 op_id 标记死信，避免使用坏 server_id 作为 SQL/Redis
 * 路由条件，也避免 poison row 在每一轮重复阻塞。正常业务失败仍沿用 attempts 重试。
 */
async function recordRelayerFailure(
  conn: PoolConnection,
  row: OutboxRow,
  error: unknown,
  metadata: NormalizedOutboxMetadata | undefined,
): Promise<void> {
  const detail = errorText(error);
  if (metadata === undefined) {
    await conn.execute<ResultSetHeader>(
      "UPDATE gameplay_outbox SET attempts = ?, last_error = ?, status = ? WHERE op_id = ?",
      [CORRUPT_ROW_ATTEMPTS, detail, OUTBOX_DEAD, row.op_id]);
    console.error(`[relayer] ☠ 损坏 outbox 行已死信 op=${row.op_id}: ${detail}`);
    return;
  }

  const nextAttempts = metadata.attempts + 1;
  const dead = nextAttempts > OUTBOX_MAX_ATTEMPTS;
  await conn.execute<ResultSetHeader>(
    "UPDATE gameplay_outbox SET attempts = ?, last_error = ?, status = ? WHERE op_id = ? AND server_id = ?",
    [nextAttempts, detail, dead ? OUTBOX_DEAD : OUTBOX_PENDING, row.op_id, metadata.serverId]);
  if (dead) { console.error(`[relayer] ☠ 死信 op=${row.op_id} uid=${row.user_id}: ${detail}`); }
}


/** 单轮：续租守卫（第一句）+ 取批 + apply + 标记，全在一个 RC 事务。返回处理行数。 */
export async function relayerTick(lease: SingletonLease): Promise<number> {
  return withLeaseTx(lease, async (conn) => {
    const [rows] = await conn.query<OutboxRow[]>(
      `SELECT op_id, user_id, server_id, effect, attempts FROM gameplay_outbox
        WHERE status = ? AND created_at < NOW(3) - INTERVAL ? SECOND
        ORDER BY created_at, op_id
        LIMIT ${BATCH}
        FOR UPDATE SKIP LOCKED`,
      [OUTBOX_PENDING, RELAYER_VISIBILITY_S]);

    for (const row of rows) {
      let metadata: NormalizedOutboxMetadata | undefined;
      try {
        // mysql2 may expose BIG/SMALLINT columns as strings depending on the
        // configured numeric mode.  Normalize before zone routing or arithmetic;
        // otherwise `"9" + 1` becomes 91 and a malformed sId can select the wrong
        // Redis prefix.  Keep this inside the row's error boundary: one corrupt
        // durable row must not abort the rest of the batch.
        metadata = normalizeOutboxMetadata(row);
        const { serverId } = metadata;
        // 后台无请求上下文（DUAL_MODE §3.6 B4）：按行 server_id 重建区上下文，
        // redisApply/ensureLive/trimApplied 才落对区 Redis 前缀（落 run 外 = 落 s0 影子区 → 二次发货/漏裁剪）。
        await zoneCtx.run({ sId: serverId }, async () => {
          let r = await redisApply(row.user_id, row.op_id, row.effect); // stringify 在 redisApply 内（09·DB8）
          if (r === "cold") {
            await ensureLive(row.user_id, serverId);                    // 先解冻再重试（09·X5）
            r = await redisApply(row.user_id, row.op_id, row.effect);
          }
          if (r !== "ok" && r !== "dup") { throw new Error(`apply=${r}`); }
          await conn.execute<ResultSetHeader>(
            "UPDATE gameplay_outbox SET status = ? WHERE op_id = ? AND server_id = ?",
            [OUTBOX_DONE, row.op_id, serverId]);
          if (Math.random() < 0.01) { await trimApplied(row.user_id, serverId).catch(() => {}); } // 顺路裁剪（09·I5）
        });
      } catch (e) {
        // 真失败（Redis 连不上 / Lua 报错 / effect 非法）才累加；超限进死信。
        // metadata 解析失败时 recordRelayerFailure 走按 op_id 的损坏行闸，且继续下一行。
        await recordRelayerFailure(conn, row, e, metadata);
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
