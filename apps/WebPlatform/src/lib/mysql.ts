/**
 * WebPlatform 的 MySQL 连接池（MySQL-only 服务，⛔ 无 Redis）。
 *
 * - **dev/test 内嵌**：apps/server 通过 `useServerPool` 注入自己的池 getter，lib 与 server **共用一个池**
 *   （否则双池 → 测试进程退出时多出的连接句柄让 node 挂住不退）。
 * - **prod split**：不注入，`getPool` 用自建池（`WEBPLATFORM_MYSQL_URL`，独立库）。
 */
import mysql from "mysql2/promise";
import { WEBPLATFORM_MYSQL_URL } from "../config";

let pool: mysql.Pool | null = null;
let serverPoolGetter: (() => mysql.Pool) | null = null;

/** 内嵌模式：注入 apps/server 的池 getter，避免双池。split 模式不调。 */
export function useServerPool(getter: () => mysql.Pool): void { serverPoolGetter = getter; }

/** 惰性单例池（注入了 server 池则用之）。 */
export function getPool(): mysql.Pool {
  if (serverPoolGetter) { return serverPoolGetter(); }
  if (!pool) { pool = mysql.createPool(WEBPLATFORM_MYSQL_URL()); }
  return pool;
}

export type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
