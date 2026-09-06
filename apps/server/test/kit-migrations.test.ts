/**
 * kit SQL 迁移账本（docs/KIT.md §5）单测：切分器、语句白名单、账本驱动应用（假连接按剧本作答）、
 * 表形态校验（假 INFORMATION_SCHEMA）。⛔ 不连真 MySQL；真库回归在 test/int/kit-migrations.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import {
  FRAMEWORK_GLOBAL_TABLES, FRAMEWORK_PER_ZONE_TABLES, allTables, assertKitTablePrefixesUnique, globalTables, kitTablePrefix, perZoneTables,
} from "../src/core/infra/zoneTables";
import {
  applyKitMigrations, lintKitStatement, sha256Hex, splitSqlStatements, verifyKitTableShapes,
  type SqlConn,
} from "../tools/kit-migrations";

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
const DECLARED = KFIX.sqlTables.map((t) => t.name);

const INIT_SQL = `-- kfix init; 注释里的分号不算
CREATE TABLE IF NOT EXISTS k_kfix_tile (
  server_id SMALLINT UNSIGNED NOT NULL,
  x INT NOT NULL,
  owner VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  PRIMARY KEY (server_id, x)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS k_kfix_world (
  world_id INT UNSIGNED NOT NULL,
  name VARCHAR(64) NOT NULL DEFAULT 'a;b',
  PRIMARY KEY (world_id)
) ENGINE=InnoDB;
INSERT INTO k_kfix_world (world_id, name) VALUES (1, 'seed');
`;

// ── zoneTables ────────────────────────────────────────────────────────────

test("zoneTables：框架表 ∪ kit 表按 zone 汇入，catalog 可注入", () => {
  assert.equal(kitTablePrefix("Arena"), "k_arena_");
  assert.deepEqual(perZoneTables([]), [...FRAMEWORK_PER_ZONE_TABLES]);
  assert.deepEqual(globalTables([]), [...FRAMEWORK_GLOBAL_TABLES]);
  assert.ok(FRAMEWORK_GLOBAL_TABLES.includes("kit_migration"));
  assert.deepEqual(perZoneTables([KFIX]), [...FRAMEWORK_PER_ZONE_TABLES, "k_kfix_tile"]);
  assert.deepEqual(globalTables([KFIX]), [...FRAMEWORK_GLOBAL_TABLES, "k_kfix_world"]);
  assert.deepEqual(new Set(allTables([KFIX])), new Set([...FRAMEWORK_PER_ZONE_TABLES, ...FRAMEWORK_GLOBAL_TABLES, "k_kfix_tile", "k_kfix_world"]));
  // 生成物缺省：当前目录为空 ⇒ 全集 = 框架表
  assert.equal(allTables().length, FRAMEWORK_PER_ZONE_TABLES.length + FRAMEWORK_GLOBAL_TABLES.length);
});

test("zoneTables：只差大小写的 kit id 共用表前缀 ⇒ fail-closed", () => {
  assert.doesNotThrow(() => assertKitTablePrefixesUnique([KFIX, { ...KFIX, id: "other" }]));
  assert.doesNotThrow(() => assertKitTablePrefixesUnique([KFIX, KFIX]), "同一 id 重复不算撞车");
  assert.throws(() => assertKitTablePrefixesUnique([KFIX, { ...KFIX, id: "kFix" }]), /"kfix" 与 "kFix" 只差大小写，表前缀都是 k_kfix_/u);
  assert.throws(() => perZoneTables([KFIX, { ...KFIX, id: "KFIX" }]), /只差大小写/u);
  assert.throws(() => allTables([KFIX, { ...KFIX, id: "Kfix" }]), /只差大小写/u);
});

// ── splitSqlStatements ───────────────────────────────────────────────────

test("splitSqlStatements：注释 / 引号 / 反引号里的分号不切分，尾部空白丢弃", () => {
  const parts = splitSqlStatements(INIT_SQL);
  assert.equal(parts.length, 3);
  assert.match(parts[0], /^CREATE TABLE IF NOT EXISTS k_kfix_tile/u);
  assert.ok(!parts[0].includes("注释"), "注释被剥掉");
  assert.ok(parts[1].includes("'a;b'"), "引号内分号保留");
  assert.match(parts[2], /^INSERT INTO k_kfix_world/u);

  assert.deepEqual(splitSqlStatements("SELECT 1; # trailing ; comment\n   \n"), ["SELECT 1"]);
  assert.deepEqual(splitSqlStatements("INSERT INTO `k;x` (a) VALUES (\"q;\\\";x\"); /* b; */ SELECT 2"),
    ["INSERT INTO `k;x` (a) VALUES (\"q;\\\";x\")", "SELECT 2"]);
  assert.deepEqual(splitSqlStatements("a--b;c"), ["a--b", "c"], "`--` 后无空白不是注释（MySQL 规则）");
  assert.deepEqual(splitSqlStatements(""), []);
});

