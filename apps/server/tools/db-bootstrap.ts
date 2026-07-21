/**
 * 建库 + 执行 sql/schema.sql（幂等，可重复跑）。
 * 用法: npm --workspace @game/server run db:bootstrap
 * 连接目标取 MYSQL_URL（缺省 mysql://root@127.0.0.1:3316/game_<PROJECT_ID>，对齐 tools/dev-stack.sh）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { MYSQL_URL } from "../src/core/infra/config";

const here = dirname(fileURLToPath(import.meta.url));

/** 首连瞬态重试：mysql 容器初始化的「临时服务器→真服务器」重启窗口、本地栈刚起等场景，
 *  连接会被对端关闭/拒绝——固定次数短退避重试，非瞬态错误（如认证失败）立即上抛。 */
const TRANSIENT = new Set(["PROTOCOL_CONNECTION_LOST", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT"]);
async function connectWithRetry(opts: Parameters<typeof mysql.createConnection>[0], tries = 10): Promise<mysql.Connection> {
  for (let i = 1; ; i++) {
    try {
      return await mysql.createConnection(opts);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (!TRANSIENT.has(code) || i >= tries) { throw e; }
      console.log(`  MySQL 未就绪（${code}），${i}/${tries} 次重试…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main(): Promise<void> {
  const url = new URL(MYSQL_URL());
  const dbName = url.pathname.replace(/^\//, "") || "game";

  // 先不带库名连，建库
  const admin = await connectWithRetry({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
  });
  await admin.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARSET utf8mb4`);
  await admin.end();

  const conn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
    database: dbName,
    multipleStatements: true,
  });
  const ddl = readFileSync(join(here, "..", "sql", "schema.sql"), "utf8");
  await conn.query(ddl);

  // 增量列迁移（幂等：1060 重复列即已迁）。CREATE IF NOT EXISTS 不会给存量表加新列
  const alters = [
    "ALTER TABLE mail ADD COLUMN attach_effect JSON NULL AFTER attach_op_id",
  ];
  for (const sql of alters) {
    await conn.query(sql).catch((e: { errno?: number }) => {
      if (e.errno !== 1060) { throw e; }
    });
  }
  // 存量清理：排行榜演示移除后遗留的 season_rotation 租约行（新库 schema 已不再预置；幂等）
  await conn.query("DELETE FROM singleton_lease WHERE lease_name = 'season_rotation'");
  const [rows] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
  console.log(`✅ ${dbName} 就绪，共 ${rows.length} 张表:`, rows.map((r) => Object.values(r)[0]).join(", "));
  await conn.end();
}

main().catch((e) => { console.error("❌ bootstrap 失败", e); process.exit(1); });
