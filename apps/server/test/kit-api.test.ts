/**
 * kit-api/server 门面（core/infra/kitApi.ts，docs/KIT.md §4）单测：
 * - `assertKitTableAccess` 表闸矩阵：本 kit 前缀（裸 / backtick / JOIN / STRAIGHT_JOIN / INSERT INTO / 多表 / 别名 /
 *   派生表 / PARTITION / 索引提示 / DELETE … USING）放行，框架表、别的 kit、schema 限定名、注释绕过（含 `/*!` 可执行
 *   注释）、括号表引用、JOIN 条件后逗号接续、提示组后逗号接续、DDL / 多语句一律拒绝；
 * - `kitOpId` 命名空间化与确定性；
 * - `withKitTx` 用假 pool：越界 SQL / 非原始值参数在触达连接前抛出、query 走 execute、debit / credit 绑定 sId、
 *   enqueueEffect 拒别的 kit 的 kind、"DUP" 回读比对（冲突上抛）、提交后逐 uid 失效余额缓存、回调抛出即回滚且不失效缓存；
 * - `kitEffectKeysFor` 纯投影：键去重、序号紧随 bag 之后、map 形态；
 * - APPLY_EFFECT Lua 文本含 kit 分支且键数表达式引用 ARGV[4] 投影。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KitEffectScopeError, KitTableAccessError, assertKitEffectScope, assertKitTableAccess, kitOpId, kitTablePrefix, withKitTx,
  type KitTxDeps,
} from "../src/core/infra/kitApi";
import { EffectConflictError, InvalidEffectError } from "../src/core/errors";
import type { PoolConnection } from "../src/core/infra/mysql";
import { deriveOpId, kitEffectKeysFor } from "../src/core/economy/outbox";
import { APPLY_EFFECT } from "../src/core/infra/redisScripts";
import { BAG_SHARDS } from "../src/core/infra/config";
import { kBagAll, kKitUser, kUser, zoneCtx } from "../src/core/infra/keys";
import type { KitEffectSpec } from "@game/shared/kits/catalogTypes";
import { EFFECT_SCHEMA_VERSION, type IEffect } from "@game/shared";

const denied = (sql: string, kitId = "arena"): void => {
  assert.throws(() => assertKitTableAccess(sql, kitId), KitTableAccessError, `应拒绝：${sql}`);
};
const allowed = (sql: string, kitId = "arena"): string[] => assertKitTableAccess(sql, kitId);

test("kitTablePrefix：小写 + 下划线包裹；kitId 形态闸", () => {
  assert.equal(kitTablePrefix("arena"), "k_arena_");
  assert.equal(kitTablePrefix("slgWorld"), "k_slgworld_");
  assert.throws(() => kitTablePrefix("Arena"), TypeError);
  assert.throws(() => kitTablePrefix("a_b"), TypeError);
  assert.throws(() => kitTablePrefix(""), TypeError);
});

test("表闸放行：本 kit 前缀的裸名 / backtick / JOIN / INSERT INTO / 多表 / 别名 / 子查询 / ODKU / FOR UPDATE", () => {
  assert.deepEqual(allowed("SELECT * FROM k_arena_tile WHERE id = ?"), ["k_arena_tile"]);
  assert.deepEqual(allowed("select x from `k_arena_tile` for update"), ["k_arena_tile"]);
  assert.deepEqual(
    allowed("SELECT t.x FROM k_arena_tile t JOIN `k_arena_owner` AS o ON o.tile = t.id LEFT JOIN k_arena_log l USING (id)"),
    ["k_arena_tile", "k_arena_owner", "k_arena_log"],
  );
  assert.deepEqual(
    allowed("INSERT INTO k_arena_tile (server_id, id, owner) VALUES (?,?,?) ON DUPLICATE KEY UPDATE owner = VALUES(owner)"),
    ["k_arena_tile"],
  );
  assert.deepEqual(allowed("UPDATE k_arena_tile SET owner = ? WHERE id = ? AND server_id = ?"), ["k_arena_tile"]);
  assert.deepEqual(allowed("DELETE FROM k_arena_tile WHERE id = ?"), ["k_arena_tile"]);
  assert.deepEqual(allowed("REPLACE INTO k_arena_tile (id) VALUES (?)"), ["k_arena_tile"]);
  assert.deepEqual(allowed("SELECT a.x FROM k_arena_a a, k_arena_b b WHERE a.id = b.id"), ["k_arena_a", "k_arena_b"]);
  // 派生表：外层 FROM 先扫到 JOIN 的 owner，内层 FROM 再扫到 tile（按首次出现去重）
  assert.deepEqual(
    allowed("SELECT * FROM (SELECT id FROM k_arena_tile) AS d JOIN k_arena_owner o ON o.tile = d.id"),
    ["k_arena_owner", "k_arena_tile"],
  );
  assert.deepEqual(allowed("SELECT * FROM (WITH x AS (SELECT 1) SELECT id FROM k_arena_tile) d"), ["k_arena_tile"]);
  // STRAIGHT_JOIN / DELETE … USING / 表名后的 PARTITION 与索引提示组 / JOIN 条件后逗号接续（全是本 kit 表）
  assert.deepEqual(
    allowed("SELECT * FROM k_arena_tile t STRAIGHT_JOIN k_arena_owner o ON o.tile = t.id"),
    ["k_arena_tile", "k_arena_owner"],
  );
  assert.deepEqual(
    allowed("DELETE FROM k_arena_a USING k_arena_a JOIN k_arena_b USING (id) WHERE k_arena_b.x = 1"),
    ["k_arena_a", "k_arena_b"],
  );
  assert.deepEqual(allowed("SELECT * FROM k_arena_tile PARTITION (p0, p1) t USE INDEX (PRIMARY), k_arena_owner"),
    ["k_arena_tile", "k_arena_owner"]);
  assert.deepEqual(
    allowed("SELECT * FROM k_arena_tile FORCE INDEX FOR ORDER BY (idx_a) IGNORE KEY FOR JOIN (idx_b) JOIN k_arena_owner USING (id)"),
    ["k_arena_tile", "k_arena_owner"],
  );
  assert.deepEqual(allowed("SELECT * FROM k_arena_a a JOIN k_arena_b b ON a.id = b.id AND b.y IN (1, 2), k_arena_c c"),
    ["k_arena_a", "k_arena_b", "k_arena_c"]);
  assert.deepEqual(allowed("UPDATE k_arena_a a JOIN k_arena_b b ON a.id = b.id SET a.x = (SELECT MAX(y) FROM k_arena_c)"),
    ["k_arena_a", "k_arena_b", "k_arena_c"]);
  assert.deepEqual(allowed("INSERT INTO k_arena_a (id, x) SELECT id, x FROM k_arena_b WHERE x > ?"), ["k_arena_a", "k_arena_b"]);
  assert.deepEqual(allowed("SELECT * FROM k_arena_a WHERE EXISTS (SELECT 1 FROM k_arena_b WHERE k_arena_b.a = k_arena_a.id)"),
    ["k_arena_a", "k_arena_b"]);
  assert.deepEqual(allowed("SELECT COUNT(*) FROM k_arena_tile WHERE note = 'FROM user_currency' -- FROM mail"), ["k_arena_tile"]);
  // 大小写归一：kit id 大小写混排也只认小写前缀
  assert.deepEqual(allowed("SELECT * FROM k_slgworld_map", "slgWorld"), ["k_slgworld_map"]);
  assert.deepEqual(allowed("SELECT * FROM K_ARENA_TILE"), ["K_ARENA_TILE"]);
});

test("表闸拒绝：框架表、别的 kit、schema 限定、注释绕过、DDL / 多语句 / 首词、识别不了的形态", () => {
  denied("SELECT balance FROM user_currency WHERE user_id = ?");
  denied("UPDATE user_currency SET balance = 0");
  denied("INSERT INTO gameplay_outbox (op_id) VALUES (?)");
  denied("DELETE FROM currency_ledger");
  denied("SELECT * FROM k_arena_tile t JOIN user_currency c ON c.user_id = t.owner");
  denied("SELECT * FROM k_arena_tile, mail");
  denied("UPDATE k_arena_tile t, user_currency c SET c.balance = 0");
  denied("SELECT * FROM `user_currency`");
  denied("SELECT * FROM k_slg_tile");                       // 别的 kit
  denied("SELECT * FROM k_arenax_tile");                    // 前缀必须整段匹配 k_arena_
  denied("SELECT * FROM game.k_arena_tile");                // schema 限定
  denied("SELECT * FROM `game`.`k_arena_tile`");
  denied("SELECT * FROM /* k_arena_tile */ user_currency"); // 注释绕过
  denied("SELECT * FROM user_currency # k_arena_tile");
  // 服务端会执行的 `/*! … */` 与优化器提示 `/*+ … */`：⛔ 一律拒（普通块注释才剥掉）
  denied("SELECT 1 FROM k_arena_tile /*! UNION SELECT balance FROM user_currency */");
  denied("SELECT * FROM k_arena_tile WHERE 1 /*!50000 UNION SELECT balance FROM user_currency */");
  denied("SELECT /*+ NO_INDEX(t) */ * FROM k_arena_tile t");
  // 括号表引用 `( table_references )`：只放行 (SELECT …) / (WITH …) 派生表
  denied("SELECT balance FROM (user_currency) WHERE user_id = ?");
  denied("SELECT * FROM k_arena_a, (user_currency)");
  denied("SELECT * FROM k_arena_tile JOIN (user_currency) c ON 1");
  denied("SELECT * FROM ((user_currency))");
  denied("DELETE FROM k_arena_a USING (user_currency)");
  // STRAIGHT_JOIN / DELETE … USING 也是表引用入口
  denied("SELECT c.balance FROM k_arena_tile t STRAIGHT_JOIN user_currency c ON c.user_id = t.owner");
  denied("DELETE FROM k_arena_a USING k_arena_a, user_currency WHERE 1");
  denied("DELETE FROM k_arena_a USING k_arena_a JOIN user_currency USING (id)");
  // 表名后的 PARTITION / 索引提示组之后、JOIN 条件之后的逗号接续
  denied("SELECT * FROM k_arena_tile USE INDEX (PRIMARY), user_currency");
  denied("SELECT * FROM k_arena_tile PARTITION (p0), user_currency");
  denied("SELECT * FROM k_arena_a a JOIN k_arena_b b ON a.id = b.id, user_currency");
  denied("SELECT * FROM k_arena_a JOIN k_arena_b USING (id), user_currency");
  denied("SELECT * FROM k_arena_a a JOIN k_arena_b b ON a.id = b.id AND b.y IN (1, 2), user_currency c");
  denied("UPDATE k_arena_a a JOIN user_currency c ON a.id = c.user_id SET c.balance = 0");
  denied("INSERT INTO k_arena_a (id) SELECT user_id FROM user_currency");
  denied("SELECT * FROM k_arena_a WHERE x IN (SELECT balance FROM user_currency)");
  denied("SELECT STRAIGHT_JOIN x FROM k_arena_a");               // SELECT 修饰词：fail-closed（kit 改写即可）
  denied("SELECT * FROM k_arena_tile USE INDEX PRIMARY");        // 提示组形态不识别：fail-closed
  denied("SELECT * FROM k_arena_tile PARTITION p0");
  denied("SELECT * FROM LATERAL (SELECT 1) d");
  denied("SELECT 1 FROM DUAL");
  denied("SELECT * FROM (SELECT 1 FROM k_arena_a");               // 括号未闭合
  denied("CREATE TABLE k_arena_tmp (id INT)");              // DDL 隐式提交
  denied("DROP TABLE k_arena_tile");
  denied("ALTER TABLE k_arena_tile ADD COLUMN x INT");
  denied("TRUNCATE k_arena_tile");
  denied("LOCK TABLES user_currency WRITE");
  denied("SET @x = 1");
  denied("SELECT 1 FROM k_arena_tile; DELETE FROM user_currency");
  denied("SELECT id INTO @v FROM k_arena_tile");            // INTO 后不是表引用：fail-closed
  denied("SELECT EXTRACT(YEAR FROM created_at) FROM k_arena_tile"); // 函数内 FROM：fail-closed
  denied("WITH c AS (SELECT * FROM k_arena_tile) SELECT * FROM c");  // CTE 名：fail-closed（用前缀命名即可）
  denied("SELECT * FROM 'k_arena_tile");                    // 未闭合字面量
  denied("");
});

