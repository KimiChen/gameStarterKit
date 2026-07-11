/**
 * 跨存储 outbox（[04 · 跨存储 outbox 协议](../../../../docs/server/04-cross-store-outbox.md)）。
 *
 * 同时碰「钱(MySQL) + 道具(Redis)」必须走这里（09·X1）：
 *   阶段 1 MySQL 事务（ledger + 扣款 + INSERT intent 三者原子，货币先行）
 *   阶段 2 redisApply（幂等，⛔ 无 fence CAS，09·X3）
 *   阶段 3 markOutboxDone（best-effort；崩了 relayer 重放 dup 后补标）
 * 只改 Redis 不碰钱的请求⛔不要引入 outbox（09·X2）——直接 withUser + casHset。
 */
import { v5 as uuidv5 } from "uuid";
import {
  APPLIED_RETENTION_MS, BAG_SHARDS, OP_ID_NAMESPACE, OUTBOX_DONE, OUTBOX_PENDING,
} from "../infra/config";
import { kApplied, kBagAll, kUser } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { APPLY_EFFECT, evalshaWithReload } from "../infra/redisScripts";
import { getPool, withRcTx } from "../infra/mysql";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { withUser } from "../core/uow";
import { debitInTx, getBalance, invalidateBalanceCache } from "./currency";
import type { ShopSku } from "./catalog";

/** 一次 intent 的全部玩法副作用。货币不在此（走 MySQL，09·A2）。 */
export type Grant =
  | { kind: "item"; itemId: number; count: number }     // 增量：HINCRBY bag 分片
  | { kind: "star"; delta: number }                      // 增量：HINCRBY user.star
  | { kind: "setField"; field: string; value: string };  // 绝对值：HSET
export type Effect = Grant[];

/**
 * op_id 服务端派生（09·I2）：同一 (uid, type, clientReqId) 永远同一个 op_id，
 * 客户端只提供 clientReqId 且重试必须复用；跨用户无法碰撞。
 * 三处同一个 id（09·I3）：currency_ledger.idem_key = gameplay_outbox.op_id = applied:{uid} member。
 */
export function deriveOpId(uid: string, type: string, clientReqId: string): string {
  return uuidv5(`${uid}:${type}:${clientReqId}`, OP_ID_NAMESPACE);
}

/**
 * 幂等 apply（单条 Lua 原子）。`cold` = 档不存在（可能已冻结）→ 调用方 ensureLive 后重试，
 * ⛔ 绝不在缺失 hash 上造残档（09·R2/X5）。
 * effect 若来自 MySQL JSON 列，mysql2 已解析成对象——stringify 统一在这里做（09·DB8）。
 */
export async function redisApply(uid: string, opId: string, effect: Effect): Promise<"ok" | "dup" | "cold"> {
  if (effect.length > 0 && BAG_SHARDS < 1) { throw new Error("BAG_SHARDS 配置非法"); }
  const keys = [kUser(uid), kApplied(uid), ...kBagAll(uid)];
  const r = await evalshaWithReload(
    clientFor(uid), APPLY_EFFECT, keys,
    [opId, String(Date.now()), JSON.stringify(effect)],
  ) as string;
  if (r.startsWith("ok:")) {
    // 负数下溢已在 Lua 内回补到 0（09·X8），这里记异常供对账/告警
    console.warn(`[outbox] clawback 下溢回补 uid=${uid} op=${opId} ${r.slice(3)}`);
    return "ok";
  }
  return r as "ok" | "dup" | "cold";
}

// ───────────────────── MySQL 侧（M6） ─────────────────────

export interface PurchaseResult {
  opId: string;
  status: "done" | "granting" | "dead";
  balance: number;
  granted?: Effect;
}

/**
 * 阶段 1：扣钱 + durable intent 同一 RC 事务（09·X1 货币先行 / DB5）。
 * 返回 'DUP'（幂等命中）或 'OK'。失败（余额不足/stale fence）抛异常整体回滚——
 * ledger 行一并消失，Redis 未动，干净失败。
 */
export async function purchaseTx(
  uid: string, fence: number, sku: ShopSku, opId: string,
): Promise<"DUP" | "OK"> {
  const outcome = await withRcTx(async (conn) => {
    const debit = await debitInTx(conn, uid, sku.currency, sku.price, fence, opId, "shop.purchase");
    if (debit === "DUP") { return "DUP" as const; }
    await conn.execute<ResultSetHeader>(
      `INSERT INTO gameplay_outbox (op_id, user_id, effect, status)
       VALUES (?,?,CAST(? AS JSON),?)`,
      [opId, uid, JSON.stringify(sku.grants), OUTBOX_PENDING]);
    return "OK" as const;
  });
  if (outcome === "OK") { await invalidateBalanceCache(uid); }
  return outcome;
}

