/**
 * kit SQL 迁移账本回归（真实 MySQL，独立临时库；docs/KIT.md §5）：
 * - fresh 库跑一次 db:bootstrap（拿到 kit_migration 账本表 + db_bootstrap 租约行；生成目录为空 ⇒ 0 个 kit）；
 * - 用 fixture kit `kfix`（一张 per-zone 表 + 一张 global 表）直接驱动 applyKitMigrations：
 *   首跑应用 1 个文件、账本 1 行、表形态校验通过；再跑应用 0、跳过 1；
 * - 改动已应用文件 ⇒ fail-closed 抛错，账本与表都不动；
 * - 形态校验：per-zone 表 PK 不含 server_id 的 kit 抛错；global 表带 server_id 抛错；未声明的 k_<id>_ 表抛错；
 * - 租约：另一持有者未过期时拒绝；成功路径结束后租约已释放（expires_at ≤ NOW）。
 * 前置：本地 MySQL 栈已启动（npm --workspace @game/server run stack）。
 */
import "./env-setup"; // 必须第一个 import（env 先于 config.ts 模块级读取）
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import mysql from "mysql2/promise";

import { MYSQL_URL } from "../../src/core/infra/config";
import type { ServerKitCatalogEntry } from "../../src/kits/catalogTypes";
import { applyKitMigrations, sha256Hex, verifyKitTableShapes } from "../../tools/kit-migrations";

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, "../..");
const bootstrapEntry = join(serverRoot, "tools", "db-bootstrap.ts");
const baseMysqlUrl = new URL(MYSQL_URL());

