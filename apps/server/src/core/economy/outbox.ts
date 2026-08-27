/**
 * 跨存储 outbox（[04 · 跨存储 outbox 协议](docs/SERVER.md)）。
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
  OUTBOX_RETENTION_MS,
} from "../infra/config";
import { currentZoneId, kApplied, kAppliedPayload, kBagAll, kUser, zoneCtx } from "../infra/keys";
import { clientFor } from "../infra/redisRoute";
import { APPLY_EFFECT, evalshaWithReload } from "../infra/redisScripts";
import { getPool, withRcTx } from "../infra/mysql";
import type { ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { withUser } from "../uow";
import { debitInTx, getBalance, invalidateBalanceCache } from "./currency";
import type { ShopSku } from "./catalog";
import {
  EffectValidationError, normalizeEffect, type IEffect, type IGrant, type IPurchaseResult,
} from "@game/shared";
import { EffectConflictError, InvalidEffectError } from "../errors";
import { storedFinite, storedInt } from "../infra/numbers";

/**
 * 一次 intent 的全部玩法副作用。货币不在此（走 MySQL，09·A2）。
 * 类型真源在 shared/protocol/lobbyRpc/economy.ts（客户端同一定义）；
 * kind 语义：item=HINCRBY bag 分片增量，star=HINCRBY user.star 增量，setField=HSET 绝对值。
 */
export type Grant = IGrant;
export type Effect = IGrant[];
export type VersionedEffect = IEffect;
export type EffectInput = Effect | VersionedEffect;

/** 所有进入 durable/Redis 边界的 effect 都先走 shared validator。 */
export function canonicalizeEffect(input: unknown): VersionedEffect {
  try {
    return normalizeEffect(input);
  } catch (e) {
    if (e instanceof EffectValidationError) { throw new InvalidEffectError(e.code); }
    throw e;
  }
}

const canonicalEffect = canonicalizeEffect;

/**
 * op_id 服务端派生（09·I2）：同一 (uid, sId, type, clientReqId) 永远同一个 op_id，
 * 客户端只提供 clientReqId 且重试必须复用；跨用户/跨区无法碰撞。
 * 三处同一个 id（09·I3）：currency_ledger.idem_key = gameplay_outbox.op_id = applied:{uid} member。
 * ⚠ 每区独立经济红线（DUAL_MODE §3.4）：sId 必须编码进派生输入——gameplay_outbox.op_id 是全局 PK，
 * 同账号跨区复用同 clientReqId 若不编码 sId 会撞主键、ODKU no-op 静默吞掉 intent（发货凭空消失）。
 * 与 `currency_ledger UNIQUE(user_id, server_id, idem_key)` 同源同废（D2）；⛔ OP_ID_NAMESPACE 永不改。
 */
export function deriveOpId(uid: string, sId: number, type: string, clientReqId: string): string {
  return uuidv5(`${uid}:${sId}:${type}:${clientReqId}`, OP_ID_NAMESPACE);
}

/**
 * 幂等 apply（单条 Lua 原子）。`cold` = 档不存在（可能已冻结）→ 调用方 ensureLive 后重试，
 * ⛔ 绝不在缺失 hash 上造残档（09·R2/X5）。
 * effect 若来自 MySQL JSON 列，mysql2 已解析成对象——stringify 统一在这里做（09·DB8）。
 */
export async function redisApply(uid: string, opId: string, effect: EffectInput): Promise<"ok" | "dup" | "cold"> {
  const canonical = canonicalEffect(effect);
  if (canonical.grants.length > 0 && BAG_SHARDS < 1) { throw new Error("BAG_SHARDS 配置非法"); }
  const keys = [kUser(uid), kApplied(uid), kAppliedPayload(uid), ...kBagAll(uid)];
  const r = await evalshaWithReload(
    clientFor(uid), APPLY_EFFECT, keys,
    [opId, String(Date.now()), JSON.stringify(canonical)],
  ) as string;
  if (r.startsWith("ok:")) {
    // 负数下溢已在 Lua 内回补到 0（09·X8），这里记异常供对账/告警
    console.warn(`[outbox] clawback 下溢回补 uid=${uid} op=${opId} ${r.slice(3)}`);
    return "ok";
  }
  if (r === "conflict") { throw new EffectConflictError(); }
  if (r.startsWith("err:")) { throw new InvalidEffectError(r.slice(4)); }
  if (r === "ok" || r === "dup" || r === "cold") { return r; }
  throw new InvalidEffectError("EFFECT_SCRIPT_RESULT");
}

