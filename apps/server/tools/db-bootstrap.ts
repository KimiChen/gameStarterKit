/**
 * 建库 + 执行 sql/schema.sql（幂等，可重复跑）+ kit SQL 迁移（账本驱动，tools/kit-migrations.ts，docs/KIT.md §5）。
 * 用法: npm --workspace @game/server run db:bootstrap
 * 连接目标取 MYSQL_URL（缺省 mysql://root@127.0.0.1:3316/game_<PROJECT_ID>，对齐 tools/dev-stack.sh）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { MYSQL_URL } from "../src/core/infra/config";
import { SERVER_KIT_CATALOG } from "../src/kits/catalog.generated";
import { applyKitMigrations } from "./kit-migrations";

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

interface TableShape extends mysql.RowDataPacket {
  TABLE_NAME: string;
  ENGINE: string | null;
}

interface FullColumnShape extends ColumnShape {
  COLUMN_NAME: string;
  ORDINAL_POSITION: number;
  EXTRA: string;
}

interface ArchiveProtocolColumnShape extends ColumnShape {
  CHARACTER_SET_NAME: string | null;
  COLLATION_NAME: string | null;
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

/** INFORMATION_SCHEMA 中读取并验证 match_results.schema_version。
 *
 * 同 server_id 的理由：⛔ 不能只吞 ER_DUP_FIELDNAME(1060)。这一列比 server_id 更不能将就——
 * 它是读取方决定「拿哪套 verifier 解 payload」的依据，若存量库里同名列可空或默认值不是 0，
 * 未标注的历史行会被当成某个具体版本去解，比不解读更危险。 */
async function verifyMatchSchemaVersionColumn(conn: mysql.Connection, dbName: string): Promise<boolean> {
  const [rows] = await conn.query<ColumnShape[]>(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'match_results' AND COLUMN_NAME = 'schema_version'`,
    [dbName],
  );
  if (rows.length === 0) { return false; }
  if (rows.length !== 1) {
    throw new Error(`match_results.schema_version 定义异常：INFORMATION_SCHEMA 返回 ${rows.length} 行`);
  }
  const c = rows[0];
  const ok = c.DATA_TYPE.toLowerCase() === "tinyint"
    && c.COLUMN_TYPE.toLowerCase() === "tinyint unsigned"
    && c.IS_NULLABLE === "NO"
    && String(c.COLUMN_DEFAULT) === "0";
  if (!ok) {
    throw new Error(
      "match_results.schema_version 定义不匹配：期望 TINYINT UNSIGNED NOT NULL DEFAULT 0，"
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

  // schema_version 与 server_id 同批：都是不指定 AFTER 的 INSTANT 加列，彼此独立，
  // 任一步崩溃后重跑都从「查真定义」重新判断，不依赖前一步的结果。
  if (!(await verifyMatchSchemaVersionColumn(conn, dbName))) {
    await conn.query(
      `ALTER TABLE match_results
         ADD COLUMN schema_version TINYINT UNSIGNED NOT NULL DEFAULT 0,
         ALGORITHM=INSTANT`,
    );
    await verifyMatchSchemaVersionColumn(conn, dbName);
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

const ARCHIVE_ZONE_TABLES = ["user_archive", "user_snapshot_readonly"] as const;
const ARCHIVE_TABLES = [...ARCHIVE_ZONE_TABLES, "archive_zone_usage"] as const;
type ArchiveZoneTable = typeof ARCHIVE_ZONE_TABLES[number];
type ArchiveTable = typeof ARCHIVE_TABLES[number];

async function existingArchiveTables(
  conn: mysql.Connection,
  dbName: string,
): Promise<Set<ArchiveTable>> {
  const [rows] = await conn.query<TableShape[]>(
    `SELECT TABLE_NAME, ENGINE
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?)`,
    [dbName, ...ARCHIVE_TABLES],
  );
  const byName = new Map(rows.map((row) => [row.TABLE_NAME, row.ENGINE]));
  const existing = new Set<ArchiveTable>();
  for (const tableName of ARCHIVE_TABLES) {
    const engine = byName.get(tableName);
    if (engine === undefined) { continue; }
    if (engine?.toLowerCase() !== "innodb") {
      throw new Error(`${tableName}.ENGINE 定义不匹配：期望 InnoDB，实际 ${engine ?? "missing"}`);
    }
    existing.add(tableName);
  }
  return existing;
}

async function verifyArchiveTableEngines(conn: mysql.Connection, dbName: string): Promise<void> {
  const existing = await existingArchiveTables(conn, dbName);
  for (const tableName of ARCHIVE_TABLES) {
    if (!existing.has(tableName)) {
      throw new Error(`${tableName}.ENGINE 定义不匹配：期望 InnoDB，实际 missing`);
    }
  }
}

async function verifyArchiveServerIdColumn(
  conn: mysql.Connection,
  dbName: string,
  tableName: ArchiveZoneTable,
): Promise<boolean> {
  const [rows] = await conn.query<ColumnShape[]>(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'server_id'`,
    [dbName, tableName],
  );
  if (rows.length === 0) { return false; }
  if (rows.length !== 1) {
    throw new Error(`${tableName}.server_id 定义异常：INFORMATION_SCHEMA 返回 ${rows.length} 行`);
  }
  const column = rows[0];
  const valid = column.DATA_TYPE.toLowerCase() === "smallint"
    && column.COLUMN_TYPE.toLowerCase() === "smallint unsigned"
    && column.IS_NULLABLE === "NO"
    && String(column.COLUMN_DEFAULT) === "0";
  if (!valid) {
    throw new Error(
      `${tableName}.server_id 定义不匹配：期望 SMALLINT UNSIGNED NOT NULL DEFAULT 0，`
      + `实际 DATA_TYPE=${column.DATA_TYPE} COLUMN_TYPE=${column.COLUMN_TYPE} `
      + `IS_NULLABLE=${column.IS_NULLABLE} COLUMN_DEFAULT=${String(column.COLUMN_DEFAULT)}`,
    );
  }
  return true;
}