test("splitSqlStatements：DELIMITER 与未闭合引号 / 注释拒绝", () => {
  assert.throws(() => splitSqlStatements("DELIMITER $$\nCREATE TRIGGER x $$"), /DELIMITER/u);
  assert.throws(() => splitSqlStatements("  delimiter //"), /DELIMITER/u);
  assert.throws(() => splitSqlStatements("INSERT INTO t VALUES ('a"), /引号未闭合/u);
  assert.throws(() => splitSqlStatements("/* open"), /块注释未闭合/u);
  // `/*! … */` 版本注释：MySQL 会执行其内容而切分器只能剥掉——账本 sha 背书的就不是实际执行的 DDL ⇒ 拒
  assert.throws(
    () => splitSqlStatements("CREATE TABLE k_kfix_tile (id INT) /*!50100 PARTITION BY HASH(id) PARTITIONS 4 */;"),
    /不允许 \/\*! … \*\/ 版本注释/u,
  );
  assert.throws(() => splitSqlStatements("/*!40101 SET NAMES utf8 */"), /版本注释/u);
  assert.deepEqual(splitSqlStatements("/* 普通块注释 ; 照剥 */ SELECT 1"), ["SELECT 1"]);
});

// ── lintKitStatement ─────────────────────────────────────────────────────

test("lintKitStatement：白名单语句放行", () => {
  const ok = [
    "CREATE TABLE IF NOT EXISTS k_kfix_tile (server_id SMALLINT UNSIGNED NOT NULL, x INT, PRIMARY KEY (server_id, x))",
    "CREATE TABLE `k_kfix_world` (id INT, `event` INT, ts DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    "ALTER TABLE k_kfix_tile ADD COLUMN hp INT NOT NULL DEFAULT 0",
    "ALTER TABLE k_kfix_tile ADD COLUMN hp INT NOT NULL DEFAULT 0, ADD UNIQUE INDEX uk_x (server_id, x), ADD KEY idx_owner (owner), ALGORITHM=INPLACE, LOCK=NONE",
    "ALTER TABLE k_kfix_tile MODIFY COLUMN owner VARCHAR(64) NULL",
    "CREATE INDEX idx_a ON k_kfix_tile (owner)",
    "CREATE UNIQUE INDEX uk_a ON `k_kfix_tile` (server_id, owner)",
    "INSERT INTO k_kfix_world (world_id, name) VALUES (1, 'a'), (2, 'drop table x')",
    "INSERT IGNORE INTO k_kfix_world (world_id, name) VALUES (1, 'a')",
    "INSERT INTO k_kfix_world (world_id, name) VALUES (1, 'a') ON DUPLICATE KEY UPDATE world_id = world_id",
    "CREATE TABLE k_kfix_tile (id INT, world_id INT, PRIMARY KEY (id), CONSTRAINT fk FOREIGN KEY (world_id) REFERENCES k_kfix_world (world_id))",
    // 反引号标识符（不含结构字符）在多 action ALTER 里照常切分
    "ALTER TABLE `k_kfix_tile` ADD COLUMN `hp` INT NOT NULL DEFAULT 0, ADD KEY `idx_hp` (`hp`), MODIFY COLUMN `owner` VARCHAR(64) NULL",
    // 字符串字面量里的关键字 / 结构字符不参与判定
    "INSERT INTO k_kfix_world (world_id, name) VALUES (1, 'like, drop (x); load_file')",
  ];
  // 显式 InnoDB 与不写 ENGINE（交服务端缺省，由 verifyKitTableShapes 按实际引擎兜底）都放行。
  ok.push("CREATE TABLE k_kfix_tile (id INT, PRIMARY KEY(id)) ENGINE=InnoDB");
  ok.push("CREATE TABLE k_kfix_tile (id INT, PRIMARY KEY(id)) ENGINE=innodb DEFAULT CHARSET=utf8mb4");
  for (const s of ok) { assert.doesNotThrow(() => lintKitStatement(s, "kfix", DECLARED), s); }
});