// ───────────────────── MySQL 侧（M6） ─────────────────────

// 结果形状真源在 shared/protocol/lobbyRpc/economy.ts（status='granting' → 客户端 queryOp 轮询）
export type PurchaseResult = IPurchaseResult;

/**
 * 阶段 1：扣钱 + durable intent 同一 RC 事务（09·X1 货币先行 / DB5）。
 * 返回 'DUP'（幂等命中）或 'OK'。失败（余额不足/stale fence）抛异常整体回滚——
 * ledger 行一并消失，Redis 未动，干净失败。
 */
export async function purchaseTx(
  uid: string, sId: number, fence: number, sku: ShopSku, opId: string,
): Promise<"DUP" | "OK"> {
  // Validate before opening the transaction: an invalid grant must not debit money or
  // leave a durable ledger row that the relayer can never apply.
  const canonical = canonicalEffect(sku.grants);
  const outcome = await withRcTx(async (conn) => {
    const debit = await debitInTx(conn, uid, sId, sku.currency, sku.price, fence, opId, "shop.purchase");
    if (debit === "DUP") {
      // A unique ledger hit is only a true retry when the existing durable intent has
      // the same canonical payload. Otherwise surface a deterministic conflict rather
      // than silently treating a changed request as delivered.
      const [rows] = await conn.query<RowDataPacket[]>(
        "SELECT effect FROM gameplay_outbox WHERE op_id = ? AND user_id = ? AND server_id = ? FOR UPDATE",
        [opId, uid, sId]);
      if (rows.length === 0) { throw new EffectConflictError(); }
      const existing = canonicalEffect(rows[0].effect);
      if (JSON.stringify(existing) !== JSON.stringify(canonical)) { throw new EffectConflictError(); }
      return "DUP" as const;
    }
    await conn.execute<ResultSetHeader>(
      `INSERT INTO gameplay_outbox (op_id, user_id, server_id, effect, status)
       VALUES (?,?,?,CAST(? AS JSON),?)`,
      [opId, uid, sId, JSON.stringify(canonical), OUTBOX_PENDING]);
    return "OK" as const;
  });
  if (outcome === "OK") { await invalidateBalanceCache(uid, sId); }
  return outcome;
}

/** 阶段 3：best-effort 标记完成（04：崩了也无碍，relayer 重放判 dup 后补标）。 */
export async function markOutboxDone(opId: string, sId = currentZoneId()): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE gameplay_outbox SET status = ? WHERE op_id = ? AND server_id = ?", [OUTBOX_DONE, opId, sId]);
}

/** relayer 真失败（Redis 连不上 / Lua 报错 / effect 非法）时累加 attempts。 */
export async function bumpAttempts(opId: string, err: string, sId = currentZoneId()): Promise<void> {
  await getPool().execute<ResultSetHeader>(
    "UPDATE gameplay_outbox SET attempts = attempts + 1, last_error = ? WHERE op_id = ? AND server_id = ?",
    [err.slice(0, 255), opId, sId]);
}

/** 回读操作状态（shop.queryOp / purchase 返回值共用）。 */
export async function readBack(uid: string, sId: number, opId: string): Promise<PurchaseResult> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT status, effect FROM gameplay_outbox WHERE op_id = ? AND user_id = ? AND server_id = ?",
    [opId, uid, sId]);
  const balance = await getBalance(uid, sId);
  if (rows.length === 0) { return { opId, status: "dead", balance }; } // 不存在的 op 按 dead 报
  const status = storedInt(rows[0].status, "outbox.status", { min: 0, max: 2 });
  return {
    opId,
    status: status === OUTBOX_DONE ? "done" : status === OUTBOX_PENDING ? "granting" : "dead",
    balance,
    // mysql2 已把 JSON 列解析成对象（09·DB8）
    granted: status === OUTBOX_DONE ? canonicalEffect(rows[0].effect).grants : undefined,
  };
}

