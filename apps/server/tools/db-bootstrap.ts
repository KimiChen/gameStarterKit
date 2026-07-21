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

async function main(): Promise<void> {
  const url = new URL(MYSQL_URL());
  const dbName = url.pathname.replace(/^\//, "") || "game";

  // 先不带库名连，建库
  const admin = await mysql.createConnection({
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
  const [rows] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
  console.log(`✅ ${dbName} 就绪，共 ${rows.length} 张表:`, rows.map((r) => Object.values(r)[0]).join(", "));
  await conn.end();
}

main().catch((e) => { console.error("❌ bootstrap 失败", e); process.exit(1); });