test("lintKitStatement：禁用语句类型逐条拒绝（fail-closed）", () => {
  const deny: [string, RegExp][] = [
    ["DROP TABLE k_kfix_tile", /DROP/u],
    ["ALTER TABLE k_kfix_tile DROP COLUMN x", /DROP/u],
    ["TRUNCATE TABLE k_kfix_tile", /TRUNCATE/u],
    ["DELETE FROM k_kfix_tile", /DELETE/u],
    ["UPDATE k_kfix_tile SET x = 1", /UPDATE/u],
    ["RENAME TABLE k_kfix_tile TO k_kfix_t2", /RENAME/u],
    ["ALTER TABLE k_kfix_tile RENAME COLUMN x TO y", /RENAME/u],
    ["CREATE TRIGGER t BEFORE INSERT ON k_kfix_tile FOR EACH ROW SET NEW.x = 1", /TRIGGER/u],
    ["CREATE EVENT e ON SCHEDULE EVERY 1 HOUR DO SELECT 1", /EVENT/u],
    ["CREATE PROCEDURE p() BEGIN END", /PROCEDURE/u],
    ["CREATE FUNCTION f() RETURNS INT RETURN 1", /FUNCTION/u],
    ["GRANT ALL ON *.* TO 'x'@'%'", /GRANT/u],
    ["USE game", /USE/u],
    ["LOCK TABLES k_kfix_tile WRITE", /LOCK/u],
    ["SET FOREIGN_KEY_CHECKS = 0", /SET/u],
    ["SELECT * FROM k_kfix_tile", /SELECT/u],
    ["REPLACE INTO k_kfix_world (world_id) VALUES (1)", /REPLACE/u],
    ["CREATE TABLE k_kfix_tile LIKE user_currency", /LIKE/u],
    ["CREATE TABLE k_kfix_tile AS SELECT * FROM user_currency", /形态|SELECT/u],
    ["CREATE TABLE k_kfix_tile (id INT) SELECT 1", /SELECT/u],
    ["INSERT INTO k_kfix_world (world_id) SELECT user_id FROM user_currency", /SELECT|VALUES/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN x INT, DROP INDEX i", /DROP/u],
    ["ALTER TABLE k_kfix_tile ADD FOREIGN KEY (x) REFERENCES k_kfix_world (id)", /ALTER TABLE 只允许/u],
    ["ALTER TABLE k_kfix_tile ENGINE=MyISAM", /ALTER TABLE 只允许/u],
    // CREATE 侧同样要挡住非事务引擎：withKitTx 承诺「世界状态在 SQL、经济在框架」原子提交/回滚，
    // MyISAM / MEMORY 下 kit 侧的写在框架回滚后会留下来（此前只有 ALTER 侧被拒，CREATE 侧放行）。
    ["CREATE TABLE k_kfix_tile (id INT, PRIMARY KEY(id)) ENGINE=MyISAM", /只允许 ENGINE=InnoDB/u],
    ["CREATE TABLE k_kfix_tile (id INT, PRIMARY KEY(id)) ENGINE=MEMORY", /只允许 ENGINE=InnoDB/u],
    ["CREATE TABLE k_kfix_tile (id INT, PRIMARY KEY(id)) ENGINE = memory", /只允许 ENGINE=InnoDB/u],
    ["CREATE TABLE k_kfix_tile (id INT, PRIMARY KEY(id)) DEFAULT CHARSET=utf8mb4 ENGINE=FEDERATED", /只允许 ENGINE=InnoDB/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN x INT, ALGORITHM=INSTANT, DROP COLUMN y", /DROP/u],
    ["CREATE VIEW v AS SELECT 1", /VIEW/u],
    ["CREATE TEMPORARY TABLE k_kfix_tile (id INT)", /TEMPORARY/u],
    ["CALL p()", /CALL/u],
    ["ALTER DATABASE game CHARACTER SET utf8mb4", /ALTER DATABASE|只允许 ALTER TABLE/u],
    ["CREATE TABLE k_kfix_tile (id INT); DROP TABLE user_currency", /多条语句|DROP/u],
    ["CREATE TABLE k_kfix_tile (id INT, event INT)", /EVENT/u],
    ["FLUSH TABLES", /不在白名单/u],
    ["", /不在白名单/u],
    // 反引号标识符里的 `(` 曾能让括号深度计数不归零、后续 action 全部藏进第一个 ADD COLUMN 里逃过白名单
    ["ALTER TABLE k_kfix_tile ADD COLUMN `z(` INT, CHANGE COLUMN x y INT", /反引号标识符里不得含/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN `z(` INT, ADD PRIMARY KEY (x)", /反引号标识符里不得含/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN `z(` INT, ENGINE=MyISAM", /反引号标识符里不得含/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN `z(` INT, CONVERT TO CHARACTER SET latin1", /反引号标识符里不得含/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN `a,b` INT", /反引号标识符里不得含/u],
    ["CREATE TABLE `k_kfix_tile` (`id)` INT)", /反引号标识符里不得含/u],
    // 同样的 action 不带反引号伎俩时本来就被白名单拒
    ["ALTER TABLE k_kfix_tile CHANGE COLUMN x y INT", /ALTER TABLE 只允许/u],
    ["ALTER TABLE k_kfix_tile ADD PRIMARY KEY (x)", /ALTER TABLE 只允许/u],
    ["ALTER TABLE k_kfix_tile CONVERT TO CHARACTER SET latin1", /ALTER TABLE 只允许/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN x INT, CHANGE COLUMN x y INT", /ALTER TABLE 只允许/u],
    // `(LIKE <t>)` 带括号形态复制任意表定义
    ["CREATE TABLE k_kfix_tile (LIKE user_currency)", /不允许 LIKE/u],
    ["CREATE TABLE k_kfix_tile ( LIKE `user_currency` )", /不允许 LIKE/u],
    // 区列 server_id 只能在 CREATE TABLE 里定义（否则入账后才被形态校验拒，bootstrap 永久红）
    ["ALTER TABLE k_kfix_tile MODIFY COLUMN server_id INT NULL", /不得 ADD \/ MODIFY COLUMN server_id/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN hp INT, MODIFY COLUMN `server_id` SMALLINT NULL", /不得 ADD \/ MODIFY COLUMN server_id/u],
    ["ALTER TABLE k_kfix_world ADD COLUMN server_id SMALLINT UNSIGNED NOT NULL", /不得 ADD \/ MODIFY COLUMN server_id/u],
    // 指向服务器文件系统的表选项 / 函数
    ["CREATE TABLE k_kfix_tile (id INT) DATA DIRECTORY = '/tmp'", /DATA \/ INDEX DIRECTORY/u],
    ["CREATE TABLE k_kfix_tile (id INT) INDEX DIRECTORY = '/tmp'", /DATA \/ INDEX DIRECTORY/u],
    ["ALTER TABLE k_kfix_tile ADD COLUMN x INT, DATA DIRECTORY = '/tmp'", /DATA \/ INDEX DIRECTORY|ALTER TABLE 只允许/u],
    ["INSERT INTO k_kfix_world (world_id, name) VALUES (1, LOAD_FILE('/etc/passwd'))", /LOAD_FILE/u],
  ];
  for (const [s, re] of deny) { assert.throws(() => lintKitStatement(s, "kfix", DECLARED), re, s); }
});

test("lintKitStatement：表名必须已声明、带 k_<id>_ 前缀、不带库名；外键不得指向 kit 外的表", () => {
  assert.throws(() => lintKitStatement("CREATE TABLE k_kfix_other (id INT)", "kfix", DECLARED), /未在 kit.json.sql.tables 声明/u);
  assert.throws(() => lintKitStatement("CREATE TABLE k_other_tile (id INT)", "kfix", DECLARED), /不带 kit 表前缀 k_kfix_/u);
  assert.throws(() => lintKitStatement("CREATE TABLE user_currency (id INT)", "kfix", DECLARED), /不带 kit 表前缀/u);
  assert.throws(() => lintKitStatement("CREATE TABLE game.k_kfix_tile (id INT)", "kfix", DECLARED), /库名限定/u);
  assert.throws(() => lintKitStatement("ALTER TABLE k_kfix_other ADD COLUMN x INT", "kfix", DECLARED), /未在 kit.json.sql.tables 声明/u);
  assert.throws(() => lintKitStatement("CREATE INDEX i ON user_currency (user_id)", "kfix", DECLARED), /不带 kit 表前缀/u);
  assert.throws(() => lintKitStatement("INSERT INTO mail (title) VALUES ('x')", "kfix", DECLARED), /不带 kit 表前缀/u);
  assert.throws(
    () => lintKitStatement("CREATE TABLE k_kfix_tile (id INT, uid VARCHAR(32), FOREIGN KEY (uid) REFERENCES user_currency (user_id))", "kfix", DECLARED),
    /REFERENCES 目标表 "user_currency" 不带 kit 表前缀/u,
  );
  assert.throws(
    () => lintKitStatement("CREATE TABLE k_kfix_tile (id INT, w INT, FOREIGN KEY (w) REFERENCES k_kfix_other (id))", "kfix", DECLARED),
    /REFERENCES 目标表 "k_kfix_other" 未在 kit.json.sql.tables 声明/u,
  );
  // 前缀是大小写归一的：kit id "Kfix" 的表前缀仍是 k_kfix_
  assert.doesNotThrow(() => lintKitStatement("CREATE TABLE k_kfix_tile (id INT)", "Kfix", DECLARED));
});

// ── applyKitMigrations（假连接） ─────────────────────────────────────────

interface Call { sql: string; params: unknown[] | undefined }

/** 账本一行（sha + 语句粒度进度）；`count === applied` 即已应用。 */
interface Ledger { sha256: string; count: number; applied: number }
const done = (sha256: string, count = 3): Ledger => ({ sha256, count, applied: count });

interface FakeConnOptions {
  /** 租约行；undefined = 无预置行。 */
  lease?: { holder: string; free: boolean };
  /** 账本：`${kitId}\n${file}` → 行。 */
  ledger?: Map<string, Ledger>;
  /** 执行到第 N 条（1 起）kit 语句时抛（只抛一次：续跑时不再抛）。 */
  failStatementAt?: number;
  /** INFORMATION_SCHEMA 剧本；缺省按 KFIX 目标形态作答。 */
  schema?: SchemaAnswers;
}

interface SchemaAnswers {
  tables: string[];
  /** 表 → ENGINE（缺省 InnoDB；显式 null 模拟 information_schema 取不到引擎）。 */
  engines?: Record<string, string | null>;
  serverId: Record<string, { DATA_TYPE: string; COLUMN_TYPE: string; IS_NULLABLE: string }>;
  uniques: { TABLE_NAME: string; INDEX_NAME: string; COLUMN_NAME: string }[];
}

const GOOD_SCHEMA: SchemaAnswers = {
  tables: ["user_currency", "kit_migration", "k_kfix_tile", "k_kfix_world"],
  serverId: {
    user_currency: { DATA_TYPE: "smallint", COLUMN_TYPE: "smallint unsigned", IS_NULLABLE: "NO" },
    k_kfix_tile: { DATA_TYPE: "smallint", COLUMN_TYPE: "smallint unsigned", IS_NULLABLE: "NO" },
  },
  uniques: [
    { TABLE_NAME: "k_kfix_tile", INDEX_NAME: "PRIMARY", COLUMN_NAME: "server_id" },
    { TABLE_NAME: "k_kfix_tile", INDEX_NAME: "PRIMARY", COLUMN_NAME: "x" },
    { TABLE_NAME: "k_kfix_world", INDEX_NAME: "PRIMARY", COLUMN_NAME: "world_id" },
  ],
};

function fakeConn(options: FakeConnOptions): SqlConn & { calls: Call[]; executed: string[]; ledger: Map<string, Ledger> } {
  const calls: Call[] = [];
  const executed: string[] = [];
  const ledger = options.ledger ?? new Map<string, Ledger>();
  const schema = options.schema ?? GOOD_SCHEMA;
  let lease = options.lease;
  let kitStatementCount = 0;
  let failArmed = options.failStatementAt !== undefined;
  const query = async (sql: string, params?: readonly unknown[]): Promise<[unknown, unknown]> => {
    const p = params ? [...params] : undefined;
    calls.push({ sql, params: p });
    const head = sql.trim().replace(/\s+/g, " ");
    if (head.startsWith("SELECT holder, expires_at FROM singleton_lease")) {
      return [lease ? [{ holder: lease.holder, expires_at: new Date(0) }] : [], []];
    }
    if (head.startsWith("UPDATE singleton_lease SET holder = ?")) {
      if (!lease || !lease.free) { return [{ affectedRows: 0 }, []]; }
      lease = { holder: String(p?.[0]), free: false };
      return [{ affectedRows: 1 }, []];
    }
    if (head.startsWith("UPDATE singleton_lease SET expires_at = NOW(3) - INTERVAL 1 SECOND")) {
      const ok = lease !== undefined && lease.holder === String(p?.[1]);
      if (ok && lease) { lease = { ...lease, free: true }; }
      return [{ affectedRows: ok ? 1 : 0 }, []];
    }
    if (head.startsWith("SELECT sha256, statement_count, applied_statements FROM kit_migration")) {
      const row = ledger.get(`${String(p?.[0])}\n${String(p?.[1])}`);
      return [row === undefined ? [] : [{ sha256: row.sha256, statement_count: row.count, applied_statements: row.applied }], []];
    }
    if (head.startsWith("INSERT INTO kit_migration (kit_id, file, sha256, statement_count, applied_statements)")) {
      ledger.set(`${String(p?.[0])}\n${String(p?.[1])}`, { sha256: String(p?.[2]), count: Number(p?.[3]), applied: 0 });
      return [{ affectedRows: 1 }, []];
    }
    if (head.startsWith("UPDATE kit_migration SET applied_statements = ?, applied_at = NOW(3)")) {
      const key = `${String(p?.[1])}\n${String(p?.[2])}`;
      const row = ledger.get(key);
      if (!row) { throw new Error(`fake: 进度更新前账本无行 ${key}`); }
      ledger.set(key, { ...row, applied: Number(p?.[0]) });
      return [{ affectedRows: 1 }, []];
    }
    if (head.startsWith("SELECT DISTINCT kit_id FROM kit_migration")) {
      const ids = new Set([...ledger.keys()].map((k) => k.split("\n")[0]));
      return [[...ids].map((kit_id) => ({ kit_id })), []];
    }
    if (head.includes("information_schema.TABLES")) {
      return [schema.tables.map((TABLE_NAME) => ({
        TABLE_NAME,
        ENGINE: schema.engines !== undefined && TABLE_NAME in schema.engines ? schema.engines[TABLE_NAME] : "InnoDB",
      })), []];
    }
    if (head.includes("information_schema.COLUMNS")) {
      return [Object.entries(schema.serverId).map(([TABLE_NAME, c]) => ({ TABLE_NAME, ...c })), []];
    }
    if (head.includes("information_schema.STATISTICS")) {
      return [schema.uniques.map((u) => ({ ...u })), []];
    }
    // 其余 = kit 迁移语句
    kitStatementCount += 1;
    if (failArmed && options.failStatementAt === kitStatementCount) {
      failArmed = false;
      throw new Error("ER_FAKE: Table 'k_kfix_tile' already exists");
    }
    executed.push(sql);
    return [{ affectedRows: 0 }, []];
  };
  return { query, calls, executed, ledger };
}

const readFixture = (files: Record<string, string>) => (kitId: string, file: string): string => {
  const text = files[`${kitId}/${file}`];
  if (text === undefined) { throw new Error(`fixture 缺少 ${kitId}/${file}`); }
  return text;
};

test("applyKitMigrations：首次应用写账本；同 sha 再跑零 DDL；租约先取后放", async () => {
  const conn = fakeConn({ lease: { holder: "", free: true } });
  const logs: string[] = [];
  const first = await applyKitMigrations({
    conn, dbName: "game_t", catalog: [KFIX], holder: "h1", leaseSeconds: 60,
    readSqlFile: readFixture({ "kfix/sql/001-init.sql": INIT_SQL }), log: (l) => logs.push(l),
  });
  assert.deepEqual(first, { applied: [{ kitId: "kfix", file: "sql/001-init.sql" }], skipped: 0, orphanLedgerKits: [] });
  assert.equal(conn.executed.length, 3, "三条语句各自一次 query");
  assert.deepEqual(conn.ledger.get("kfix\nsql/001-init.sql"), { sha256: sha256Hex(INIT_SQL), count: 3, applied: 3 });
  // 账本先入账（0/3）再执行，每条成功即推进：INSERT 账本 → 语句1 → 进度1 → 语句2 → 进度2 → 语句3 → 进度3
  const kitOps = conn.calls
    .map((c) => (c.sql.startsWith("INSERT INTO kit_migration") ? "ledger:insert"
      : c.sql.startsWith("UPDATE kit_migration") ? "ledger:step"
        : conn.executed.includes(c.sql) ? "exec" : ""))
    .filter((op) => op !== "");
  assert.deepEqual(kitOps, ["ledger:insert", "exec", "ledger:step", "exec", "ledger:step", "exec", "ledger:step"]);
  // 调用顺序：SELECT lease → UPDATE 取租约 → … → 释放租约在最后
  assert.match(conn.calls[0].sql, /SELECT holder, expires_at FROM singleton_lease/u);
  assert.match(conn.calls[1].sql, /UPDATE singleton_lease/u);
  assert.deepEqual(conn.calls[1].params, ["h1", 60, "db_bootstrap"]);
  assert.match(conn.calls[1].sql, /WHERE lease_name = \? AND expires_at < NOW\(3\)/u, "抢占谓词是严格小于");
  const last = conn.calls[conn.calls.length - 1];
  // 释放必须退到严格过去：`= NOW(3)` 会让同一毫秒内的下一次 bootstrap 被自己上一轮的租约挡住
  assert.match(last.sql, /SET expires_at = NOW\(3\) - INTERVAL 1 SECOND WHERE lease_name = \? AND holder = \?/u);
  assert.deepEqual(last.params, ["db_bootstrap", "h1"]);
  assert.ok(logs.some((l) => l.includes("已应用 sql/001-init.sql")));

  const again = await applyKitMigrations({
    conn, dbName: "game_t", catalog: [KFIX], holder: "h1",
    readSqlFile: readFixture({ "kfix/sql/001-init.sql": INIT_SQL }),
  });
  assert.deepEqual(again, { applied: [], skipped: 1, orphanLedgerKits: [] });
  assert.equal(conn.executed.length, 3, "第二次零 DDL");
});

test("applyKitMigrations：已应用文件 sha 变化 ⇒ fail-closed，点名 kit/file/两个 hash，且不执行任何语句", async () => {
  const conn = fakeConn({
    lease: { holder: "", free: true },
    ledger: new Map([["kfix\nsql/001-init.sql", done(sha256Hex(INIT_SQL))]]),
  });
  const changed = `${INIT_SQL}\n-- touched`;
  await assert.rejects(
    applyKitMigrations({ conn, dbName: "game_t", catalog: [KFIX], holder: "h", readSqlFile: readFixture({ "kfix/sql/001-init.sql": changed }) }),
    (e: Error) => e.message.includes("⛔ 已应用的迁移文件被改动")
      && e.message.includes("kfix") && e.message.includes("sql/001-init.sql")
      && e.message.includes(sha256Hex(INIT_SQL)) && e.message.includes(sha256Hex(changed)),
  );
  assert.equal(conn.executed.length, 0);
  assert.match(conn.calls[conn.calls.length - 1].sql, /SET expires_at = NOW\(3\) - INTERVAL 1 SECOND/u, "失败也释放租约");

  // 半应用（1/3）的文件被改动：同样 fail-closed，且点名进度（已执行的语句无法撤回）
  const partial = fakeConn({
    lease: { holder: "", free: true },
    ledger: new Map([["kfix\nsql/001-init.sql", { sha256: sha256Hex(INIT_SQL), count: 3, applied: 1 }]]),
  });
  await assert.rejects(
    applyKitMigrations({ conn: partial, dbName: "game_t", catalog: [KFIX], holder: "h", readSqlFile: readFixture({ "kfix/sql/001-init.sql": changed }) }),
    /⛔ 已应用的迁移文件被改动：kit "kfix" sql\/001-init\.sql.*上次只跑到 1\/3 条/u,
  );
  assert.equal(partial.executed.length, 0);
});

test("applyKitMigrations：目录里两个 kit 只差大小写 ⇒ 取租约前就拒（表前缀撞车）", async () => {
  const conn = fakeConn({ lease: { holder: "", free: true } });
  await assert.rejects(
    applyKitMigrations({ conn, dbName: "g", catalog: [KFIX, { ...KFIX, id: "kFix" }], holder: "h", readSqlFile: readFixture({}) }),
    /"kfix" 与 "kFix" 只差大小写/u,
  );
  assert.equal(conn.calls.length, 0);
});

test("applyKitMigrations：租约被持有 / 缺预置行 ⇒ 拒绝", async () => {
  const held = fakeConn({ lease: { holder: "other-host:42", free: false } });
  await assert.rejects(
    applyKitMigrations({ conn: held, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: readFixture({}) }),
    /另一个 db:bootstrap 正在运行（db_bootstrap 租约被 other-host:42 持有）/u,
  );
  assert.equal(held.calls.length, 2, "取租约失败即停：不读文件、不释放别人的租约");

  const missing = fakeConn({});
  await assert.rejects(
    applyKitMigrations({ conn: missing, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: readFixture({}) }),
    /缺少 'db_bootstrap' 预置行/u,
  );
});

test("applyKitMigrations：lint 失败在执行前中止（整文件一条都不跑、不入账本）", async () => {
  const conn = fakeConn({ lease: { holder: "", free: true } });
  const bad = `CREATE TABLE k_kfix_tile (server_id SMALLINT UNSIGNED NOT NULL, PRIMARY KEY (server_id));
DROP TABLE user_currency;`;
  await assert.rejects(
    applyKitMigrations({ conn, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: readFixture({ "kfix/sql/001-init.sql": bad }) }),
    /DROP/u,
  );
  assert.equal(conn.executed.length, 0);
  assert.equal(conn.ledger.size, 0);
});

test("applyKitMigrations：语句执行错误归因到 kit/file/序号与语句前 120 字；账本记下进度，重跑从失败那条续跑", async () => {
  const conn = fakeConn({ lease: { holder: "", free: true }, failStatementAt: 2 });
  const files = readFixture({ "kfix/sql/001-init.sql": INIT_SQL });
  await assert.rejects(
    applyKitMigrations({ conn, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: files }),
    (e: Error) => /kit "kfix" sql\/001-init\.sql 第 2\/3 条语句执行失败：.*already exists/u.test(e.message)
      && e.message.includes("账本已记进度 1/3")
      && e.message.includes("语句：CREATE TABLE IF NOT EXISTS k_kfix_world"),
  );
  assert.equal(conn.executed.length, 1, "第一条已执行，第二条失败即停");
  assert.deepEqual(conn.ledger.get("kfix\nsql/001-init.sql"), { sha256: sha256Hex(INIT_SQL), count: 3, applied: 1 }, "半个文件：账本记 1/3");
  assert.match(conn.calls[conn.calls.length - 1].sql, /SET expires_at = NOW\(3\) - INTERVAL 1 SECOND/u, "失败也释放租约");

  // 重跑：⛔ 不重跑第 1 条（那张 CREATE TABLE 已存在），从第 2 条续跑到完
  const logs: string[] = [];
  const resumed = await applyKitMigrations({ conn, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: files, log: (l) => logs.push(l) });
  assert.deepEqual(resumed, { applied: [{ kitId: "kfix", file: "sql/001-init.sql" }], skipped: 0, orphanLedgerKits: [] });
  assert.equal(conn.executed.length, 3);
  assert.match(conn.executed[1], /^CREATE TABLE IF NOT EXISTS k_kfix_world/u);
  assert.match(conn.executed[2], /^INSERT INTO k_kfix_world/u);
  assert.equal(conn.executed.filter((s) => s.startsWith("CREATE TABLE IF NOT EXISTS k_kfix_tile")).length, 1, "第 1 条只跑过一次");
  assert.deepEqual(conn.ledger.get("kfix\nsql/001-init.sql"), { sha256: sha256Hex(INIT_SQL), count: 3, applied: 3 });
  assert.ok(logs.some((l) => l.includes("上次跑到 1/3 条，续跑")));
  assert.ok(logs.some((l) => l.includes("已应用 sql/001-init.sql（2 条语句）")));

  // 再跑：已完成 ⇒ 跳过
  const again = await applyKitMigrations({ conn, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: files });
  assert.deepEqual(again, { applied: [], skipped: 1, orphanLedgerKits: [] });
  assert.equal(conn.executed.length, 3);
});

test("applyKitMigrations：账本语句数与当前切分不一致（同 sha）⇒ 拒绝续跑", async () => {
  const conn = fakeConn({
    lease: { holder: "", free: true },
    ledger: new Map([["kfix\nsql/001-init.sql", { sha256: sha256Hex(INIT_SQL), count: 4, applied: 1 }]]),
  });
  await assert.rejects(
    applyKitMigrations({ conn, dbName: "g", catalog: [KFIX], holder: "h", readSqlFile: readFixture({ "kfix/sql/001-init.sql": INIT_SQL }) }),
    /账本记的语句数（4）与当前切分结果（3）不一致/u,
  );
  assert.equal(conn.executed.length, 0);
});

test("applyKitMigrations：kit 按 id 排序、文件按 sqlFiles 顺序；非法文件名拒绝", async () => {
  const kb: ServerKitCatalogEntry = { ...KFIX, id: "kb", sqlFiles: ["sql/001-a.sql", "sql/002-b.sql"], sqlTables: [{ name: "k_kb_t", zone: "global" }] };
  const ka: ServerKitCatalogEntry = { ...KFIX, id: "ka", sqlFiles: ["sql/001-a.sql"], sqlTables: [{ name: "k_ka_t", zone: "global" }] };
  const conn = fakeConn({
    lease: { holder: "", free: true },
    schema: { tables: ["k_kb_t", "k_ka_t"], serverId: {}, uniques: [
      { TABLE_NAME: "k_kb_t", INDEX_NAME: "PRIMARY", COLUMN_NAME: "id" },
      { TABLE_NAME: "k_ka_t", INDEX_NAME: "PRIMARY", COLUMN_NAME: "id" },
    ] },
  });
  const report = await applyKitMigrations({
    conn, dbName: "g", catalog: [kb, ka], holder: "h",
    readSqlFile: readFixture({
      "kb/sql/001-a.sql": "CREATE TABLE k_kb_t (id INT, PRIMARY KEY (id))",
      "kb/sql/002-b.sql": "ALTER TABLE k_kb_t ADD COLUMN v INT",
      "ka/sql/001-a.sql": "CREATE TABLE k_ka_t (id INT, PRIMARY KEY (id))",
    }),
  });
  assert.deepEqual(report.applied, [
    { kitId: "ka", file: "sql/001-a.sql" },
    { kitId: "kb", file: "sql/001-a.sql" },
    { kitId: "kb", file: "sql/002-b.sql" },
  ]);

  const evil: ServerKitCatalogEntry = { ...ka, sqlFiles: ["../../../etc/passwd"] };
  await assert.rejects(
    applyKitMigrations({ conn: fakeConn({ lease: { holder: "", free: true } }), dbName: "g", catalog: [evil], holder: "h", readSqlFile: readFixture({}) }),
    /迁移文件名非法/u,
  );
});

test("applyKitMigrations：账本有而目录无的 kit 只告警并回报 orphanLedgerKits", async () => {
  const conn = fakeConn({
    lease: { holder: "", free: true },
    ledger: new Map([["gone\nsql/001-init.sql", done("0".repeat(64), 1)], ["kfix\nsql/001-init.sql", done(sha256Hex(INIT_SQL))]]),
  });
  const logs: string[] = [];
  const report = await applyKitMigrations({
    conn, dbName: "g", catalog: [KFIX], holder: "h", log: (l) => logs.push(l),
    readSqlFile: readFixture({ "kfix/sql/001-init.sql": INIT_SQL }),
  });
  assert.deepEqual(report, { applied: [], skipped: 1, orphanLedgerKits: ["gone"] });
  assert.ok(logs.some((l) => l.includes("⚠") && l.includes('"gone"')));
});

// ── verifyKitTableShapes（假 INFORMATION_SCHEMA） ─────────────────────────

async function verifyWith(schema: SchemaAnswers, catalog: readonly ServerKitCatalogEntry[] = [KFIX]): Promise<void> {
  await verifyKitTableShapes({ conn: fakeConn({ schema }), dbName: "g", catalog });
}

test("verifyKitTableShapes：目标形态通过", async () => {
  await verifyWith(GOOD_SCHEMA);
});

test("verifyKitTableShapes：声明的表不存在 ⇒ 抛", async () => {
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, tables: GOOD_SCHEMA.tables.filter((t) => t !== "k_kfix_world") }),
    /kit "kfix" 声明的表未被迁移创建：k_kfix_world/u,
  );
});

test("verifyKitTableShapes：per-zone 缺 server_id / 类型不对 / 不在 PK / UNIQUE 不含 ⇒ 抛", async () => {
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, serverId: { user_currency: GOOD_SCHEMA.serverId.user_currency } }),
    /per-zone 表 k_kfix_tile 缺少 server_id 列/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, serverId: { ...GOOD_SCHEMA.serverId, k_kfix_tile: { DATA_TYPE: "int", COLUMN_TYPE: "int unsigned", IS_NULLABLE: "NO" } } }),
    /k_kfix_tile\.server_id 定义不匹配：期望 SMALLINT UNSIGNED NOT NULL/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, uniques: [
      { TABLE_NAME: "k_kfix_tile", INDEX_NAME: "PRIMARY", COLUMN_NAME: "x" },
      { TABLE_NAME: "k_kfix_world", INDEX_NAME: "PRIMARY", COLUMN_NAME: "world_id" },
    ] }),
    /k_kfix_tile 的 PRIMARY KEY \(x\) 不含 server_id/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, uniques: [
      ...GOOD_SCHEMA.uniques,
      { TABLE_NAME: "k_kfix_tile", INDEX_NAME: "uk_owner", COLUMN_NAME: "owner" },
    ] }),
    /k_kfix_tile 的 UNIQUE uk_owner \(owner\) 不含 server_id/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, uniques: GOOD_SCHEMA.uniques.filter((u) => u.TABLE_NAME !== "k_kfix_tile") }),
    /k_kfix_tile 没有 PRIMARY KEY/u,
  );
});

