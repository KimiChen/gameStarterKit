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

interface ColumnShape extends mysql.RowDataPacket {
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | number | null;
}

interface IndexShape extends mysql.RowDataPacket {
  SEQ_IN_INDEX: number;
  COLUMN_NAME: string;
  SUB_PART: number | null;
  NON_UNIQUE: number;
  INDEX_TYPE: string;
  COLLATION: string | null;
}

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

/** INFORMATION_SCHEMA 中读取并验证 match_results.server_id。
 *
 * ⛔ 不能只吞 ER_DUP_FIELDNAME(1060)：若存量库里碰巧已有同名但类型/NULL/default 不同的列，
 * 静默当成「已迁」会让旧行或后续写入产生另一套语义。 */
async function verifyMatchServerIdColumn(conn: mysql.Connection, dbName: string): Promise<boolean> {
  const [rows] = await conn.query<ColumnShape[]>(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'match_results' AND COLUMN_NAME = 'server_id'`,
    [dbName],
  );
  if (rows.length === 0) { return false; }
  if (rows.length !== 1) {
    throw new Error(`match_results.server_id 定义异常：INFORMATION_SCHEMA 返回 ${rows.length} 行`);
  }
  const c = rows[0];
  const ok = c.DATA_TYPE.toLowerCase() === "int"
    && c.COLUMN_TYPE.toLowerCase() === "int unsigned"
    && c.IS_NULLABLE === "NO"
    && String(c.COLUMN_DEFAULT) === "0";
  if (!ok) {
    throw new Error(
      "match_results.server_id 定义不匹配：期望 INT UNSIGNED NOT NULL DEFAULT 0，"
      + `实际 DATA_TYPE=${c.DATA_TYPE} COLUMN_TYPE=${c.COLUMN_TYPE} `
      + `IS_NULLABLE=${c.IS_NULLABLE} COLUMN_DEFAULT=${String(c.COLUMN_DEFAULT)}`,
    );
  }
  return true;
}

/** INFORMATION_SCHEMA 中读取并验证 idx_zone_time 的完整定义。
 *
 * ⛔ 不能粗暴吞 ER_DUP_KEYNAME(1061)：同名索引可能列反了、带前缀、变成 UNIQUE 或不是 BTREE；
 * 那些都不满足按区 + 时间扫描/关区删除的契约。 */
async function verifyMatchZoneIndex(conn: mysql.Connection, dbName: string): Promise<boolean> {
  const [rows] = await conn.query<IndexShape[]>(
    `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'match_results' AND INDEX_NAME = 'idx_zone_time'
      ORDER BY SEQ_IN_INDEX`,
    [dbName],
  );
  if (rows.length === 0) { return false; }
  const expected = ["server_id", "created_at"];
  const ok = rows.length === expected.length && rows.every((r, i) =>
    Number(r.SEQ_IN_INDEX) === i + 1
    && r.COLUMN_NAME === expected[i]
    && r.SUB_PART === null
    && Number(r.NON_UNIQUE) === 1
    && r.INDEX_TYPE.toUpperCase() === "BTREE"
    && r.COLLATION === "A");
  if (!ok) {
    const actual = rows.map((r) =>
      `${String(r.SEQ_IN_INDEX)}:${r.COLUMN_NAME}`
      + `(sub=${String(r.SUB_PART)},nonUnique=${String(r.NON_UNIQUE)},`
      + `type=${r.INDEX_TYPE},collation=${String(r.COLLATION)})`).join(", ");
    throw new Error(
      "match_results.idx_zone_time 定义不匹配："
      + "期望 BTREE NON-UNIQUE (server_id ASC, created_at ASC)，"
      + `实际 [${actual}]`,
    );
  }
  return true;
}

/** M13/U6 对局区列迁移。
 *
 * DB7：
 * - ADD COLUMN 不指定 AFTER，刻意追加到末尾，使 MySQL 8.0.19+ 可走 ALGORITHM=INSTANT；
 *   列顺序不是契约，fresh schema 与存量升级后的物理顺序允许不同。
 * - 二级索引无法 INSTANT，显式 INPLACE + LOCK=NONE，避免阻塞在线 DML；生产大表仍应由 E2
 *   migration/gh-ost playbook 预建，bootstrap 随后只做 INFORMATION_SCHEMA 校验。
 * - 每一步前后都查真定义，进程在两步间崩溃后重跑也可收敛。 */
async function ensureMatchResultsZoneShape(conn: mysql.Connection, dbName: string): Promise<void> {
  if (!(await verifyMatchServerIdColumn(conn, dbName))) {
    await conn.query(
      `ALTER TABLE match_results
         ADD COLUMN server_id INT UNSIGNED NOT NULL DEFAULT 0,
         ALGORITHM=INSTANT`,
    );
    await verifyMatchServerIdColumn(conn, dbName);
  }

  if (!(await verifyMatchZoneIndex(conn, dbName))) {
    await conn.query(
      `ALTER TABLE match_results
         ADD KEY idx_zone_time (server_id, created_at),
         ALGORITHM=INPLACE, LOCK=NONE`,
    );
    await verifyMatchZoneIndex(conn, dbName);
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
  // 对局按区（DUAL_MODE §4.1）：fresh schema、c8 存量首次升级、任意中断后的重跑均须收敛；
  // 具体定义由 INFORMATION_SCHEMA 校验，⛔ 不靠吞 1060/1061 猜「大概已经有了」。
  await ensureMatchResultsZoneShape(conn, dbName);

  // 存量清理：排行榜演示移除后遗留的 season_rotation 租约行（新库 schema 已不再预置；幂等）
  await conn.query("DELETE FROM singleton_lease WHERE lease_name = 'season_rotation'");
  const [rows] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
  console.log(`✅ ${dbName} 就绪，共 ${rows.length} 张表:`, rows.map((r) => Object.values(r)[0]).join(", "));
  await conn.end();
}

main().catch((e) => { console.error("❌ bootstrap 失败", e); process.exit(1); });
