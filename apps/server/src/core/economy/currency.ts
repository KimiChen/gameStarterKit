/**
 * 货币【权威 = MySQL 同步事务】（09·A2）。
 *
 * ⛔ 禁止在 Redis 对货币做权威增量（HINCRBY coin = 钱会蒸发）；Redis 侧只有
 * `cache:currency:{uid}`（cache 实例、只读、TTL 5m、miss 回源本文件 getBalance）。
 * 写路径全部主键等值定位 + RC 会话（09·DB5）。
 */
import { CUR_GOLD } from "../infra/config";
import { kCacheCurrency, zoneCtx } from "../infra/keys";
import { cacheClient } from "../infra/redisRoute";
import { getPool } from "../infra/mysql";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "../infra/mysql";
import { InsufficientBalanceError, StaleFenceError } from "../errors";

const CACHE_TTL_S = 300; // 5m（模块私有常量；key 分类真源见 core/infra/keys.ts）

/** 读余额：cache 命中直接回；miss 回源 MySQL 并回填（09·A2）。 */
export async function getBalance(uid: string, sId: number, currency = CUR_GOLD): Promise<number> {
  // 自包 zoneCtx：sId 参数同时驱动缓存键（kCacheCurrency per-zone）与 MySQL 谓词，
  // 防「param 与 ambient ALS 不一致 → 读/写错区缓存」（§3.7 C3 同理）。
  return zoneCtx.run({ sId }, async () => {
    const cache = cacheClient();
    const key = kCacheCurrency(uid);
    const hit = await cache.hget(key, String(currency));
    if (hit !== null) { return Number(hit); }
    const [rows] = await getPool().query<RowDataPacket[]>(
      "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?", [uid, sId, currency]);
    const balance = rows.length > 0 ? Number(rows[0].balance) : 0;
    await cache.multi().hset(key, String(currency), String(balance)).expire(key, CACHE_TTL_S).exec();
    return balance;
  });
}

/** 写路径提交后失效缓存（⛔ 不写穿——并发提交的回填顺序无法保证，删了让 miss 回源）。
 *  ⚠ 诚实边界：miss 回源（读旧值）与「提交后失效」之间存在交错窗口——回源在失效之后才
 *  回填的话，旧余额可在 cache 存活至 TTL。只影响展示读：写路径全走 MySQL 守卫，无超支风险。 */
export async function invalidateBalanceCache(uid: string, sId: number): Promise<void> {
  await zoneCtx.run({ sId }, () => cacheClient().unlink(kCacheCurrency(uid))); // sId 驱动缓存键（§3.7 C3）
}

/**
 * 扣款（事务内使用）：ledger ODKU 去重 → 余额守卫 + fence 守卫 UPDATE → 回读新余额
 * 补 ledger.balance_after。返回 'DUP'（幂等命中，事务内零写入）或新余额。
 *
 * 0 行时按 07 建议拆两种异常：回读余额 → 足 = fence 被抬高（STALE_FENCE 自动重试）、
 * 不足 = INSUFFICIENT_BALANCE（引导充值）。两者都抛 → 整个事务 ROLLBACK，干净失败。
 */
export async function debitInTx(
  conn: PoolConnection,
  uid: string, sId: number, currency: number, amount: number, fence: number, opId: string, reason: string,
): Promise<"DUP" | number> {
  if (amount <= 0) { throw new Error(`扣款金额必须为正: ${amount}`); }
  // ⚠ 每区独立经济（DUAL_MODE §3.3 B1）：谓词/INSERT 必须带 server_id，否则跨区命中/扣错区钱包。
  const [led] = await conn.execute<ResultSetHeader>(
    `INSERT INTO currency_ledger (user_id, server_id, currency, delta, balance_after, idem_key, reason)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE id = id`,      // ⛔ 绝不 INSERT IGNORE（09·DB1）
    [uid, sId, currency, -amount, 0, opId, reason]);
  if (led.affectedRows === 0) { return "DUP"; }

  const [upd] = await conn.execute<ResultSetHeader>(
    `UPDATE user_currency
        SET balance = balance - ?, version = version + 1, last_fence = ?
      WHERE user_id = ? AND server_id = ? AND currency = ? AND balance >= ? AND last_fence <= ?`,
    [amount, fence, uid, sId, currency, amount, fence]);
  if (upd.affectedRows === 0) {
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?", [uid, sId, currency]);
    const bal = rows.length > 0 ? Number(rows[0].balance) : 0;
    if (bal >= amount) { throw new StaleFenceError(); } // 余额够 → 是 fence 被抬高（P6 僵尸写被拦）
    throw new InsufficientBalanceError();
  }

  const [after] = await conn.query<RowDataPacket[]>(
    "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?", [uid, sId, currency]);
  const newBalance = Number(after[0].balance);
  await conn.execute<ResultSetHeader>(
    "UPDATE currency_ledger SET balance_after = ? WHERE user_id = ? AND server_id = ? AND idem_key = ?",
    [newBalance, uid, sId, opId]);
  return newBalance;
}

/**
 * 入账（事务内使用；充值发币 / 发奖 / 冲正回补）：ledger ODKU 去重 → upsert 余额。
 * 无余额守卫（正向），无 fence 守卫（充值回调不在 withUser 锁内，幂等靠 ledger
 * `UNIQUE(user_id, server_id, idem_key)`——op_id 已编码 sId，跨区同 idem 并存，DUAL_MODE §3.4 D1/D2）。
 */
export async function creditInTx(
  conn: PoolConnection,
  uid: string, sId: number, currency: number, amount: number, opId: string, reason: string,
): Promise<"DUP" | number> {
  if (amount <= 0) { throw new Error(`入账金额必须为正: ${amount}`); }
  // ⚠ 每区独立经济（§3.3 B1）：INSERT 列表与 ODKU 匹配键必须含 server_id，否则充值落 s0 影子钱包、玩家不到账。
  const [led] = await conn.execute<ResultSetHeader>(
    `INSERT INTO currency_ledger (user_id, server_id, currency, delta, balance_after, idem_key, reason)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE id = id`,
    [uid, sId, currency, amount, 0, opId, reason]);
  if (led.affectedRows === 0) { return "DUP"; }

  await conn.execute<ResultSetHeader>(
    `INSERT INTO user_currency (user_id, server_id, currency, balance) VALUES (?,?,?,?) AS new
     ON DUPLICATE KEY UPDATE balance = user_currency.balance + new.balance, version = version + 1`,
    [uid, sId, currency, amount]); // 行别名 AS new 需 8.0.19+（05；VALUES() 已弃用）
  const [after] = await conn.query<RowDataPacket[]>(
    "SELECT balance FROM user_currency WHERE user_id = ? AND server_id = ? AND currency = ?", [uid, sId, currency]);
  const newBalance = Number(after[0].balance);
  await conn.execute<ResultSetHeader>(
    "UPDATE currency_ledger SET balance_after = ? WHERE user_id = ? AND server_id = ? AND idem_key = ?",
    [newBalance, uid, sId, opId]);
  return newBalance;
}