test("verifyKitTableShapes：kit 表的实际引擎必须是 InnoDB（迁移文本看不见的既有表 / 带外建的表兜底）", async () => {
  // withKitTx 的「世界状态在 SQL、经济在框架」原子路径依赖事务行锁；非事务引擎会让 kit 侧的写
  // 在框架回滚后留下来。与框架自有表的 verifyArchiveTableEngines（db-bootstrap.ts）同一判据。
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, engines: { k_kfix_tile: "MyISAM" } }),
    /kit "kfix" 的表 k_kfix_tile\.ENGINE 定义不匹配：期望 InnoDB，实际 MyISAM/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, engines: { k_kfix_world: "MEMORY" } }),
    /kit "kfix" 的表 k_kfix_world\.ENGINE 定义不匹配：期望 InnoDB，实际 MEMORY/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, engines: { k_kfix_tile: null } }),
    /kit "kfix" 的表 k_kfix_tile\.ENGINE 定义不匹配：期望 InnoDB，实际 missing/u,
  );
  // 大小写不敏感：information_schema 回 "InnoDB"，比对按小写
  await assert.doesNotReject(verifyWith({ ...GOOD_SCHEMA, engines: { k_kfix_tile: "INNODB" } }));
  // 框架表不归 kit 闸管（只判 catalog 声明的 kit 表）
  await assert.doesNotReject(verifyWith({ ...GOOD_SCHEMA, engines: { user_currency: "MyISAM" } }));
});

test("verifyKitTableShapes：global 表带 server_id ⇒ 抛；未声明的 k_<id>_ 前缀表 ⇒ 抛", async () => {
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, serverId: { ...GOOD_SCHEMA.serverId, k_kfix_world: GOOD_SCHEMA.serverId.k_kfix_tile } }),
    /global 表 k_kfix_world 不得有 server_id 列/u,
  );
  await assert.rejects(
    verifyWith({ ...GOOD_SCHEMA, tables: [...GOOD_SCHEMA.tables, "k_kfix_stray"] }),
    /kit "kfix" 前缀（k_kfix_）的表 k_kfix_stray 却未在 kit.json.sql.tables 声明/u,
  );
  // 别的 kit 的表不算本 kit 的孤儿；框架表更不算
  await verifyWith({ ...GOOD_SCHEMA, tables: [...GOOD_SCHEMA.tables, "k_kfixx_t", "k_other_t"] });
});
