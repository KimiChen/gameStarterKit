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
  const databases = [freshDb, legacyDb, badIndexDb];
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
    await assertAccountTablesAbsent(freshDb);
    assertBootstrapOk(freshDb, "fresh 重复 bootstrap");
    await assertZoneShape(freshDb);
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
    } finally {
      await legacy.end();
    }

    assertBootstrapOk(legacyDb, "c8 存量首次升级");
    await assertZoneShape(legacyDb);
    {
      const conn = await mysql.createConnection(connectionOptions(legacyDb));
      try {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(
          "SELECT server_id FROM match_results WHERE match_id = 'legacy_match'",
        );
        assert.equal(rows.length, 1);
        assert.equal(Number(rows[0].server_id), 0, "旧行须由 DEFAULT 0 收敛到大混服区");
      } finally {
        await conn.end();
      }
    }
    assertBootstrapOk(legacyDb, "c8 存量重复升级");
    await assertZoneShape(legacyDb);

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
  } finally {
    for (const dbName of databases) {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(dbName)}`);
    }
    await admin.end();
  }
});
