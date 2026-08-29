/**
 * db:bootstrap 迁移回归（真实 MySQL，独立临时库）：
 * - fresh schema 第一次、第二次均成功；
 * - c8 存量 match_results 首次升级成功，旧行 server_id 回填 0；
 * - 存量升级后再次执行成功；
 * - 同名错定义 idx_zone_time 必须 fail-fast，不能靠吞 1061 假装已迁。
 */
import "./env-setup"; // 必须第一个 import（env 先于 config.ts 模块级读取）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import mysql from "mysql2/promise";

import { MYSQL_URL } from "../../src/core/infra/config";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "../..");
const bootstrapEntry = join(serverRoot, "tools", "db-bootstrap.ts");
const baseMysqlUrl = new URL(MYSQL_URL());

interface ColumnRow extends mysql.RowDataPacket {
  DATA_TYPE: string;
  COLUMN_TYPE: string;
  IS_NULLABLE: "YES" | "NO";
  COLUMN_DEFAULT: string | number | null;
}

interface IndexRow extends mysql.RowDataPacket {
  SEQ_IN_INDEX: number;
  COLUMN_NAME: string;
  SUB_PART: number | null;
  NON_UNIQUE: number;
  INDEX_TYPE: string;
  COLLATION: string | null;
}

function connectionOptions(database?: string): mysql.ConnectionOptions {
  return {
    host: baseMysqlUrl.hostname,
    port: Number(baseMysqlUrl.port || 3306),
    user: decodeURIComponent(baseMysqlUrl.username || "root"),
    password: decodeURIComponent(baseMysqlUrl.password || ""),
    ...(database === undefined ? {} : { database }),
  };
}

function quoteDatabase(dbName: string): string {
  assert.match(dbName, /^[a-z][a-z0-9_]{0,63}$/, `测试库名非法：${dbName}`);
  return `\`${dbName}\``;
}