test("表闸拒绝：backtick 标识符里的引号 / 注释字符不得让剥离器与 MySQL 词法错位", () => {
  // MySQL 把 `…` 当一个原子，里面的 ' " # -- /* 都不是字面量/注释起点。剥离器若不认 backtick，
  // 两个这样的标识符之间的整段（含 FROM/JOIN）会被当作字符串删掉，表引用就此对表闸隐身。
  denied("SELECT 1 AS `x'`, (SELECT balance FROM user_currency LIMIT 1) AS `y'` FROM k_arena_tile");
  denied('SELECT 1 AS `x"`, (SELECT balance FROM user_currency LIMIT 1) AS `y"` FROM k_arena_tile');
  denied("SELECT 1 AS `x#`, (SELECT balance FROM user_currency LIMIT 1) AS `y#` FROM k_arena_tile");
  denied("SELECT 1 AS `a-- `, (SELECT balance FROM user_currency LIMIT 1) AS `b` FROM k_arena_tile");
  denied("SELECT 1 AS `a/*`, (SELECT balance FROM user_currency LIMIT 1) AS `b*/` FROM k_arena_tile");
  // 写侧同形：多表 UPDATE / DELETE 借同一处错位夹带框架表
  denied("UPDATE k_arena_tile t, (SELECT 1 AS `a'`) d1, user_currency c, (SELECT 2 AS `b'`) d2 SET c.balance = 999999");
  denied("DELETE c FROM k_arena_tile t, (SELECT 1 AS `a'`) d1, currency_ledger c, (SELECT 2 AS `b'`) d2");
  // 双写转义 `` 是 tokenize 的 /`([^`]*)`/ 认不了的形态 ⇒ fail-closed，不猜
  denied("SELECT * FROM `k_arena_a``b`");
  // 反方向：合法的 backtick 别名照样放行（含引号 / 注释字符），不因加闸误伤
  assert.deepEqual(allowed("SELECT name AS `it's` FROM k_arena_tile"), ["k_arena_tile"]);
  assert.deepEqual(allowed('SELECT name AS `say "hi"` FROM k_arena_tile'), ["k_arena_tile"]);
  assert.deepEqual(allowed("SELECT name AS `a -- b`, x AS `c#d` FROM k_arena_tile"), ["k_arena_tile"]);
  assert.deepEqual(allowed("SELECT * FROM k_arena_tile WHERE note = 'a`b'"), ["k_arena_tile"]);
});

