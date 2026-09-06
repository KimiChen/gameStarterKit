/**
 * `plugin -- uninstall --drop-data` 数据清理（tools/plugin/dropData.ts，docs/KIT.md §5）单测：
 * 假 MySQL 连接 / 假 Redis 客户端按剧本作答，⛔ 不连真库；真库 FK 父子表回归在 test/int/kit-migrations.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { REDIS_KEY_PREFIX } from "../src/core/infra/config";
import {
  dropKitData, dropKitRedisKeys, dropKitTables, isKitRedisKey, kitRedisScanPattern,
  type DropSqlConn, type ScanUnlinkClient,
} from "../tools/plugin/dropData";

interface Call { sql: string; params: unknown[] | undefined }

function fakeConn(tables: string[], ledgerRows: number): DropSqlConn & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async query(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
      calls.push({ sql: sql.trim().replace(/\s+/g, " "), params });
      if (sql.includes("information_schema.TABLES")) {
        const like = String(params?.[1] ?? "").replace(/\\([\\%_])/g, "$1").replace(/%$/, "");
        return [tables.filter((t) => t.startsWith(like)).map((TABLE_NAME) => ({ TABLE_NAME })), []];
      }
      if (sql.includes("COUNT(*) AS n FROM kit_migration")) { return [[{ n: ledgerRows }], []]; }
      return [{ affectedRows: 0 }, []];
    },
  };
}

test("dropKitTables：关外键检查后按名 drop 全部前缀表，再删账本行；表名反引号转义", async () => {
  const conn = fakeConn(["k_kfix_b", "k_kfix_a", "k_kfixx_t", "k_other_t", "kit_migration", "k_kfix_we`ird"], 2);
  const logs: string[] = [];
  const report = await dropKitTables({ conn, dbName: "game_t", kitId: "kfix", log: (l) => logs.push(l) });
  assert.deepEqual(report, { tables: ["k_kfix_a", "k_kfix_b", "k_kfix_we`ird"], ledgerRows: 2 });
  const sqls = conn.calls.map((c) => c.sql);
  const fkOff = sqls.indexOf("SET FOREIGN_KEY_CHECKS = 0");
  const firstDrop = sqls.findIndex((s) => s.startsWith("DROP TABLE"));
  const fkOn = sqls.indexOf("SET FOREIGN_KEY_CHECKS = 1");
  const del = sqls.findIndex((s) => s.startsWith("DELETE FROM kit_migration"));
  assert.ok(fkOff >= 0 && fkOff < firstDrop, "父表按名排在子表前也不能被 ER_FK_CANNOT_DROP_PARENT 挡住：先关外键检查");
  assert.deepEqual(sqls.filter((s) => s.startsWith("DROP TABLE")), [
    "DROP TABLE `k_kfix_a`", "DROP TABLE `k_kfix_b`", "DROP TABLE `k_kfix_we``ird`",
  ]);
  assert.ok(fkOn > firstDrop && fkOn < del, "drop 完恢复外键检查，再删账本");
  assert.deepEqual(conn.calls[del].params, ["kfix"]);
  assert.equal(conn.calls[0].params?.[1], "k\\_kfix\\_%", "LIKE 里的 _ 是字面量");
  assert.ok(logs.some((l) => l.includes("DELETE kit_migration（2 行）")));
});

test("dropKitTables：dryRun 只数不写；无前缀表时不动外键检查", async () => {
  const conn = fakeConn(["k_kfix_a"], 1);
  const report = await dropKitTables({ conn, dbName: "g", kitId: "kfix", dryRun: true });
  assert.deepEqual(report, { tables: ["k_kfix_a"], ledgerRows: 1 });
  assert.ok(conn.calls.every((c) => c.sql.startsWith("SELECT")), "dry-run 只有 SELECT");

  const empty = fakeConn([], 0);
  assert.deepEqual(await dropKitTables({ conn: empty, dbName: "g", kitId: "kfix" }), { tables: [], ledgerRows: 0 });
  assert.ok(!empty.calls.some((c) => c.sql.startsWith("SET FOREIGN_KEY_CHECKS")));
  assert.ok(empty.calls.some((c) => c.sql.startsWith("DELETE FROM kit_migration")), "账本行仍清");

  await assert.rejects(dropKitTables({ conn: empty, dbName: "g", kitId: "k_fix" }), /kit id 非法/u);
});

test("isKitRedisKey：只认 <项目前缀>(s<sId>_)?kt:<kitId>: 形态", () => {
  assert.equal(isKitRedisKey("gono_kt:kfix:score:{u1}", "kfix", "gono_"), true);
  assert.equal(isKitRedisKey("gono_s3_kt:kfix:score:{u1}", "kfix", "gono_"), true);
  assert.equal(isKitRedisKey("gono_pl:mkt:kfix:{u1}", "kfix", "gono_"), false, "插件 mkt 的键 kfix 只是子串");
  assert.equal(isKitRedisKey("gono_kt:kfixx:score:{u1}", "kfix", "gono_"), false);
  assert.equal(isKitRedisKey("gono_kt:kfix:{u1}", "kfix", "gono_"), true);
  assert.equal(isKitRedisKey("other_kt:kfix:score:{u1}", "kfix", "gono_"), false, "别的项目前缀");
  assert.equal(isKitRedisKey("gono_x_kt:kfix:score:{u1}", "kfix", "gono_"), false);
  assert.equal(isKitRedisKey(`${REDIS_KEY_PREFIX}kt:kfix:a:{u}`, "kfix"), true, "缺省用 config 前缀");
  assert.equal(kitRedisScanPattern("kfix"), "*kt:kfix:*");
});

function fakeRedis(pages: string[][]): ScanUnlinkClient & { unlinked: string[][]; scans: string[] } {
  const unlinked: string[][] = [];
  const scans: string[] = [];
  return {
    unlinked,
    scans,
    async scan(cursor, _m, pattern, _c, count): Promise<[string, string[]]> {
      scans.push(`${cursor}:${pattern}:${count}`);
      const idx = Number(cursor);
      const next = idx + 1 < pages.length ? String(idx + 1) : "0";
      return [next, pages[idx] ?? []];
    },
    async unlink(...keys: string[]): Promise<number> {
      unlinked.push(keys);
      return keys.length;
    },
  };
}

test("dropKitRedisKeys：MATCH 粗筛后精确过滤（别的包含子串的键不删）、≤500 一批、每个节点各扫一遍、dryRun 只数", async () => {
  const many = Array.from({ length: 1200 }, (_, i) => `gono_kt:kfix:score:{u${i}}`);
  const a = fakeRedis([
    ["gono_kt:kfix:score:{u1}", "gono_pl:mkt:kfix:{u1}", "gono_s2_kt:kfix:score:{u2}", "gono_kt:kfixx:x:{u3}"],
    many,
  ]);
  const b = fakeRedis([["gono_kt:kfix:score:{u9}"]]);
  const n = await dropKitRedisKeys({ clients: [a, b], kitId: "kfix", keyPrefix: "gono_" });
  assert.equal(n, 2 + 1200 + 1);
  assert.deepEqual(a.scans, ["0:*kt:kfix:*:1000", "1:*kt:kfix:*:1000"]);
  const flat = a.unlinked.flat();
  assert.ok(!flat.includes("gono_pl:mkt:kfix:{u1}"), "插件 mkt 的键不被误删");
  assert.ok(!flat.includes("gono_kt:kfixx:x:{u3}"));
  assert.ok(flat.includes("gono_s2_kt:kfix:score:{u2}"), "区服前缀的 kit 键要删");
  assert.equal(flat.length, 1202);
  assert.ok(a.unlinked.every((batch) => batch.length <= 500), "UNLINK 每批 ≤500");
  assert.deepEqual(b.unlinked, [["gono_kt:kfix:score:{u9}"]]);

  const dry = fakeRedis([["gono_kt:kfix:score:{u1}", "gono_pl:mkt:kfix:{u1}"]]);
  assert.equal(await dropKitRedisKeys({ clients: [dry], kitId: "kfix", dryRun: true, keyPrefix: "gono_" }), 1);
  assert.deepEqual(dry.unlinked, []);
});

test("dropKitData：目录里有只差大小写的另一个 kit ⇒ 连库前就拒（前缀清单会连它的表一起 drop）", async () => {
  const kFix = {
    id: "kFix", version: null, api: {}, modes: [], domains: [], effects: [], sqlFiles: [], sqlTables: [], userKeys: [],
  };
  await assert.rejects(
    dropKitData({ kitId: "kfix", dryRun: true, mysqlUrl: "mysql://root@127.0.0.1:1/x", catalog: [kFix] }),
    /"kFix" 与 "kfix" 只差大小写/u,
  );
  await assert.rejects(dropKitData({ kitId: "K-fix", dryRun: true, catalog: [] }), /kit id 非法/u);
});