async function archivePrimaryKeyColumns(
  conn: mysql.Connection,
  dbName: string,
  tableName: ArchiveZoneTable,
): Promise<string[]> {
  const [rows] = await conn.query<IndexShape[]>(
    `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
      ORDER BY SEQ_IN_INDEX`,
    [dbName, tableName],
  );
  const structurallyValid = rows.length > 0 && rows.every((row, index) =>
    Number(row.SEQ_IN_INDEX) === index + 1
    && row.SUB_PART === null
    && Number(row.NON_UNIQUE) === 0
    && row.INDEX_TYPE.toUpperCase() === "BTREE"
    && row.COLLATION === "A");
  if (!structurallyValid) {
    throw new Error(`${tableName}.PRIMARY 定义不匹配：只接受 legacy (user_id) 或目标 (user_id, server_id)`);
  }
  return rows.map((row) => row.COLUMN_NAME);
}

async function archivePrimaryKeyKind(
  conn: mysql.Connection,
  dbName: string,
  tableName: ArchiveZoneTable,
): Promise<"legacy" | "target"> {
  const columns = await archivePrimaryKeyColumns(conn, dbName, tableName);
  if (columns.length === 1 && columns[0] === "user_id") { return "legacy"; }
  if (columns.length === 2 && columns[0] === "user_id" && columns[1] === "server_id") {
    return "target";
  }
  throw new Error(
    `${tableName}.PRIMARY 定义不匹配：只接受 legacy (user_id) 或目标 (user_id, server_id)，`
    + `实际 (${columns.join(", ")})`,
  );
}

async function ensureArchivePrimaryKey(
  conn: mysql.Connection,
  dbName: string,
  tableName: ArchiveZoneTable,
): Promise<void> {
  if ((await archivePrimaryKeyKind(conn, dbName, tableName)) === "target") { return; }
  // DROP + ADD in one ALTER is the atomic identity transition. Rows created
  // before zone isolation retain server_id=0 from the verified column default.
  await conn.query(
    `ALTER TABLE ${tableName}
       DROP PRIMARY KEY,
       ADD PRIMARY KEY (user_id, server_id)`,
  );
  const upgraded = await archivePrimaryKeyColumns(conn, dbName, tableName);
  if (upgraded.length !== 2 || upgraded[0] !== "user_id" || upgraded[1] !== "server_id") {
    throw new Error(`${tableName}.PRIMARY 升级后校验失败`);
  }
}