test("表闸拒绝：INSERT / REPLACE 省略 INTO（MySQL 语法可省）时目标表仍须过前缀闸", () => {
  // 省掉 INTO 后整条语句一个 TABLE_KEYWORDS 都不含，主循环不触发 ⇒ 目标表会整个逃过前缀闸。
  denied("INSERT user_currency (user_id, server_id, currency, balance) VALUES (?,?,?,?)");
  denied("INSERT user_currency SET balance = 999999");
  denied("INSERT IGNORE user_currency (user_id) VALUES (?)");
  denied("INSERT LOW_PRIORITY user_currency (user_id) VALUES (?)");
  denied("INSERT HIGH_PRIORITY user_currency (user_id) VALUES (?)");
  denied("INSERT DELAYED user_currency (user_id) VALUES (?)");
  denied("INSERT user_currency (user_id, balance) VALUES (?,?) ON DUPLICATE KEY UPDATE balance = 99999");
  denied("INSERT gameplay_outbox SET op_id = ?, status = 'PENDING'");
  denied("REPLACE user_currency (user_id, server_id, currency, balance) VALUES (?,?,?,?)");
  denied("REPLACE user_currency SET balance = 1");
  denied("INSERT k_slgworld_map (id) VALUES (?)"); // 别的 kit 同样拒
  // 反方向：省略 INTO 指向本 kit 表照样放行
  assert.deepEqual(allowed("INSERT k_arena_tile (id) VALUES (?)"), ["k_arena_tile"]);
  assert.deepEqual(allowed("INSERT k_arena_tile SET id = ?"), ["k_arena_tile"]);
  assert.deepEqual(allowed("INSERT IGNORE k_arena_tile (id) VALUES (?)"), ["k_arena_tile"]);
  assert.deepEqual(allowed("REPLACE k_arena_tile SET id = ?"), ["k_arena_tile"]);
  assert.deepEqual(allowed("INSERT `k_arena_tile` (id) SELECT id FROM k_arena_b"), ["k_arena_tile", "k_arena_b"]);
});

