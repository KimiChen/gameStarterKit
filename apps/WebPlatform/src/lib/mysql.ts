/**
 * WebPlatform 自己的 MySQL 连接池（MySQL-only 服务，⛔ 无 Redis）。
 * 与 apps/server 的池物理独立：dev/test 内嵌时指同一库、split 时指自己的库。
 */
import mysql from "mysql2/promise";
import { WEBPLATFORM_MYSQL_URL } from "../config";

let pool: mysql.Pool | null = null;

/** 惰性单例池。 */
export function getPool(): mysql.Pool {
  if (!pool) { pool = mysql.createPool(WEBPLATFORM_MYSQL_URL()); }
  return pool;
}

export type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