async function archiveFrozenIndexKind(
  conn: mysql.Connection,
  dbName: string,
): Promise<"legacy" | "target"> {
  const [rows] = await conn.query<IndexShape[]>(
    `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive' AND INDEX_NAME = 'idx_frozen'
      ORDER BY SEQ_IN_INDEX`,
    [dbName],
  );
  const validShape = (columns: readonly string[]): boolean => rows.length === columns.length
    && rows.every((row, index) =>
      Number(row.SEQ_IN_INDEX) === index + 1
      && row.COLUMN_NAME === columns[index]
      && row.SUB_PART === null
      && Number(row.NON_UNIQUE) === 1
      && row.INDEX_TYPE.toUpperCase() === "BTREE"
      && row.COLLATION === "A");
  if (validShape(["frozen_at"])) { return "legacy"; }
  if (validShape(["server_id", "frozen_at", "user_id"])) { return "target"; }
  const actual = rows.map((row) => row.COLUMN_NAME).join(", ");
  throw new Error(
    "user_archive.idx_frozen 定义不匹配：只接受 legacy (frozen_at) 或目标 "
    + `(server_id, frozen_at, user_id)，实际 (${actual || "missing"})`,
  );
}

async function ensureArchiveZoneShape(conn: mysql.Connection, dbName: string): Promise<void> {
  for (const tableName of ARCHIVE_ZONE_TABLES) {
    if (!(await verifyArchiveServerIdColumn(conn, dbName, tableName))) {
      await conn.query(
        `ALTER TABLE ${tableName}
           ADD COLUMN server_id SMALLINT UNSIGNED NOT NULL DEFAULT 0,
           ALGORITHM=INPLACE, LOCK=NONE`,
      );
      await verifyArchiveServerIdColumn(conn, dbName, tableName);
    }
    await ensureArchivePrimaryKey(conn, dbName, tableName);
  }

  if ((await archiveFrozenIndexKind(conn, dbName)) === "legacy") {
    await conn.query(
      `ALTER TABLE user_archive
         DROP KEY idx_frozen,
         ADD KEY idx_frozen (server_id, frozen_at, user_id)`,
    );
    if ((await archiveFrozenIndexKind(conn, dbName)) !== "target") {
      throw new Error("user_archive.idx_frozen 升级后校验失败");
    }
  }
}

async function verifyArchiveProtocolColumn(
  conn: mysql.Connection,
  dbName: string,
  columnName: "freeze_id" | "archive_phase",
): Promise<boolean> {
  const [rows] = await conn.query<ArchiveProtocolColumnShape[]>(
    `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
            CHARACTER_SET_NAME, COLLATION_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive' AND COLUMN_NAME = ?`,
    [dbName, columnName],
  );
  if (rows.length === 0) { return false; }
  if (rows.length !== 1) {
    throw new Error(`user_archive.${columnName} 定义异常：INFORMATION_SCHEMA 返回 ${rows.length} 行`);
  }
  const column = rows[0];
  const valid = columnName === "freeze_id"
    ? column.DATA_TYPE.toLowerCase() === "char"
      && column.COLUMN_TYPE.toLowerCase() === "char(36)"
      && column.IS_NULLABLE === "YES"
      && column.COLUMN_DEFAULT === null
      && column.CHARACTER_SET_NAME?.toLowerCase() === "ascii"
      && column.COLLATION_NAME?.toLowerCase() === "ascii_bin"
    : column.DATA_TYPE.toLowerCase() === "tinyint"
      && column.COLUMN_TYPE.toLowerCase() === "tinyint unsigned"
      && column.IS_NULLABLE === "NO"
      && String(column.COLUMN_DEFAULT) === "0"
      && column.CHARACTER_SET_NAME === null
      && column.COLLATION_NAME === null;
  if (!valid) {
    throw new Error(
      `user_archive.${columnName} 定义不匹配：实际 DATA_TYPE=${column.DATA_TYPE}`
      + ` COLUMN_TYPE=${column.COLUMN_TYPE} IS_NULLABLE=${column.IS_NULLABLE}`
      + ` COLUMN_DEFAULT=${String(column.COLUMN_DEFAULT)}`
      + ` CHARSET=${String(column.CHARACTER_SET_NAME)} COLLATION=${String(column.COLLATION_NAME)}`,
    );
  }
  return true;
}