test("kitOpId：命名空间化 type = kit:<id>:<op>，同输入确定、跨 kit / op / 区 / 请求互不碰撞", () => {
  const a = kitOpId("arena", "u1", 3, "capture", "req-1");
  assert.equal(a, deriveOpId("u1", 3, "kit:arena:capture", "req-1"));
  assert.equal(a, kitOpId("arena", "u1", 3, "capture", "req-1"));
  assert.notEqual(a, kitOpId("slg", "u1", 3, "capture", "req-1"));
  assert.notEqual(a, kitOpId("arena", "u1", 3, "duel", "req-1"));
  assert.notEqual(a, kitOpId("arena", "u1", 4, "capture", "req-1"));
  assert.notEqual(a, kitOpId("arena", "u1", 3, "capture", "req-2"));
  assert.notEqual(a, deriveOpId("u1", 3, "shop.purchase", "req-1"));
  assert.throws(() => kitOpId("Arena", "u1", 3, "capture", "r"), TypeError);
  assert.throws(() => kitOpId("arena", "u1", 3, "cap ture", "r"), TypeError);
});

interface FakeState {
  readonly queries: { sql: string; params: unknown[] }[];
  rawQueries: number;
  readonly debits: unknown[][];
  readonly credits: unknown[][];
  readonly intents: unknown[];
  readonly matched: unknown[];
  readonly invalidated: [string, number][];
  committed: number;
  rolledBack: number;
}