function mysqlUrlFor(dbName: string): string {
  quoteDatabase(dbName);
  const url = new URL(baseMysqlUrl);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function runBootstrap(dbName: string) {
  return spawnSync(process.execPath, ["--import", "tsx", bootstrapEntry], {
    cwd: serverRoot,
    env: { ...process.env, MYSQL_URL: mysqlUrlFor(dbName) },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function bootstrapOutput(result: ReturnType<typeof runBootstrap>): string {
  return [
    result.stdout,
    result.stderr,
    result.error?.stack ?? result.error?.message,
    result.signal === null ? undefined : `signal=${result.signal}`,
  ].filter(Boolean).join("\n");
}

function assertBootstrapOk(dbName: string, phase: string): void {
  const result = runBootstrap(dbName);
  assert.equal(result.status, 0, `${phase} 应成功\n${bootstrapOutput(result)}`);
}

async function assertZoneShape(dbName: string): Promise<void> {
  const conn = await mysql.createConnection(connectionOptions(dbName));
  try {
    const [columns] = await conn.query<ColumnRow[]>(
      `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'match_results' AND COLUMN_NAME = 'server_id'`,
      [dbName],
    );
    assert.deepEqual(columns.map((c) => ({
      dataType: c.DATA_TYPE,
      columnType: c.COLUMN_TYPE,
      nullable: c.IS_NULLABLE,
      defaultValue: String(c.COLUMN_DEFAULT),
    })), [{
      dataType: "int",
      columnType: "int unsigned",
      nullable: "NO",
      defaultValue: "0",
    }]);

    const [indexes] = await conn.query<IndexRow[]>(
      `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'match_results' AND INDEX_NAME = 'idx_zone_time'
        ORDER BY SEQ_IN_INDEX`,
      [dbName],
    );
    assert.deepEqual(indexes.map((i) => ({
      seq: Number(i.SEQ_IN_INDEX),
      column: i.COLUMN_NAME,
      subPart: i.SUB_PART,
      nonUnique: Number(i.NON_UNIQUE),
      type: i.INDEX_TYPE,
      collation: i.COLLATION,
    })), [
      { seq: 1, column: "server_id", subPart: null, nonUnique: 1, type: "BTREE", collation: "A" },
      { seq: 2, column: "created_at", subPart: null, nonUnique: 1, type: "BTREE", collation: "A" },
    ]);
  } finally {
    await conn.end();
  }
}

async function assertArchiveZoneShape(dbName: string): Promise<void> {
  const conn = await mysql.createConnection(connectionOptions(dbName));
  try {
    for (const tableName of ["user_archive", "user_snapshot_readonly"]) {
      const [columns] = await conn.query<ColumnRow[]>(
        `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = 'server_id'`,
        [dbName, tableName],
      );
      assert.deepEqual(columns.map((column) => ({
        dataType: column.DATA_TYPE,
        columnType: column.COLUMN_TYPE,
        nullable: column.IS_NULLABLE,
        defaultValue: String(column.COLUMN_DEFAULT),
      })), [{
        dataType: "smallint",
        columnType: "smallint unsigned",
        nullable: "NO",
        defaultValue: "0",
      }], `${tableName}.server_id`);

      const [primary] = await conn.query<IndexRow[]>(
        `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = 'PRIMARY'
          ORDER BY SEQ_IN_INDEX`,
        [dbName, tableName],
      );
      assert.deepEqual(primary.map((index) => index.COLUMN_NAME), ["user_id", "server_id"]);
    }

    const [frozen] = await conn.query<IndexRow[]>(
      `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive' AND INDEX_NAME = 'idx_frozen'
        ORDER BY SEQ_IN_INDEX`,
      [dbName],
    );
    assert.deepEqual(frozen.map((index) => index.COLUMN_NAME), ["server_id", "frozen_at", "user_id"]);

    const [protocolColumns] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT,
              CHARACTER_SET_NAME, COLLATION_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive'
          AND COLUMN_NAME IN ('freeze_id', 'archive_phase')
        ORDER BY FIELD(COLUMN_NAME, 'freeze_id', 'archive_phase')`,
      [dbName],
    );
    assert.deepEqual(protocolColumns.map((column) => ({
      name: column.COLUMN_NAME,
      type: String(column.COLUMN_TYPE).toLowerCase(),
      nullable: column.IS_NULLABLE,
      defaultValue: column.COLUMN_DEFAULT === null ? null : String(column.COLUMN_DEFAULT),
      charset: column.CHARACTER_SET_NAME,
      collation: column.COLLATION_NAME,
    })), [
      {
        name: "freeze_id", type: "char(36)", nullable: "YES", defaultValue: null,
        charset: "ascii", collation: "ascii_bin",
      },
      {
        name: "archive_phase", type: "tinyint unsigned", nullable: "NO", defaultValue: "0",
        charset: null, collation: null,
      },
    ]);
    const [freezeIdIndex] = await conn.query<IndexRow[]>(
      `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive'
          AND INDEX_NAME = 'uk_archive_freeze_id'
        ORDER BY SEQ_IN_INDEX`,
      [dbName],
    );
    assert.deepEqual(freezeIdIndex.map((index) => ({
      column: index.COLUMN_NAME,
      nonUnique: Number(index.NON_UNIQUE),
      type: index.INDEX_TYPE,
    })), [{ column: "freeze_id", nonUnique: 0, type: "BTREE" }]);

    const [ledgerColumns] = await conn.query<(ColumnRow & { COLUMN_NAME: string })[]>(
      `SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'archive_zone_usage'
        ORDER BY ORDINAL_POSITION`,
      [dbName],
    );
    assert.deepEqual(ledgerColumns.map((column) => ({
      name: column.COLUMN_NAME,
      type: column.COLUMN_TYPE.toLowerCase(),
      nullable: column.IS_NULLABLE,
      defaultValue: column.COLUMN_DEFAULT === null ? null : String(column.COLUMN_DEFAULT).toLowerCase(),
    })), [
      { name: "server_id", type: "smallint unsigned", nullable: "NO", defaultValue: null },
      { name: "row_count", type: "bigint unsigned", nullable: "NO", defaultValue: "0" },
      { name: "byte_count", type: "bigint unsigned", nullable: "NO", defaultValue: "0" },
      { name: "updated_at", type: "datetime(3)", nullable: "NO", defaultValue: "current_timestamp(3)" },
    ]);

    const [ledgerPrimary] = await conn.query<IndexRow[]>(
      `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
         FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'archive_zone_usage' AND INDEX_NAME = 'PRIMARY'
        ORDER BY SEQ_IN_INDEX`,
      [dbName],
    );
    assert.deepEqual(ledgerPrimary.map((index) => index.COLUMN_NAME), ["server_id"]);

    const [engines] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME, ENGINE
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME IN ('user_archive','user_snapshot_readonly','archive_zone_usage')
        ORDER BY TABLE_NAME`,
      [dbName],
    );
    assert.deepEqual(engines.map((row) => [row.TABLE_NAME, String(row.ENGINE).toLowerCase()]), [
      ["archive_zone_usage", "innodb"],
      ["user_archive", "innodb"],
      ["user_snapshot_readonly", "innodb"],
    ]);
  } finally {
    await conn.end();
  }
}

async function assertAccountTablesAbsent(dbName: string): Promise<void> {
  const conn = await mysql.createConnection(connectionOptions(dbName));
  try {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT TABLE_NAME
         FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ?
          AND TABLE_NAME IN ('accounts','account_sessions','char_registry','login_audit','seq')`,
      [dbName],
    );
    assert.deepEqual(rows, [], "游戏库不得创建 WebPlatform 所有的账号表");
  } finally {
    await conn.end();
  }
}

test("db:bootstrap 对 fresh/c8 存量均幂等，并拒绝同名错定义索引", { timeout: 120_000 }, async () => {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const freshDb = `game_boot_${suffix}_fresh`;
  const legacyDb = `game_boot_${suffix}_legacy`;
  const badIndexDb = `game_boot_${suffix}_bad`;
  const badArchiveColumnDb = `game_boot_${suffix}_acol`;
  const badArchivePrimaryDb = `game_boot_${suffix}_apk`;
  const badArchiveIndexDb = `game_boot_${suffix}_aidx`;
  const badArchivePreflightDb = `game_boot_${suffix}_apre`;
  const badArchiveUsageDb = `game_boot_${suffix}_usage`;
  const badArchiveEngineDb = `game_boot_${suffix}_engine`;
  const databases = [
    freshDb, legacyDb, badIndexDb,
    badArchiveColumnDb, badArchivePrimaryDb, badArchiveIndexDb,
    badArchivePreflightDb,
    badArchiveUsageDb,
    badArchiveEngineDb,
  ];
  const admin = await mysql.createConnection(connectionOptions());

  try {
    const placeholders = databases.map(() => "?").join(", ");
    const [preexisting] = await admin.query<mysql.RowDataPacket[]>(
      `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME IN (${placeholders})`,
      databases,
    );
    assert.equal(preexisting.length, 0, "随机测试库名不应命中已有库");

    // fresh schema 自带目标列/索引：首次不能因重复 ADD KEY(1061) 失败，第二次也必须幂等。
    assertBootstrapOk(freshDb, "fresh 首次 bootstrap");
    await assertZoneShape(freshDb);
    await assertArchiveZoneShape(freshDb);
    await assertAccountTablesAbsent(freshDb);
    assertBootstrapOk(freshDb, "fresh 重复 bootstrap");
    await assertZoneShape(freshDb);
    await assertArchiveZoneShape(freshDb);
    await assertAccountTablesAbsent(freshDb);

    // c8 旧表：没有 server_id / idx_zone_time，且已有历史行。
    await admin.query(`CREATE DATABASE ${quoteDatabase(legacyDb)} DEFAULT CHARSET utf8mb4`);
    const legacy = await mysql.createConnection(connectionOptions(legacyDb));
    try {
      await legacy.query(
        `CREATE TABLE match_results (
           match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
           created_at DATETIME(3) NOT NULL,
           mode       TINYINT UNSIGNED NOT NULL,
           payload    JSON NOT NULL,
           PRIMARY KEY (match_id, created_at)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
         PARTITION BY RANGE COLUMNS (created_at) (
           PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
           PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
           PARTITION pmax VALUES LESS THAN (MAXVALUE)
         )`,
      );
      await legacy.query(
        `INSERT INTO match_results(match_id, created_at, mode, payload)
         VALUES ('legacy_match', '2026-07-26 12:00:00.000', 0, JSON_OBJECT('source', 'c8'))`,
      );
      await legacy.query(
        `CREATE TABLE user_archive (
           user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
           snapshot JSON NOT NULL,
           schema_version SMALLINT UNSIGNED NOT NULL,
           fence_hwm BIGINT UNSIGNED NOT NULL,
           frozen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
           PRIMARY KEY (user_id),
           KEY idx_frozen (frozen_at)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      );
      await legacy.query(
        `CREATE TABLE user_snapshot_readonly (
           user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
           snapshot JSON NOT NULL,
           ver BIGINT UNSIGNED NOT NULL,
           synced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
           PRIMARY KEY (user_id)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      );
      await legacy.query(
        "INSERT INTO user_archive(user_id,snapshot,schema_version,fence_hwm) VALUES ('legacy_user',JSON_OBJECT('v',1),1,1)",
      );
      await legacy.query(
        "INSERT INTO user_snapshot_readonly(user_id,snapshot,ver) VALUES ('legacy_user',JSON_OBJECT('v',1),1)",
      );
    } finally {
      await legacy.end();
    }

    assertBootstrapOk(legacyDb, "c8 存量首次升级");
    await assertZoneShape(legacyDb);
    await assertArchiveZoneShape(legacyDb);
    {
      const conn = await mysql.createConnection(connectionOptions(legacyDb));
      try {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT server_id FROM match_results WHERE match_id = 'legacy_match'",
        );
        assert.equal(rows.length, 1);
        assert.equal(Number(rows[0].server_id), 0, "旧行须由 DEFAULT 0 收敛到大混服区");
        const [archiveRows] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT server_id, freeze_id, archive_phase FROM user_archive WHERE user_id = 'legacy_user'",
        );
        const [snapshotRows] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT server_id FROM user_snapshot_readonly WHERE user_id = 'legacy_user'",
        );
        assert.deepEqual(archiveRows.map((row) => Number(row.server_id)), [0]);
        assert.equal(archiveRows[0].freeze_id, null, "旧 archive 行必须显式保留 LEGACY 身份");
        assert.equal(Number(archiveRows[0].archive_phase), 0);
        assert.deepEqual(snapshotRows.map((row) => Number(row.server_id)), [0]);
        const [usageRows] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT row_count, byte_count FROM archive_zone_usage WHERE server_id = 0",
        );
        assert.equal(usageRows.length, 1, "legacy archive 必须回填 s0 容量 ledger");
        assert.equal(Number(usageRows[0].row_count), 1);
        assert.ok(Number(usageRows[0].byte_count) > 0, "ledger 必须按 JSON_STORAGE_SIZE 记录正字节数");
      } finally {
        await conn.end();
      }
    }
    assertBootstrapOk(legacyDb, "c8 存量重复升级");
    await assertZoneShape(legacyDb);
    await assertArchiveZoneShape(legacyDb);

    // 同名索引不是“已经迁移”的充分条件：列顺序错误必须直接失败并说明定义不匹配。
    await admin.query(`CREATE DATABASE ${quoteDatabase(badIndexDb)} DEFAULT CHARSET utf8mb4`);
    const bad = await mysql.createConnection(connectionOptions(badIndexDb));
    try {
      await bad.query(
        `CREATE TABLE match_results (
           match_id   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
           created_at DATETIME(3) NOT NULL,
           server_id  INT UNSIGNED NOT NULL DEFAULT 0,
           mode       TINYINT UNSIGNED NOT NULL,
           payload    JSON NOT NULL,
           PRIMARY KEY (match_id, created_at),
           KEY idx_zone_time (created_at, server_id)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
         PARTITION BY RANGE COLUMNS (created_at) (
           PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
           PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
           PARTITION pmax VALUES LESS THAN (MAXVALUE)
         )`,
      );
    } finally {
      await bad.end();
    }
    const rejected = runBootstrap(badIndexDb);
    assert.notEqual(rejected.status, 0, "同名但错定义的 idx_zone_time 必须 fail-fast");
    assert.match(
      bootstrapOutput(rejected),
      /idx_zone_time 定义不匹配/,
      `错误输出应指出索引定义不匹配\n${bootstrapOutput(rejected)}`,
    );

    async function createBadArchiveDatabase(
      dbName: string,
      serverIdDefinition: string,
      primaryDefinition: string,
      frozenDefinition: string,
    ): Promise<void> {
      await admin.query(`CREATE DATABASE ${quoteDatabase(dbName)} DEFAULT CHARSET utf8mb4`);
      const conn = await mysql.createConnection(connectionOptions(dbName));
      try {
        await conn.query(
          `CREATE TABLE user_archive (
             user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
             ${serverIdDefinition},
             snapshot JSON NOT NULL,
             schema_version SMALLINT UNSIGNED NOT NULL,
             fence_hwm BIGINT UNSIGNED NOT NULL,
             frozen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
             ${primaryDefinition},
             KEY idx_frozen (${frozenDefinition})
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        );
      } finally {
        await conn.end();
      }
    }

    await createBadArchiveDatabase(
      badArchiveColumnDb,
      "server_id INT UNSIGNED NOT NULL DEFAULT 0",
      "PRIMARY KEY (user_id, server_id)",
      "server_id, frozen_at, user_id",
    );
    const badColumn = runBootstrap(badArchiveColumnDb);
    assert.notEqual(badColumn.status, 0);
    assert.match(bootstrapOutput(badColumn), /user_archive\.server_id 定义不匹配/);

    await createBadArchiveDatabase(
      badArchivePrimaryDb,
      "server_id SMALLINT UNSIGNED NOT NULL DEFAULT 0",
      "PRIMARY KEY (server_id, user_id)",
      "server_id, frozen_at, user_id",
    );
    const badPrimary = runBootstrap(badArchivePrimaryDb);
    assert.notEqual(badPrimary.status, 0);
    assert.match(bootstrapOutput(badPrimary), /user_archive\.PRIMARY 定义不匹配/);

    await createBadArchiveDatabase(
      badArchiveIndexDb,
      "server_id SMALLINT UNSIGNED NOT NULL DEFAULT 0",
      "PRIMARY KEY (user_id, server_id)",
      "frozen_at, server_id, user_id",
    );
    const badArchiveIndex = runBootstrap(badArchiveIndexDb);
    assert.notEqual(badArchiveIndex.status, 0);
    assert.match(bootstrapOutput(badArchiveIndex), /user_archive\.idx_frozen 定义不匹配/);

    // Preflight must reject the bad late-stage index before schema.sql creates
    // missing archive objects or earlier ALTERs partially upgrade this table.
    await admin.query(`CREATE DATABASE ${quoteDatabase(badArchivePreflightDb)} DEFAULT CHARSET utf8mb4`);
    {
      const conn = await mysql.createConnection(connectionOptions(badArchivePreflightDb));
      try {
        await conn.query(
          `CREATE TABLE user_archive (
             user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
             snapshot JSON NOT NULL,
             schema_version SMALLINT UNSIGNED NOT NULL,
             fence_hwm BIGINT UNSIGNED NOT NULL,
             frozen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
             PRIMARY KEY (user_id),
             KEY idx_frozen (frozen_at, user_id)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        );
      } finally {
        await conn.end();
      }
    }
    const badPreflight = runBootstrap(badArchivePreflightDb);
    assert.notEqual(badPreflight.status, 0);
    assert.match(bootstrapOutput(badPreflight), /user_archive\.idx_frozen 定义不匹配/);
    {
      const conn = await mysql.createConnection(connectionOptions(badArchivePreflightDb));
      try {
        const [serverId] = await conn.query<ColumnRow[]>(
          `SELECT DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
             FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive' AND COLUMN_NAME = 'server_id'`,
          [badArchivePreflightDb],
        );
        assert.deepEqual(serverId, [], "preflight 失败后不得 ADD user_archive.server_id");

        const [primary] = await conn.query<IndexRow[]>(
          `SELECT SEQ_IN_INDEX, COLUMN_NAME, SUB_PART, NON_UNIQUE, INDEX_TYPE, COLLATION
             FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_archive' AND INDEX_NAME = 'PRIMARY'
            ORDER BY SEQ_IN_INDEX`,
          [badArchivePreflightDb],
        );
        assert.deepEqual(primary.map((index) => index.COLUMN_NAME), ["user_id"],
          "preflight 失败后不得改写 user_archive.PRIMARY");

        const [createdArchiveTables] = await conn.query<mysql.RowDataPacket[]>(
          `SELECT TABLE_NAME
             FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME IN ('user_snapshot_readonly', 'archive_zone_usage')`,
          [badArchivePreflightDb],
        );
        assert.deepEqual(createdArchiveTables, [], "preflight 失败前不得执行 schema.sql 的 archive DDL");
      } finally {
        await conn.end();
      }
    }

    await admin.query(`CREATE DATABASE ${quoteDatabase(badArchiveUsageDb)} DEFAULT CHARSET utf8mb4`);
    {
      const conn = await mysql.createConnection(connectionOptions(badArchiveUsageDb));
      try {
        await conn.query(
          `CREATE TABLE archive_zone_usage (
             server_id INT UNSIGNED NOT NULL,
             row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
             byte_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
             updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
             PRIMARY KEY (server_id, row_count)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        );
      } finally {
        await conn.end();
      }
    }
    const badUsageColumn = runBootstrap(badArchiveUsageDb);
    assert.notEqual(badUsageColumn.status, 0);
    assert.match(bootstrapOutput(badUsageColumn), /archive_zone_usage 列定义不匹配/);
    {
      const conn = await mysql.createConnection(connectionOptions(badArchiveUsageDb));
      try {
        await conn.query(
          `ALTER TABLE archive_zone_usage
             MODIFY server_id SMALLINT UNSIGNED NOT NULL,
             DROP PRIMARY KEY,
             ADD PRIMARY KEY (server_id, row_count)`,
        );
      } finally {
        await conn.end();
      }
    }
    const badUsagePrimary = runBootstrap(badArchiveUsageDb);
    assert.notEqual(badUsagePrimary.status, 0);
    assert.match(bootstrapOutput(badUsagePrimary), /archive_zone_usage\.PRIMARY 定义不匹配/);

    await admin.query(`CREATE DATABASE ${quoteDatabase(badArchiveEngineDb)} DEFAULT CHARSET utf8mb4`);
    {
      const conn = await mysql.createConnection(connectionOptions(badArchiveEngineDb));
      try {
        await conn.query(
          `CREATE TABLE user_archive (
             user_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
             PRIMARY KEY (user_id)
           ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4`,
        );
        await conn.query(
          `CREATE TABLE archive_zone_usage (
             server_id SMALLINT UNSIGNED NOT NULL,
             row_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
             byte_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
             updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
             PRIMARY KEY (server_id)
           ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4`,
        );
      } finally {
        await conn.end();
      }
    }
    const badArchiveEngine = runBootstrap(badArchiveEngineDb);
    assert.notEqual(badArchiveEngine.status, 0);
    assert.match(bootstrapOutput(badArchiveEngine), /user_archive\.ENGINE 定义不匹配.*MyISAM/i);
    {
      const conn = await mysql.createConnection(connectionOptions(badArchiveEngineDb));
      try {
        await conn.query("ALTER TABLE user_archive ENGINE=InnoDB");
      } finally {
        await conn.end();
      }
    }
    const badLedgerEngine = runBootstrap(badArchiveEngineDb);
    assert.notEqual(badLedgerEngine.status, 0);
    assert.match(bootstrapOutput(badLedgerEngine), /archive_zone_usage\.ENGINE 定义不匹配.*MyISAM/i);
  } finally {
    for (const dbName of databases) {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(dbName)}`);
    }
    await admin.end();
  }
});