async function verifyArchiveFreezeIdIndex(conn: mysql.Connection, dbName: string): Promise<boolean> {
  const [rows] = await conn.query<IndexShape[]>(
    `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive'
        AND INDEX_NAME = 'uk_archive_freeze_id'
      ORDER BY SEQ_IN_INDEX`,
    [dbName],
  );
  if (rows.length === 0) { return false; }
  const valid = rows.length === 1
    && Number(rows[0].SEQ_IN_INDEX) === 1
    && rows[0].COLUMN_NAME === "freeze_id"
    && rows[0].SUB_PART === null
    && Number(rows[0].NON_UNIQUE) === 0
    && rows[0].INDEX_TYPE.toUpperCase() === "BTREE"
    && rows[0].COLLATION === "A";
  if (!valid) {
    throw new Error(
      "user_archive.uk_archive_freeze_id 定义不匹配：期望 BTREE UNIQUE (freeze_id)，实际 ("
      + `${rows.map((row) => row.COLUMN_NAME).join(", ") || "missing"})`,
    );
  }
  return true;
}

async function ensureArchiveProtocolShape(conn: mysql.Connection, dbName: string): Promise<void> {
  if (!(await verifyArchiveProtocolColumn(conn, dbName, "freeze_id"))) {
    // user_archive intentionally uses ROW_FORMAT=COMPRESSED; MySQL 8.4 rejects
    // INSTANT ADD COLUMN for that row format. Keep the migration online and
    // explicit instead of allowing an implicit blocking COPY fallback.
    await conn.query(
      `ALTER TABLE user_archive
         ADD COLUMN freeze_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
         ALGORITHM=INPLACE, LOCK=NONE`,
    );
    await verifyArchiveProtocolColumn(conn, dbName, "freeze_id");
  }
  if (!(await verifyArchiveProtocolColumn(conn, dbName, "archive_phase"))) {
    await conn.query(
      `ALTER TABLE user_archive
         ADD COLUMN archive_phase TINYINT UNSIGNED NOT NULL DEFAULT 0,
         ALGORITHM=INPLACE, LOCK=NONE`,
    );
    await verifyArchiveProtocolColumn(conn, dbName, "archive_phase");
  }
  if (!(await verifyArchiveFreezeIdIndex(conn, dbName))) {
    await conn.query("ALTER TABLE user_archive ADD UNIQUE KEY uk_archive_freeze_id (freeze_id)");
    await verifyArchiveFreezeIdIndex(conn, dbName);
  }
}