const kinds: Readonly<Record<string, KitEffectSpec>> = {
  "kit:arena:score": { kitId: "arena", name: "score", userKey: "stats", field: "score", max: 1000 },
  "kit:arena:kills": { kitId: "arena", name: "kills", userKey: "stats", field: "kills", max: 50 },
  "kit:arena:coin": { kitId: "arena", name: "coin", userKey: "wallet", field: "coin", max: 9 },
  "kit:slg:score": { kitId: "slg", name: "score", userKey: "stats", field: "score", max: 10 },
};

function fakeDeps(
  opts: { debit?: "DUP" | number; credit?: "DUP" | number; intent?: "INSERTED" | "DUP"; matches?: boolean } = {},
): { deps: KitTxDeps; state: FakeState } {
  const state: FakeState = {
    queries: [], rawQueries: 0, debits: [], credits: [], intents: [], matched: [], invalidated: [], committed: 0, rolledBack: 0,
  };
  const conn = {
    execute: async (sql: string, params: unknown[]) => { state.queries.push({ sql, params }); return [[{ ok: 1 }], []]; },
    query: async () => { state.rawQueries++; return [[], []]; },
  } as unknown as PoolConnection;
  const deps: KitTxDeps = {
    withRcTx: async (fn) => {
      try { const r = await fn(conn); state.committed++; return r; }
      catch (e) { state.rolledBack++; throw e; }
    },
    debitInTx: async (...args) => { state.debits.push(args); return opts.debit ?? 90; },
    creditInTx: async (...args) => { state.credits.push(args); return opts.credit ?? 110; },
    insertOutboxIntent: async (_conn, row, k) => { state.intents.push({ ...row, kinds: k }); return opts.intent ?? "INSERTED"; },
    assertOutboxIntentMatches: async (_conn, row) => {
      state.matched.push(row);
      if (opts.matches === false) { throw new EffectConflictError(); }
    },
    invalidateBalanceCache: async (uid, sId) => { state.invalidated.push([uid, sId]); },
    kinds,
  };
  return { deps, state };
}

