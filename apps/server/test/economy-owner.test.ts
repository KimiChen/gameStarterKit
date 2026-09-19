/**
 * MMO MF2-B3 资产主体（docs/MMO.md §3 / MF2）：debitInTx / creditInTx / insertOutboxIntent / assertOutboxIntentMatches 的 SQL 带
 * owner_kind / owner_id（缺省 account = 0 / ''，persona = 1 / personaId）；kCacheCurrency 随主体分键；KitTx.debit / credit /
 * enqueueEffect 透传 owner 且提交后按 (uid, owner) 失效缓存。假连接只录 SQL 与参数，⛔ 不连库（真库隔离在 test/int/economy.test.ts）。
 * 变异验证：currency.ts debit 的 UPDATE 谓词删 owner_kind / owner_id → 「persona 扣款谓词带主体」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountOwner, personaOwner } from "@game/shared";
import { creditInTx, debitInTx } from "../src/core/economy/currency";
import { assertOutboxIntentMatches, insertOutboxIntent } from "../src/core/economy/outbox";
import { kCacheCurrency, zoneCtx } from "../src/core/infra/keys";
import type { PoolConnection } from "../src/core/infra/mysql";
import { withKitTx, type KitTxDeps } from "../src/core/infra/kitApi";
import { KIT_EFFECT_KINDS } from "@game/shared/kits/catalog.generated";

const PID = "p_0123456789abcdefXYZ";

function fakeConn(balance = 100) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const conn = {
    execute: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return [{ affectedRows: 1 }, []]; },
    query: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return [[{ balance, effect: { schemaVersion: 1, grants: [] } }], []]; },
  } as unknown as PoolConnection;
  return { conn, calls };
}

test("debitInTx / creditInTx：缺省 account (0, '')；persona (1, id) 进 ledger INSERT、余额谓词与 balance_after 回填谓词", async () => {
  const { conn, calls } = fakeConn(90);
  assert.equal(await debitInTx(conn, "u1", 7, 1, 10, 5, "op-a", "test"), 90);
  assert.match(calls[0]!.sql, /INSERT INTO currency_ledger \(user_id, server_id, owner_kind, owner_id, currency/u);
  assert.deepEqual(calls[0]!.params, ["u1", 7, 0, "", 1, -10, 0, "op-a", "test"]);
  assert.match(calls[1]!.sql, /WHERE user_id = \? AND server_id = \? AND owner_kind = \? AND owner_id = \? AND currency = \?/u);
  assert.deepEqual(calls[1]!.params, [10, 5, "u1", 7, 0, "", 1, 10, 5]);
  assert.deepEqual(calls[3]!.params, [90, "u1", 7, 0, "", "op-a"], "balance_after 回填按主体定位");
  calls.splice(0);
  assert.equal(await debitInTx(conn, "u1", 7, 1, 10, 5, "op-b", "test", personaOwner(PID)), 90);
  assert.deepEqual(calls[0]!.params, ["u1", 7, 1, PID, 1, -10, 0, "op-b", "test"]);
  assert.deepEqual(calls[1]!.params, [10, 5, "u1", 7, 1, PID, 1, 10, 5], "persona 扣款谓词带主体");
  calls.splice(0);
  assert.equal(await creditInTx(conn, "u1", 7, 1, 25, "op-c", "reward", personaOwner(PID)), 90);
  assert.deepEqual(calls[0]!.params, ["u1", 7, 1, PID, 1, 25, 0, "op-c", "reward"]);
  assert.match(calls[1]!.sql, /INSERT INTO user_currency \(user_id, server_id, owner_kind, owner_id, currency, balance\)/u);
  assert.deepEqual(calls[1]!.params, ["u1", 7, 1, PID, 1, 25]);
  assert.deepEqual(calls[3]!.params, [90, "u1", 7, 1, PID, "op-c"]);
});

test("insertOutboxIntent / assertOutboxIntentMatches：intent 行带主体列；同 opId 落在别的主体上 ⇒ 冲突", async () => {
  const { conn, calls } = fakeConn();
  const effect = { schemaVersion: 1 as const, grants: [] };
  await insertOutboxIntent(conn, { opId: "op", uid: "u1", sId: 7, effect, owner: personaOwner(PID) }, KIT_EFFECT_KINDS);
  assert.match(calls[0]!.sql, /INSERT INTO gameplay_outbox \(op_id, user_id, server_id, owner_kind, owner_id, effect, status\)/u);
  assert.deepEqual(calls[0]!.params.slice(0, 5), ["op", "u1", 7, 1, PID]);
  await insertOutboxIntent(conn, { opId: "op2", uid: "u1", sId: 7, effect }, KIT_EFFECT_KINDS);
  assert.deepEqual(calls[1]!.params.slice(0, 5), ["op2", "u1", 7, 0, ""], "缺省 account");
  await assertOutboxIntentMatches(conn, { opId: "op", uid: "u1", sId: 7, effect, owner: personaOwner(PID) }, KIT_EFFECT_KINDS);
  assert.deepEqual(calls[2]!.params, ["op", "u1", 7, 1, PID]);
  const empty = { query: async () => [[], []], execute: async () => [{ affectedRows: 1 }, []] } as unknown as PoolConnection;
  await assert.rejects(assertOutboxIntentMatches(empty, { opId: "op", uid: "u1", sId: 7, effect, owner: accountOwner("u1") }, KIT_EFFECT_KINDS));
});

test("kCacheCurrency：account 沿用原键；persona 带 :persona:<id> 段且 {uid} 仍是唯一 hash-tag", () => {
  zoneCtx.run({ sId: 3 }, () => {
    const account = kCacheCurrency("u1");
    assert.equal(kCacheCurrency("u1", accountOwner("u1")), account);
    const persona = kCacheCurrency("u1", personaOwner(PID));
    assert.equal(persona, `${account}:persona:${PID}`);
    assert.equal((persona.match(/\{/gu) ?? []).length, 1, "只有一个 hash-tag");
  });
});

test("KitTx.debit / credit / enqueueEffect 透传 owner；提交后按 (uid, owner) 各失效一次缓存；无 owner 时实参个数不变", async () => {
  const debits: unknown[][] = []; const credits: unknown[][] = []; const intents: unknown[] = []; const invalidated: unknown[][] = [];
  const conn = { execute: async () => [[{ ok: 1 }], []], query: async () => [[], []] } as unknown as PoolConnection;
  const deps: KitTxDeps = {
    withRcTx: async (fn) => fn(conn),
    debitInTx: async (...args) => { debits.push(args); return 1; },
    creditInTx: async (...args) => { credits.push(args); return 1; },
    insertOutboxIntent: async (_c, row) => { intents.push(row); return "INSERTED"; },
    assertOutboxIntentMatches: async () => undefined,
    invalidateBalanceCache: async (...args) => { invalidated.push(args); },
    kinds: KIT_EFFECT_KINDS,
  };
  const owner = personaOwner(PID);
  await withKitTx("arena", 3, async (tx) => {
    await tx.debit("u1", 1, 10, 5, "op1", "r");
    await tx.debit("u1", 1, 10, 5, "op2", "r", owner);
    await tx.credit("u1", 1, 10, "op3", "r", owner);
    await tx.enqueueEffect("u1", "op4", { schemaVersion: 1, grants: [] }, owner);
    await tx.enqueueEffect("u1", "op5", { schemaVersion: 1, grants: [] });
  }, deps);
  assert.equal(debits[0]!.length, 8, "无 owner 时不追加实参（conn + 7 个业务参数；既有假 deps 按 ...args 录参）");
  assert.deepEqual(debits[1]!.slice(1), ["u1", 3, 1, 10, 5, "op2", "r", owner]);
  assert.deepEqual(credits[0]!.slice(1), ["u1", 3, 1, 10, "op3", "r", owner]);
  assert.deepEqual((intents[0] as { owner?: unknown }).owner, owner);
  assert.equal("owner" in (intents[1] as object), false, "无 owner 时 intent 行不带 owner 键");
  assert.deepEqual(invalidated, [["u1", 3], ["u1", 3, owner]], "account 与 persona 各失效一次");
});