function connectionOptions(database?: string): mysql.ConnectionOptions {
  return {
    host: baseMysqlUrl.hostname,
    port: Number(baseMysqlUrl.port || 3306),
    user: decodeURIComponent(baseMysqlUrl.username || "root"),
    password: decodeURIComponent(baseMysqlUrl.password || ""),
    multipleStatements: false,
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

const KFIX: ServerKitCatalogEntry = {
  id: "kfix",
  version: "1.0.0",
  api: { default: { version: 1, minSupported: 1 } },
  modes: [],
  domains: [],
  effects: [],
  sqlFiles: ["sql/001-init.sql"],
  sqlTables: [
    { name: "k_kfix_tile", zone: "per-zone" },
    { name: "k_kfix_world", zone: "global" },
  ],
  userKeys: [],
};

const INIT_SQL = `-- kfix 初始化（分号在注释里; 不切分）
CREATE TABLE k_kfix_tile (
  server_id SMALLINT UNSIGNED NOT NULL,
  x         INT NOT NULL,
  owner     VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  \`event\`   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (server_id, x),
  UNIQUE KEY uk_owner (server_id, owner)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE k_kfix_world (
  world_id INT UNSIGNED NOT NULL,
  name     VARCHAR(64) NOT NULL DEFAULT 'a;b',
  PRIMARY KEY (world_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO k_kfix_world (world_id, name) VALUES (1, 'seed');
`;

const ALTER_SQL = "ALTER TABLE k_kfix_tile ADD COLUMN hp INT NOT NULL DEFAULT 0, ALGORITHM=INSTANT;\n";

const fixture = (files: Record<string, string>) => (kitId: string, file: string): string => {
  const text = files[`${kitId}/${file}`];
  if (text === undefined) { throw new Error(`fixture 缺少 ${kitId}/${file}`); }
  return text;
};

interface LedgerRow extends mysql.RowDataPacket { kit_id: string; file: string; sha256: string }
interface LeaseRow extends mysql.RowDataPacket { holder: string; expired: number }
interface CountRow extends mysql.RowDataPacket { n: number }

test("kit 迁移账本：应用两遍第二遍零 DDL、改文件 fail-closed、形态校验与租约", { timeout: 120_000 }, async () => {
  const suffix = `${process.pid}_${Date.now().toString(36)}`;
  const dbName = `game_kit_${suffix}`;
  const admin = await mysql.createConnection(connectionOptions());
  try {
    const bootstrap = runBootstrap(dbName);
    assert.equal(bootstrap.status, 0, `bootstrap 应成功\n${bootstrap.stdout}\n${bootstrap.stderr}`);
    assert.match(bootstrap.stdout, /kit 迁移：0 个 kit/u, "生成目录为空时 bootstrap 汇报 0 个 kit");

    const conn = await mysql.createConnection(connectionOptions(dbName));
    try {
      // ① 首跑：应用 1 个文件，账本 1 行，表存在且形态通过
      const first = await applyKitMigrations({
        conn, dbName, catalog: [KFIX], holder: "int-test",
        readSqlFile: fixture({ "kfix/sql/001-init.sql": INIT_SQL }),
      });
      assert.deepEqual(first, { applied: [{ kitId: "kfix", file: "sql/001-init.sql" }], skipped: 0, orphanLedgerKits: [] });
      const [ledger] = await conn.query<LedgerRow[]>("SELECT kit_id, file, sha256 FROM kit_migration ORDER BY kit_id, file");
      assert.deepEqual(ledger.map((r) => [r.kit_id, r.file, r.sha256]), [["kfix", "sql/001-init.sql", sha256Hex(INIT_SQL)]]);
      const [seed] = await conn.query<mysql.RowDataPacket[]>("SELECT name FROM k_kfix_world WHERE world_id = 1");
      assert.equal(seed[0]?.name, "seed");

      // 租约成功路径结束后已释放
      const [lease] = await conn.query<LeaseRow[]>(
        "SELECT holder, (expires_at <= NOW(3)) AS expired FROM singleton_lease WHERE lease_name = 'db_bootstrap'",
      );
      assert.equal(lease[0]?.holder, "int-test");
      assert.equal(Number(lease[0]?.expired), 1, "成功后 db_bootstrap 租约应已释放");

      // ② 再跑：零 DDL（同 sha 跳过）
      const second = await applyKitMigrations({
        conn, dbName, catalog: [KFIX], holder: "int-test",
        readSqlFile: fixture({ "kfix/sql/001-init.sql": INIT_SQL }),
      });
      assert.deepEqual(second, { applied: [], skipped: 1, orphanLedgerKits: [] });

      // ③ 追加第二个文件只应用新文件；账本增 1 行
      const withAlter: ServerKitCatalogEntry = { ...KFIX, sqlFiles: ["sql/001-init.sql", "sql/002-hp.sql"] };
      const third = await applyKitMigrations({
        conn, dbName, catalog: [withAlter], holder: "int-test",
        readSqlFile: fixture({ "kfix/sql/001-init.sql": INIT_SQL, "kfix/sql/002-hp.sql": ALTER_SQL }),
      });
      assert.deepEqual(third, { applied: [{ kitId: "kfix", file: "sql/002-hp.sql" }], skipped: 1, orphanLedgerKits: [] });
      const [hp] = await conn.query<mysql.RowDataPacket[]>(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'k_kfix_tile' AND COLUMN_NAME = 'hp'",
        [dbName],
      );
      assert.equal(hp.length, 1);

      // ④ 改动已应用文件 ⇒ fail-closed；账本不变
      await assert.rejects(
        applyKitMigrations({
          conn, dbName, catalog: [withAlter], holder: "int-test",
          readSqlFile: fixture({ "kfix/sql/001-init.sql": `${INIT_SQL}\n-- touched`, "kfix/sql/002-hp.sql": ALTER_SQL }),
        }),
        /⛔ 已应用的迁移文件被改动：kit "kfix" sql\/001-init\.sql/u,
      );
      const [ledgerAfter] = await conn.query<CountRow[]>("SELECT COUNT(*) AS n FROM kit_migration");
      assert.equal(Number(ledgerAfter[0]?.n), 2);

      // ⑤ 形态校验：真 INFORMATION_SCHEMA 下按 zone 判
      await verifyKitTableShapes({ conn, dbName, catalog: [withAlter] });
      // 把 per-zone 表当 global 声明 ⇒ 抛（表带 server_id）
      await assert.rejects(
        verifyKitTableShapes({ conn, dbName, catalog: [{ ...withAlter, sqlTables: [{ name: "k_kfix_tile", zone: "global" }, { name: "k_kfix_world", zone: "global" }] }] }),
        /global 表 k_kfix_tile 不得有 server_id 列/u,
      );
      // 把 global 表当 per-zone 声明 ⇒ 抛（缺 server_id）
      await assert.rejects(
        verifyKitTableShapes({ conn, dbName, catalog: [{ ...withAlter, sqlTables: [{ name: "k_kfix_tile", zone: "per-zone" }, { name: "k_kfix_world", zone: "per-zone" }] }] }),
        /per-zone 表 k_kfix_world 缺少 server_id 列/u,
      );
      // 少声明一张 ⇒ 未声明的 k_kfix_ 前缀表抛
      await assert.rejects(
        verifyKitTableShapes({ conn, dbName, catalog: [{ ...withAlter, sqlTables: [{ name: "k_kfix_tile", zone: "per-zone" }] }] }),
        /k_kfix_world 却未在 kit.json.sql.tables 声明/u,
      );

      // ⑥ 另一个 kit 的 per-zone 表 PK 不含 server_id ⇒ 迁移应用后形态校验抛（DDL 已执行、账本已记，⛔ 不回滚——这正是 fail-closed 的可见形态）
      const kbad: ServerKitCatalogEntry = {
        ...KFIX, id: "kbad", sqlTables: [{ name: "k_kbad_t", zone: "per-zone" }],
      };
      await assert.rejects(
        applyKitMigrations({
          conn, dbName, catalog: [withAlter, kbad], holder: "int-test",
          readSqlFile: fixture({
            "kfix/sql/001-init.sql": INIT_SQL, "kfix/sql/002-hp.sql": ALTER_SQL,
            "kbad/sql/001-init.sql": "CREATE TABLE k_kbad_t (server_id SMALLINT UNSIGNED NOT NULL, id INT NOT NULL, PRIMARY KEY (id))",
          }),
        }),
        /k_kbad_t 的 PRIMARY KEY \(id\) 不含 server_id/u,
      );

      // ⑦ 租约被另一持有者持有（未过期）⇒ 拒绝并点名
      await conn.query(
        "UPDATE singleton_lease SET holder = 'other-host:1', expires_at = NOW(3) + INTERVAL 300 SECOND WHERE lease_name = 'db_bootstrap'",
      );
      await assert.rejects(
        applyKitMigrations({
          conn, dbName, catalog: [withAlter], holder: "int-test",
          readSqlFile: fixture({ "kfix/sql/001-init.sql": INIT_SQL, "kfix/sql/002-hp.sql": ALTER_SQL }),
        }),
        /另一个 db:bootstrap 正在运行（db_bootstrap 租约被 other-host:1 持有）/u,
      );

      // ⑧ 账本孤儿：kbad 已入账、目录里去掉它 ⇒ 只告警
      await conn.query("UPDATE singleton_lease SET expires_at = NOW(3) WHERE lease_name = 'db_bootstrap'");
      await conn.query("DROP TABLE k_kbad_t");
      const [kbadLedger] = await conn.query<LedgerRow[]>("SELECT file FROM kit_migration WHERE kit_id = 'kbad'");
      assert.equal(kbadLedger.length, 1, "kbad 的文件已执行即入账（形态校验在账本之后）");
      const orphan = await applyKitMigrations({
        conn, dbName, catalog: [withAlter], holder: "int-test",
        readSqlFile: fixture({ "kfix/sql/001-init.sql": INIT_SQL, "kfix/sql/002-hp.sql": ALTER_SQL }),
      });
      assert.deepEqual(orphan, { applied: [], skipped: 2, orphanLedgerKits: ["kbad"] });
    } finally {
      await conn.end();
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${quoteDatabase(dbName)}`);
    await admin.end();
  }
});