const effect: IEffect = { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: "item", itemId: 1, count: 1 }] };

test("withKitTx：句柄绑定 kitId/sId，query 过闸后才触达连接，debit/credit/enqueue 透传绑定 sId，提交后逐 uid 失效缓存", async () => {
  const { deps, state } = fakeDeps();
  const opId = kitOpId("arena", "u1", 7, "capture", "r1");
  const out = await withKitTx("arena", 7, async (tx) => {
    assert.equal(tx.kitId, "arena");
    assert.equal(tx.sId, 7);
    await tx.query("SELECT * FROM k_arena_tile WHERE id = ?", [1]);
    assert.equal(await tx.debit("u1", 1, 10, 5, opId, "kit.arena.capture"), 90);
    assert.equal(await tx.credit("u2", 1, 10, opId, "kit.arena.reward"), 110);
    assert.equal(await tx.debit("u1", 1, 10, 5, opId, "again"), 90);
    assert.equal(await tx.enqueueEffect("u1", opId, effect), "INSERTED");
    return "done";
  }, deps);
  assert.equal(out, "done");
  assert.equal(state.committed, 1);
  assert.deepEqual(state.queries, [{ sql: "SELECT * FROM k_arena_tile WHERE id = ?", params: [1] }]);
  assert.deepEqual(state.debits[0]!.slice(1), ["u1", 7, 1, 10, 5, opId, "kit.arena.capture"]);
  assert.deepEqual(state.credits[0]!.slice(1), ["u2", 7, 1, 10, opId, "kit.arena.reward"]);
  assert.deepEqual(state.intents, [{ opId, uid: "u1", sId: 7, effect, onDuplicate: "ignore", kinds }]);
  assert.deepEqual(state.matched, [], "INSERTED 不回读");
  assert.equal(state.rawQueries, 0, "tx.query 走 execute（预处理语句），不走 conn.query");
  // 提交后失效：每个 uid 一次（u1 扣了两次也只失效一次），且在 commit 之后
  assert.deepEqual(state.invalidated, [["u1", 7], ["u2", 7]]);
});

test("withKitTx：query 参数只允许原始值 / Date / Buffer——toSqlString 一类对象在触达连接前拒", async () => {
  const { deps, state } = fakeDeps();
  await assert.rejects(withKitTx("arena", 0, async (tx) => {
    await tx.query("SELECT * FROM k_arena_tile WHERE ?", [{ toSqlString: () => "1 UNION SELECT balance FROM user_currency" }]);
  }, deps), KitTableAccessError);
  await assert.rejects(withKitTx("arena", 0, async (tx) => {
    await tx.query("SELECT * FROM k_arena_tile WHERE id = ?", [[1, 2]]);
  }, deps), KitTableAccessError);
  await assert.rejects(withKitTx("arena", 0, async (tx) => {
    await tx.query("SELECT * FROM k_arena_tile WHERE id = ?", [undefined]);
  }, deps), KitTableAccessError);
  assert.equal(state.queries.length, 0);
  await withKitTx("arena", 0, async (tx) => {
    await tx.query("SELECT * FROM k_arena_tile WHERE id = ? AND t < ? AND b = ? AND n IS ?", [1n, new Date(0), Buffer.from("x"), null]);
  }, deps);
  assert.equal(state.queries.length, 1);
});

