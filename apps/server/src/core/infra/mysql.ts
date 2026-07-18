/**
 * MySQL 连接池与事务纪律（[05 · MySQL 8.0 表与写法](docs/SERVER.md)）。
 *
 * - 无 RETURNING：自增用 `result.insertId`，CAS 用 `affectedRows`（09·DB2）。
 * - 货币 / outbox / 转账会话切 READ COMMITTED（前提 binlog_format=ROW，09·DB5）——
 *   用 `SET TRANSACTION`（不带 SESSION），只作用于下一个事务，不污染池化连接。
 * - 死锁 1213 / 锁等待超时 1205 → 指数退避重试（09·DB5）。
 */
import mysql from "mysql2/promise";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { MYSQL_POOL_SIZE, MYSQL_URL } from "./config";

export type { PoolConnection, ResultSetHeader, RowDataPacket };

let pool: Pool | null = null;

/** 监控用：仅返回已创建的池（⛔ 不触发建池——无栈环境下监控不应拉起连接）。 */
export function getPoolIfCreated(): Pool | null { return pool; }

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: MYSQL_URL(),
      connectionLimit: MYSQL_POOL_SIZE,
      // JSON 列会被自动解析成对象（09·DB8）——传 Lua 前必须 stringify，统一在 redisApply 内做
      supportBigNumbers: true,
      bigNumberStrings: false,
      // ⚠ mysql2 默认带 CLIENT_FOUND_ROWS：ODKU 命中重复也报 affectedRows=1（matched 语义），
      // 会击穿全部「插入=1/重复=0」幂等判断（09·DB2 / 05）。显式关掉，恢复 changed 语义
      flags: ["-FOUND_ROWS"],
    });
  }
  return pool;
}

/** 默认（REPEATABLE READ）事务。 */
export async function withTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return runTx(fn, false);
}

/** READ COMMITTED 事务：货币 / outbox / 转账写路径专用（09·DB5，避免 RR 间隙锁死锁风暴）。 */
export async function withRcTx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  return runTx(fn, true);
}

async function runTx<T>(fn: (conn: PoolConnection) => Promise<T>, rc: boolean): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    if (rc) {
      // 不带 SESSION：仅影响下一个事务，连接归还池后不残留隔离级别
      await conn.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    }
    await conn.beginTransaction();
    try {
      const r = await fn(conn);
      await conn.commit();
      return r;
    } catch (e) {
      await conn.rollback().catch(() => { /* 回滚失败时原始异常优先 */ });
      throw e;
    }
  } finally {
    conn.release();
  }
}

const isRetryable = (e: unknown): boolean =>
  typeof e === "object" && e !== null &&
  ((e as { errno?: number }).errno === 1213 || (e as { errno?: number }).errno === 1205);

/** 捕获 1213（死锁）/ 1205（锁等待超时）指数退避重试。仅包**幂等**的事务体。 */
export async function retryOnContention<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isRetryable(e)) { throw e; }
      lastErr = e;
      await new Promise((r) => setTimeout(r, 50 * 2 ** i + Math.random() * 50));
    }
  }
  throw lastErr;
}

/**
 * 单调发号（`seq` 表，仅用于 user_id）。
 * ⚠ 两条语句必须同一根物理连接（09·DB2：LAST_INSERT_ID 是连接局部的）。
 * ⚠ 行必须已预置（schema.sql），惰性 ODKU 建行首次采番是错的（05）。
 */
export async function nextSeq(name: string): Promise<number> {
  const conn = await getPool().getConnection();
  try {
    const [r] = await conn.execute<ResultSetHeader>(
      "UPDATE seq SET val = LAST_INSERT_ID(val + 1) WHERE name = ?", [name]);
    if (r.affectedRows === 0) { throw new Error(`seq 行缺失: ${name}（schema.sql 必须预置）`); }
    const [rows] = await conn.query<RowDataPacket[]>("SELECT LAST_INSERT_ID() AS v");
    return Number(rows[0].v);
  } finally {
    conn.release();
  }
}

/** 测试/停服。 */
export async function closeMysql(): Promise<void> {
  await pool?.end();
  pool = null;
}