/**
 * 购买主流程（04 协议全文）。客户端重试必须复用同一 clientReqId（09·I2）。
 * 阶段 2/3 崩溃或失败都不抛给用户——钱已扣、intent 已 durable，relayer 必定补发，
 * 返回 granting 让客户端轮询 shop.queryOp（⛔ 客户端不要做「超时即失败」）。
 */
export async function purchase(uid: string, sku: ShopSku, clientReqId: string): Promise<PurchaseResult> {
  const sId = currentZoneId();                                      // 当前区（§3.4/§3.5；单形态=0）
  const opId = deriveOpId(uid, sId, "shop.purchase", clientReqId);
  return withUser(uid, async (uow) => {
    const outcome = await purchaseTx(uid, sId, uow.fence, sku, opId);   // 阶段 1（原子）
    if (outcome === "DUP") { return readBack(uid, sId, opId); }

    try {
      const r = await redisApply(uid, opId, sku.grants);           // 阶段 2：幂等 apply（无 fence；Redis 键 per-zone via zoneCtx）
      if (r === "ok" || r === "dup") {
        await markOutboxDone(opId, sId);                             // 阶段 3：best-effort
      }
      // cold（罕见：档刚被冻结）→ 留 pending 给 relayer→ensureLive（09·X5）
    } catch { /* 阶段 2/3 失败留给 relayer 收敛（04 崩溃窗口分析） */ }
    return readBack(uid, sId, opId);
  });
}

/**
 * 吸干某用户的全部 pending intent（按创建序 apply + 标记 done）。
 *
 * 用途：档字段走**绝对值 setField** 的写路径，与 item/star 增量不同**不可交换**——
 * 若旧 intent 在阶段 2 前崩溃、且用户后续操作先写了同字段，relayer 迟到重放会把
 * 旧绝对值盖回去（序反转）。所有含 setField 的写操作在 withUser 锁内**先调本函数**
 * 吸干旧 intent，把崩溃窗口收敛为「锁内串行」。与 relayer 并发重放同一 op 是安全的
 * （redisApply 经 applied 集合幂等判 dup）。
 * cold（档冻结）原样上抛——⛔ 不在缺失档上造残档（09·R2），由上层 ensureLive 流程处理。
 */
export async function drainPendingFor(uid: string, sId: number): Promise<number> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT op_id, effect FROM gameplay_outbox WHERE user_id = ? AND server_id = ? AND status = ? ORDER BY created_at, op_id",
    [uid, sId, OUTBOX_PENDING]);
  // 显式包 zoneCtx（§3.6 B4，评审 C1）：即使调用方 ambient 与 sId 不一致，redisApply 也落 sId 对应区，
  // 消除「按 server_id=sId 取行、却 apply 到 ambient 区」的签名歧义（本函数为 setField 写路径预留）。
  return zoneCtx.run({ sId }, async () => {
    let applied = 0;
    for (const row of rows) {
      const r = await redisApply(uid, row.op_id as string, row.effect as Effect);
      if (r === "cold") { throw new Error(`drainPendingFor: 档已冻结 uid=${uid}`); }
      await markOutboxDone(row.op_id as string, sId);
      applied++;
    }
    return applied;
  });
}

/**
 * applied:{uid} 裁剪（09·I5，评审修正版）：时间窗只是**候选**条件，裁剪必须与 coordinator
 * 状态联动——仍 pending/dead 的 op_id ⛔ 永不裁：它们还会被 relayer/replayDead 重放，
 * applied 标记是防二次发货的**唯一**去重记录（场景：Redis 已发货但 markOutboxDone 长期
 * 失败 → 行滞留 pending → 纯时间窗裁掉标记后重放 = 双发）。
 * done 行本身由 sweepOutboxRetention 按窗清理；不在 outbox 表里的候选（done 已清）安全可裁。
 * （APPLIED_RETENTION ≥ 2 × OUTBOX_RETENTION 仍在 config 固化，作为第一道窗口不等式。）
 */