test("withKitTx.enqueueEffect：先规范化（注入 kinds）、拒别的 kit 的 kind、DUP 回读比对、冲突上抛回滚", async () => {
  const kitEffect: IEffect = { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: "kit:arena:score", delta: 3 }] };
  // 本 kit 的 kind：规范化后透传，kinds 一并透传给 insertOutboxIntent
  {
    const { deps, state } = fakeDeps();
    assert.equal(await withKitTx("arena", 1, async (tx) => tx.enqueueEffect("u1", "op", kitEffect), deps), "INSERTED");
    assert.deepEqual(state.intents, [{ opId: "op", uid: "u1", sId: 1, effect: kitEffect, onDuplicate: "ignore", kinds }]);
  }
  // 别的 kit 的 kind：KitEffectScopeError，intent 不落库、事务回滚
  {
    const { deps, state } = fakeDeps();
    await assert.rejects(withKitTx("arena", 1, async (tx) =>
      tx.enqueueEffect("u1", "op", { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: "kit:slg:score", delta: 1 }] }), deps),
    KitEffectScopeError);
    assert.deepEqual(state.intents, []);
    assert.equal(state.rolledBack, 1);
  }
  // 未登记 kind / delta 越界：validator 先拒（InvalidEffectError），⛔ 不到 outbox
  {
    const { deps, state } = fakeDeps();
    await assert.rejects(withKitTx("arena", 1, async (tx) =>
      tx.enqueueEffect("u1", "op", { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: "kit:arena:nope", delta: 1 }] }), deps),
    InvalidEffectError);
    await assert.rejects(withKitTx("arena", 1, async (tx) =>
      tx.enqueueEffect("u1", "op", { schemaVersion: EFFECT_SCHEMA_VERSION, grants: [{ kind: "kit:arena:score", delta: 1001 }] }), deps),
    InvalidEffectError);
    assert.deepEqual(state.intents, []);
  }
  // DUP：回读比对同载荷 ⇒ "DUP"；不同载荷 ⇒ EffectConflictError 回滚
  {
    const { deps, state } = fakeDeps({ intent: "DUP" });
    assert.equal(await withKitTx("arena", 1, async (tx) => tx.enqueueEffect("u1", "op", kitEffect), deps), "DUP");
    assert.deepEqual(state.matched, [{ opId: "op", uid: "u1", sId: 1, effect: kitEffect }]);
  }
  {
    const { deps, state } = fakeDeps({ intent: "DUP", matches: false });
    await assert.rejects(withKitTx("arena", 1, async (tx) => tx.enqueueEffect("u1", "op", kitEffect), deps), EffectConflictError);
    assert.equal(state.rolledBack, 1);
  }
});

test("assertKitEffectScope：非 kit grant 不管、本 kit 放行、别的 kit 拒、未登记拒", () => {
  assertKitEffectScope("arena", effect, kinds);
  assertKitEffectScope("arena", { schemaVersion: 1, grants: [{ kind: "kit:arena:coin", delta: 1 }, { kind: "star", delta: 1 }] }, kinds);
  assert.throws(() => assertKitEffectScope("arena", { schemaVersion: 1, grants: [{ kind: "kit:slg:score", delta: 1 }] }, kinds),
    KitEffectScopeError);
  assert.throws(() => assertKitEffectScope("slg", { schemaVersion: 1, grants: [{ kind: "kit:arena:coin", delta: 1 }] }, kinds),
    KitEffectScopeError);
  assert.throws(() => assertKitEffectScope("arena", { schemaVersion: 1, grants: [{ kind: "kit:arena:nope", delta: 1 }] }, kinds),
    InvalidEffectError);
});