async function verifyArchiveUsageLedgerShape(conn: mysql.Connection, dbName: string): Promise<void> {
  const [columns] = await conn.query<FullColumnShape[]>(
    `SELECT COLUMN_NAME, ORDINAL_POSITION, DATA_TYPE, COLUMN_TYPE,
            IS_NULLABLE, COLUMN_DEFAULT, EXTRA
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'archive_zone_usage'
      ORDER BY ORDINAL_POSITION`,
    [dbName],
  );
  const expected = [
    { name: "server_id", dataType: "smallint", columnType: "smallint unsigned", defaultValue: null },
    { name: "row_count", dataType: "bigint", columnType: "bigint unsigned", defaultValue: "0" },
    { name: "byte_count", dataType: "bigint", columnType: "bigint unsigned", defaultValue: "0" },
    { name: "updated_at", dataType: "datetime", columnType: "datetime(3)", defaultValue: "current_timestamp(3)" },
  ] as const;
  const validColumns = columns.length === expected.length && columns.every((column, index) => {
    const want = expected[index];
    const actualDefault = column.COLUMN_DEFAULT === null
      ? null
      : String(column.COLUMN_DEFAULT).toLowerCase();
    const expectedDefault = want.defaultValue === null ? null : want.defaultValue.toLowerCase();
    const extra = column.EXTRA.trim().replace(/\s+/g, " ").toLowerCase();
    const validExtra = want.name === "updated_at"
      ? /^(?:default_generated )?on update current_timestamp\(3\)$/.test(extra)
      : extra === "";
    return Number(column.ORDINAL_POSITION) === index + 1
      && column.COLUMN_NAME === want.name
      && column.DATA_TYPE.toLowerCase() === want.dataType
      && column.COLUMN_TYPE.toLowerCase() === want.columnType
      && column.IS_NULLABLE === "NO"
      && actualDefault === expectedDefault
      && validExtra;
  });
  if (!validColumns) {
    const actual = columns.map((column) =>
      `${String(column.ORDINAL_POSITION)}:${column.COLUMN_NAME} ${column.COLUMN_TYPE}`
      + ` nullable=${column.IS_NULLABLE} default=${String(column.COLUMN_DEFAULT)}`
      + ` extra=${column.EXTRA || "<empty>"}`).join(", ");
    throw new Error(
      "archive_zone_usage 列定义不匹配：期望 "
      + "(server_id SMALLINT UNSIGNED, row_count BIGINT UNSIGNED, byte_count BIGINT UNSIGNED, "
      + `updated_at DATETIME(3))，实际 [${actual}]`,
    );
  }

  const [primary] = await conn.query<IndexShape[]>(
    `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'archive_zone_usage' AND INDEX_NAME = 'PRIMARY'
      ORDER BY SEQ_IN_INDEX`,
    [dbName],
  );
  const validPrimary = primary.length === 1
    && Number(primary[0].SEQ_IN_INDEX) === 1
    && primary[0].COLUMN_NAME === "server_id"
    && primary[0].SUB_PART === null
    && Number(primary[0].NON_UNIQUE) === 0
    && primary[0].INDEX_TYPE.toUpperCase() === "BTREE"
    && primary[0].COLLATION === "A";
  if (!validPrimary) {
    throw new Error(
      "archive_zone_usage.PRIMARY 定义不匹配：期望 BTREE UNIQUE (server_id)，实际 ("
      + `${primary.map((row) => row.COLUMN_NAME).join(", ") || "missing"})`,
    );
  }
}

/** Validate every pre-existing archive object before schema.sql or ALTER can
 * auto-commit a partial migration. Missing objects are the legacy state and
 * will be created by schema.sql; existing objects must independently be an
 * exact legacy or target shape so an interrupted valid migration can resume. */
async function preflightExistingArchiveShapes(conn: mysql.Connection, dbName: string): Promise<void> {
  // Validate every existing engine first, so no later shape check can mask a
  // non-transactional archive table.
  const existing = await existingArchiveTables(conn, dbName);

  for (const tableName of ARCHIVE_ZONE_TABLES) {
    if (!existing.has(tableName)) { continue; }
    await verifyArchiveServerIdColumn(conn, dbName, tableName);
    await archivePrimaryKeyKind(conn, dbName, tableName);
  }

  if (existing.has("user_archive")) {
    await archiveFrozenIndexKind(conn, dbName);
    await verifyArchiveProtocolColumn(conn, dbName, "freeze_id");
    await verifyArchiveProtocolColumn(conn, dbName, "archive_phase");
    await verifyArchiveFreezeIdIndex(conn, dbName);
  }

  if (existing.has("archive_zone_usage")) {
    await verifyArchiveUsageLedgerShape(conn, dbName);
  }
}

