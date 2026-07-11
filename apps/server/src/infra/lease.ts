/**
 * `singleton_lease` 抢占 / 续租（[05 · singleton_lease](../../../../docs/server/05-mysql8-schema.md#singleton_leaserelayer--赛季轮换的领导权)）。
 *
 * relayer / freeze worker / 赛季轮换都是**单例**（09·X7）：
 * - 抢占：`expires_at < NOW(3)` 才能抢，`fence_token` 单调 +1。
 * - 续租守卫必须与业务批写**同一个 MySQL 事务**、守卫作第一句、0 行即 ROLLBACK 自杀。
 * - ⛔ 禁止 `GET_LOCK`（连接作用域，连接池下泄漏）。
 */
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { LEASE_TTL_S } from "./config";
import { getPool, withRcTx } from "./mysql";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "./mysql";

/** 实例标识：主机+pid+随机，重启后是新 holder。 */
export const makeHolderId = (): string =>
  `${hostname()}:${process.pid}:${randomBytes(3).toString("hex")}`.slice(0, 64);

export interface SingletonLease {
  readonly leaseName: string;
  readonly holder: string;
  readonly fenceToken: number;
}

/** 尝试抢占（过期才能抢）。抢到返回 lease（含回读的 fence_token），否则 null。 */
export async function tryAcquireLease(leaseName: string, holder: string, ttlS = LEASE_TTL_S): Promise<SingletonLease | null> {
  const pool = getPool();
  const [r] = await pool.execute<ResultSetHeader>(
    `UPDATE singleton_lease
        SET holder = ?, fence_token = fence_token + 1,
            expires_at = NOW(3) + INTERVAL ? SECOND
      WHERE lease_name = ? AND expires_at < NOW(3)`,
    [holder, ttlS, leaseName]);
  if (r.affectedRows === 0) { return null; }
  // MySQL 无 RETURNING（09·DB2）——回读 fence_token
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT fence_token FROM singleton_lease WHERE lease_name = ?", [leaseName]);
  return { leaseName, holder, fenceToken: Number(rows[0].fence_token) };
}

/**
 * 续租守卫：**必须是事务第一句**。返回 false = 已被顶替 → 调用方立即 ROLLBACK 并自杀，
 * ⛔ 绝不继续往下写业务表（僵尸 leader 双写，02·P6）。
 */
export async function renewLeaseGuard(conn: PoolConnection, lease: SingletonLease, ttlS = LEASE_TTL_S): Promise<boolean> {
  const [r] = await conn.execute<ResultSetHeader>(
    `UPDATE singleton_lease
        SET expires_at = NOW(3) + INTERVAL ? SECOND
      WHERE lease_name = ? AND holder = ? AND fence_token = ?`,
    [ttlS, lease.leaseName, lease.holder, lease.fenceToken]);
  return r.affectedRows === 1;
}

/** 僵尸自杀异常：守卫 0 行时抛出，worker 主循环捕获后退出进程。 */
export class LeaseLostError extends Error {
  constructor(leaseName: string) { super(`singleton_lease 已被顶替: ${leaseName}`); this.name = "LeaseLostError"; }
}

/**
 * 「续租守卫 + 业务批写」样板：RC 事务内守卫第一句，0 行抛 LeaseLostError（自动 ROLLBACK）。
 * 纯续租（无业务写）也走这里，fn 传空函数即可。
 */
export async function withLeaseTx<T>(lease: SingletonLease, fn: (conn: PoolConnection) => Promise<T>, ttlS = LEASE_TTL_S): Promise<T> {
  return withRcTx(async (conn) => {
    if (!await renewLeaseGuard(conn, lease, ttlS)) { throw new LeaseLostError(lease.leaseName); }
    return fn(conn);
  });
}