test("withKitTx：越界 SQL 在触达连接前抛 KitTableAccessError、事务回滚、不失效缓存；DUP 的账本调用不触发失效", async () => {
  const { deps, state } = fakeDeps({ debit: "DUP" });
  await assert.rejects(withKitTx("arena", 0, async (tx) => {
    assert.equal(await tx.debit("u1", 1, 10, 5, "op", "r"), "DUP");
    await tx.query("SELECT balance FROM user_currency WHERE user_id = ?", ["u1"]);
    return "unreachable";
  }, deps), KitTableAccessError);
  assert.equal(state.queries.length, 0, "越界 SQL 不得到达连接");
  assert.equal(state.rolledBack, 1);
  assert.equal(state.committed, 0);
  assert.deepEqual(state.invalidated, []);
  await assert.rejects(withKitTx("Arena", 0, async () => 0, deps), TypeError);
  await assert.rejects(withKitTx("arena", -1, async () => 0, deps), TypeError);
});

test("kitEffectKeysFor：只投影出现的 kind、同一物理键去重、序号紧随 bag 分片之后、map 带 k/f/m", () => {
  const eff: IEffect = {
    schemaVersion: EFFECT_SCHEMA_VERSION,
    grants: [
      { kind: "kit:arena:score", delta: 5 },
      { kind: "item", itemId: 1, count: 1 },
      { kind: "kit:arena:kills", delta: 1 },
      { kind: "kit:arena:score", delta: 2 },
      { kind: "kit:arena:coin", delta: 3 },
    ],
  };
  const base = 3 + BAG_SHARDS;
  const r = kitEffectKeysFor("u1", eff, kinds);
  assert.deepEqual(r.keys, [
    kKitUser("arena", "stats", "u1", { zone: "per-zone" }),
    kKitUser("arena", "wallet", "u1", { zone: "per-zone" }),
  ]);
  assert.deepEqual(r.map, {
    "kit:arena:score": { k: base + 1, f: "score", m: 1000 },
    "kit:arena:kills": { k: base + 1, f: "kills", m: 50 },
    "kit:arena:coin": { k: base + 2, f: "coin", m: 9 },
  });
  assert.equal([kUser("u1"), "applied", "payload", ...kBagAll("u1")].length, base, "base = user/applied/payload + bag 分片");
  // 无 kit grant ⇒ 空投影（既有调用形态：ARGV[4] = "{}"）
  assert.deepEqual(kitEffectKeysFor("u1", effect, kinds), { keys: [], map: {} });
  // per-zone：随区前缀变，与 kUser 同槽
  const s3 = zoneCtx.run({ sId: 3 }, () => kitEffectKeysFor("u1", eff, kinds).keys[0]);
  assert.match(s3!, /_s3_kt:arena:stats:\{u1\}$/u);
  // 未登记 kind（validator 之外直接投影）fail-closed
  assert.throws(() => kitEffectKeysFor("u1", { schemaVersion: 1, grants: [{ kind: "kit:x:y", delta: 1 }] }, kinds));
});

test("APPLY_EFFECT Lua：含 kit 分支，键数表达式引用 ARGV[4] 投影，先验后写", () => {
  const lua = APPLY_EFFECT.lua;
  assert.match(lua, /cjson\.decode, ARGV\[4\]/u, "ARGV[4] 投影解析");
  assert.match(lua, /#KEYS ~= \d+ \+ kitKeyCount/u, "键数 = 基础键数 + 投影去重键数");
  assert.match(lua, /string\.sub\(g\.kind, 1, 4\) == 'kit:'/u, "kit grant 分支");
  assert.match(lua, /if spec == nil then return invalid\('EFFECT_UNKNOWN_KIND'\) end/u, "未登记 kit kind 走既有 UNKNOWN_KIND");
  assert.match(lua, /intIn\(g\.delta, 1, spec\.m\)/u, "delta ∈ [1, m]");
  assert.ok(lua.indexOf("kitValues[keyIndex] = values") < lua.indexOf("-- Apply pass"), "kit 现值校验在 apply pass 之前");
  assert.ok(!lua.includes("local N = #KEYS - 3"), "bag 分片数不再从 #KEYS 推（kit 键追加在其后）");
});
