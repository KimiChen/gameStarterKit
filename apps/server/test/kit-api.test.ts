/**
 * kit-api/server 门面（core/infra/kitApi.ts，docs/KIT.md §4）单测：
 * - `assertKitTableAccess` 表闸矩阵：本 kit 前缀（裸 / backtick / JOIN / INSERT INTO / 多表 / 别名 / 子查询）放行，
 *   框架表、别的 kit、schema 限定名、注释绕过、DDL / 多语句一律拒绝；
 * - `kitOpId` 命名空间化与确定性；
 * - `withKitTx` 用假 pool：越界 SQL 在触达连接前抛出、debit / credit 绑定 sId、提交后逐 uid 失效余额缓存、
 *   回调抛出即回滚且不失效缓存；
 * - `kitEffectKeysFor` 纯投影：键去重、序号紧随 bag 之后、map 形态；
 * - APPLY_EFFECT Lua 文本含 kit 分支且键数表达式引用 ARGV[4] 投影。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  KitTableAccessError, assertKitTableAccess, kitOpId, kitTablePrefix, withKitTx, type KitTxDeps,
} from "../src/core/infra/kitApi";
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
  assert.deepEqual(
    allowed("SELECT * FROM (SELECT id FROM k_arena_tile) AS d JOIN k_arena_owner o ON o.tile = d.id"),
    ["k_arena_tile", "k_arena_owner"],
  );
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
  readonly debits: unknown[][];
  readonly credits: unknown[][];
  readonly intents: unknown[];
  readonly invalidated: [string, number][];
  committed: number;
  rolledBack: number;
}

function fakeDeps(opts: { debit?: "DUP" | number; credit?: "DUP" | number } = {}): { deps: KitTxDeps; state: FakeState } {
  const state: FakeState = { queries: [], debits: [], credits: [], intents: [], invalidated: [], committed: 0, rolledBack: 0 };
  const conn = {
    query: async (sql: string, params: unknown[]) => { state.queries.push({ sql, params }); return [[{ ok: 1 }], []]; },
  } as unknown as PoolConnection;
  const deps: KitTxDeps = {
    withRcTx: async (fn) => {
      try { const r = await fn(conn); state.committed++; return r; }
      catch (e) { state.rolledBack++; throw e; }
    },
    debitInTx: async (...args) => { state.debits.push(args); return opts.debit ?? 90; },
    creditInTx: async (...args) => { state.credits.push(args); return opts.credit ?? 110; },
    insertOutboxIntent: async (_conn, row) => { state.intents.push(row); return "INSERTED"; },
    invalidateBalanceCache: async (uid, sId) => { state.invalidated.push([uid, sId]); },
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
  assert.deepEqual(state.intents, [{ opId, uid: "u1", sId: 7, effect, onDuplicate: "ignore" }]);
  // 提交后失效：每个 uid 一次（u1 扣了两次也只失效一次），且在 commit 之后
  assert.deepEqual(state.invalidated, [["u1", 7], ["u2", 7]]);
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

const kinds: Readonly<Record<string, KitEffectSpec>> = {
  "kit:arena:score": { kitId: "arena", name: "score", userKey: "stats", field: "score", max: 1000 },
  "kit:arena:kills": { kitId: "arena", name: "kills", userKey: "stats", field: "kills", max: 50 },
  "kit:arena:coin": { kitId: "arena", name: "coin", userKey: "wallet", field: "coin", max: 9 },
};

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