async function rebuildArchiveUsageLedger(conn: mysql.Connection): Promise<void> {
  await conn.beginTransaction();
  try {
    // Reset + grouped rebuild stay invisible until one commit. The ledger is
    // derived admission state; user_archive authority is never deleted here.
    await conn.query("UPDATE archive_zone_usage SET row_count = 0, byte_count = 0, updated_at = NOW(3)");
    await conn.query(
      `INSERT INTO archive_zone_usage (server_id, row_count, byte_count)
       SELECT server_id, COUNT(*), COALESCE(SUM(JSON_STORAGE_SIZE(snapshot)), 0)
         FROM user_archive
        GROUP BY server_id
       ON DUPLICATE KEY UPDATE
         row_count = VALUES(row_count),
         byte_count = VALUES(byte_count),
         updated_at = NOW(3)`,
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
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
  await preflightExistingArchiveShapes(conn, dbName);

  const ddl = readFileSync(join(here, "..", "sql", "schema.sql"), "utf8");
  await conn.query(ddl);

  // Archive authority and its ledger rely on transactional row locks. Reject
  // same-name non-InnoDB tables before any migration mutates their shape.
  await verifyArchiveTableEngines(conn, dbName);

  // 增量列迁移（幂等：1060 重复列即已迁）。CREATE IF NOT EXISTS 不会给存量表加新列
  const alters = [
    "ALTER TABLE mail ADD COLUMN attach_effect JSON NULL AFTER attach_op_id",
    // kit_migration 账本进度列（语句粒度续跑，docs/KIT.md §5）：存量 4 列账本的旧行 0/0 视作已应用
    "ALTER TABLE kit_migration ADD COLUMN statement_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER sha256",
    "ALTER TABLE kit_migration ADD COLUMN applied_statements INT UNSIGNED NOT NULL DEFAULT 0 AFTER statement_count",
  ];
  for (const sql of alters) {
    await conn.query(sql).catch((e: { errno?: number }) => {
      if (e.errno !== 1060) { throw e; }
    });
  }
  // 对局按区（DUAL_MODE §4.1）：fresh schema、c8 存量首次升级、任意中断后的重跑均须收敛；
  // 具体定义由 INFORMATION_SCHEMA 校验，⛔ 不靠吞 1060/1061 猜「大概已经有了」。
  await ensureMatchResultsZoneShape(conn, dbName);
  // Cold/archive identity is `(user_id, server_id)`. Only the exact legacy
  // shapes are migrated; same-name malformed columns/keys fail closed.
  await ensureArchiveZoneShape(conn, dbName);
  await ensureArchiveProtocolShape(conn, dbName);
  await verifyArchiveUsageLedgerShape(conn, dbName);
  await rebuildArchiveUsageLedger(conn);

  // 存量清理：排行榜演示移除后遗留的 season_rotation 租约行（新库 schema 已不再预置；幂等）
  await conn.query("DELETE FROM singleton_lease WHERE lease_name = 'season_rotation'");

  // kit SQL 迁移（docs/KIT.md §5）：账本驱动、db_bootstrap 租约下逐条语句执行。
  // 单开一条 multipleStatements:false 的连接——kit 语句一条一次 query，⛔ 不借用上面 schema.sql 的多语句连接。
  const kitConn = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username || "root"),
    password: decodeURIComponent(url.password || ""),
    database: dbName,
    multipleStatements: false,
  });
  try {
    const kitsRoot = join(here, "..", "..", "kits"); // apps/kits/<id>/<file>
    const report = await applyKitMigrations({
      conn: kitConn,
      dbName,
      catalog: SERVER_KIT_CATALOG,
      readSqlFile: (kitId, file) => readFileSync(join(kitsRoot, kitId, file), "utf8"),
      log: (line) => console.log(line),
    });
    console.log(
      `✅ kit 迁移：${SERVER_KIT_CATALOG.length} 个 kit，新应用 ${report.applied.length} 个文件，跳过 ${report.skipped} 个`
      + (report.orphanLedgerKits.length > 0 ? `，账本孤儿 kit：${report.orphanLedgerKits.join(", ")}` : ""),
    );
  } finally {
    await kitConn.end();
  }

  const [rows] = await conn.query<mysql.RowDataPacket[]>("SHOW TABLES");
  console.log(`✅ ${dbName} 就绪，共 ${rows.length} 张表:`, rows.map((r) => Object.values(r)[0]).join(", "));
  await conn.end();
}

main().catch((e) => { console.error("❌ bootstrap 失败", e); process.exit(1); });