export async function trimApplied(uid: string, sId = currentZoneId()): Promise<number> {
  return zoneCtx.run({ sId }, async () => {
    const redis = clientFor(uid);
    const candidates = await redis.zrangebyscore(kApplied(uid), "-inf", `(${Date.now() - APPLIED_RETENTION_MS}`);
    if (candidates.length === 0) { return 0; }
    const keep = new Set<string>();
    for (let i = 0; i < candidates.length; i += 500) {
      const chunk = candidates.slice(i, i + 500);
      const [rows] = await getPool().query<RowDataPacket[]>(
        `SELECT op_id FROM gameplay_outbox
          WHERE user_id = ? AND server_id = ? AND status != ?
            AND op_id IN (${chunk.map(() => "?").join(",")})`,
        [uid, sId, OUTBOX_DONE, ...chunk]);
      for (const r of rows) { keep.add(r.op_id as string); }
    }
    const removable = candidates.filter((id) => !keep.has(id));
    if (keep.size > 0) {
      console.warn(`[outbox] ⚠ applied 裁剪跳过 ${keep.size} 个未完结 op（uid=${uid}, sId=${sId}）——outbox 行滞留 pending/dead，需人工关注`);
    }
    if (removable.length === 0) { return 0; }
    let removed = 0;
    for (let i = 0; i < removable.length; i += 500) {
      const chunk = removable.slice(i, i + 500);
      removed += await redis.zrem(kApplied(uid), ...chunk);
      // payload 绑定是 applied 的伴随元数据，必须与 ZSET 一起清理，避免无界增长。
      await redis.hdel(kAppliedPayload(uid), ...chunk);
    }
    return removed;
  });
}

/**
 * 死信人工处置（09·X6）：**必须走重放**（redisApply 由 applied 去重），
 * ⛔ 禁止手改 status = done。成功后才标 done。
 */
export async function replayDead(opId: string, sId = currentZoneId()): Promise<"ok" | "dup" | "cold" | "missing"> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT user_id, server_id, effect FROM gameplay_outbox WHERE op_id = ? AND server_id = ?", [opId, sId]);
  if (rows.length === 0) { return "missing"; }
  // 后台重放无请求上下文（§3.6 B4）：从行的 server_id 重建区上下文，redisApply 才落对区 Redis 前缀。
  const rowSId = storedInt(rows[0].server_id, "outbox.server_id", { min: 0, max: 65535 });
  const r = await zoneCtx.run({ sId: rowSId }, () =>
    redisApply(rows[0].user_id as string, opId, rows[0].effect as Effect));
  if (r === "ok" || r === "dup") { await markOutboxDone(opId, rowSId); }
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
    pending: optionalCount(rows[0].pending, "outbox.pending"),
    dead: optionalCount(rows[0].dead, "outbox.dead"),
    oldestPendingMs: rows[0].oldest_ms === null || rows[0].oldest_ms === undefined
      ? 0 : storedFinite(rows[0].oldest_ms, "outbox.oldest_ms", { min: 0 }),
  };
}

function optionalCount(raw: unknown, name: string): number {
  return raw === null || raw === undefined ? 0 : storedInt(raw, name, { min: 0, max: Number.MAX_SAFE_INTEGER });
}

/**
 * 保留期清理（OUTBOX_RETENTION_MS 的消费方，09·I5 窗口不等式的前提）：只删 done 行。
 * ⛔ pending（未完成任务）与 dead（死信待人工 replayDead，09·X6）绝不删。
 * 由 relayer 主循环周期调用；幂等，多实例/僵尸并发执行无害（删的是同一批行）。
 */
export async function sweepOutboxRetention(now = Date.now()): Promise<number> {
  const [r] = await getPool().execute<ResultSetHeader>(
    "DELETE FROM gameplay_outbox WHERE status = ? AND created_at < FROM_UNIXTIME(? / 1000)",
    [OUTBOX_DONE, now - OUTBOX_RETENTION_MS]);
  return r.affectedRows;
}