/** 阶段 3：best-effort 标记完成（04：崩了也无碍，relayer 重放判 dup 后补标）。 */
export async function markOutboxDone(opId: string): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE gameplay_outbox SET status = ? WHERE op_id = ?", [OUTBOX_DONE, opId]);
}

/** relayer 真失败（Redis 连不上 / Lua 报错 / effect 非法）时累加 attempts。 */
export async function bumpAttempts(opId: string, err: string): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE gameplay_outbox SET attempts = attempts + 1, last_error = ? WHERE op_id = ?",
    [err.slice(0, 255), opId]);
}

/** 回读操作状态（shop.queryOp / purchase 返回值共用）。 */
export async function readBack(uid: string, opId: string): Promise<PurchaseResult> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status, effect FROM gameplay_outbox WHERE op_id = ? AND user_id = ?", [opId, uid]);
  const balance = await getBalance(uid);
  if (rows.length === 0) { return { opId, status: "dead", balance }; } // 不存在的 op 按 dead 报
  const status = Number(rows[0].status);
  return {
    opId,
    status: status === OUTBOX_DONE ? "done" : status === OUTBOX_PENDING ? "granting" : "dead",
    balance,
    // mysql2 已把 JSON 列解析成对象（09·DB8）
    granted: status === OUTBOX_DONE ? rows[0].effect as Effect : undefined,
  };
}

/**
 * 购买主流程（04 协议全文）。客户端重试必须复用同一 clientReqId（09·I2）。
 * 阶段 2/3 崩溃或失败都不抛给用户——钱已扣、intent 已 durable，relayer 必定补发，
 * 返回 granting 让客户端轮询 shop.queryOp（⛔ 客户端不要做「超时即失败」）。
 */
export async function purchase(uid: string, sku: ShopSku, clientReqId: string): Promise<PurchaseResult> {
  const opId = deriveOpId(uid, "shop.purchase", clientReqId);
  return withUser(uid, async (uow) => {
    const outcome = await purchaseTx(uid, uow.fence, sku, opId);   // 阶段 1（原子）
    if (outcome === "DUP") { return readBack(uid, opId); }

    try {
      const r = await redisApply(uid, opId, sku.grants);           // 阶段 2：幂等 apply（无 fence）
      if (r === "ok" || r === "dup") {
        await markOutboxDone(opId);                                 // 阶段 3：best-effort
      }
      // cold（罕见：档刚被冻结）→ 留 pending 给 relayer→ensureLive（09·X5）
    } catch { /* 阶段 2/3 失败留给 relayer 收敛（04 崩溃窗口分析） */ }
    return readBack(uid, opId);
  });
}

/**
 * applied:{uid} 裁剪（09·I5）：窗口必须严格大于 outbox 保留窗口
 * （APPLIED_RETENTION ≥ 2 × OUTBOX_RETENTION 已在 config 固化）。
 */
export async function trimApplied(uid: string): Promise<number> {
  return clientFor(uid).zremrangebyscore(kApplied(uid), "-inf", `(${Date.now() - APPLIED_RETENTION_MS}`);
}

/**
 * 死信人工处置（09·X6）：**必须走重放**（redisApply 由 applied 去重），
 * ⛔ 禁止手改 status = done。成功后才标 done。
 */
export async function replayDead(opId: string): Promise<"ok" | "dup" | "cold" | "missing"> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id, effect FROM gameplay_outbox WHERE op_id = ?", [opId]);
  if (rows.length === 0) { return "missing"; }
  const r = await redisApply(rows[0].user_id as string, opId, rows[0].effect as Effect);
  if (r === "ok" || r === "dup") { await markOutboxDone(opId); }
  return r;
}

/** M6/M10 核心告警数据源：pending 深度 / 最老 pending 年龄 / 死信行数。 */
export async function outboxStats(): Promise<{ pending: number; oldestPendingMs: number; dead: number }> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT
       SUM(status = 0) AS pending,
       SUM(status = 2) AS dead,
       TIMESTAMPDIFF(MICROSECOND, MIN(CASE WHEN status = 0 THEN created_at END), NOW(3)) / 1000 AS oldest_ms
     FROM gameplay_outbox`);
  return {
    pending: Number(rows[0].pending ?? 0),
    dead: Number(rows[0].dead ?? 0),
    oldestPendingMs: rows[0].oldest_ms === null ? 0 : Number(rows[0].oldest_ms),
  };
}
