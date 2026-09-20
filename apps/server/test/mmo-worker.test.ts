/**
 * mmo kit worldEvents worker（apps/server/src/kits/mmo/workers/worldEvents.ts）：载荷闸纯函数 + 一轮 pass 的落地规则
 * （grantCurrency ⇒ credit(opId = eventId, persona 主体)；lootClaimed ⇒ inventory 面 claimLoot（MK3-B1：物品 + 回执，op_id = eventId；模板不在包 ⇒ 死信）；未知 kind / 非法载荷 ⇒ deadLetter；
 * more = 本轮有认领）。假 KitWorkerTx 记录调用，⛔ 不连库。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KitWorkerTx, KitWorldEventRow } from "../src/core/infra/kitApi";
import worker, { MMO_EVENT_GRANT_CURRENCY, MMO_EVENT_GRANT_ITEM, MMO_EVENT_LOOT_CLAIMED, MMO_EVENT_PACK_SUSPENDED, MMO_WORLD_EVENT_TABLE, grantCurrencyPayloadOf, grantItemPayloadOf } from "../src/kits/mmo/workers/worldEvents";

const row = (eventId: string, kind: string, payload: unknown): KitWorldEventRow => ({ eventId, instanceId: "i1", seq: 1, kind, payload, checkpointRev: 1, attempts: 1 });

function fakeTx(claimed: readonly KitWorldEventRow[]) {
  const credits: unknown[][] = [];
  const dead: string[] = [];
  const sql: [string, unknown[]][] = [];
  const tx = {
    sId: 1,
    claimWorldEvents: async (table: string) => { assert.equal(table, MMO_WORLD_EVENT_TABLE); return claimed; },
    deadLetterWorldEvent: async (_table: string, eventId: string) => { dead.push(eventId); },
    releaseWorldEvent: async () => { throw new Error("MK0 不放回"); },
    credit: async (...args: unknown[]) => { credits.push(args); return 1; },
    query: async (statement: string, params: unknown[] = []) => {
      sql.push([statement, params]);
      if (statement.startsWith("SELECT result FROM k_mmo_receipt")) return [];
      if (statement.startsWith("SELECT item_id, template_id")) return [];
      return { affectedRows: 1 };
    },
  } as unknown as KitWorkerTx;
  return { tx, credits, dead, sql };
}

test("grantCurrencyPayloadOf：personaId / userId 非空且有界、amount 正整数；其余 null", () => {
  assert.deepEqual(grantCurrencyPayloadOf({ personaId: "p1", userId: "u1", amount: 5 }), { personaId: "p1", userId: "u1", amount: 5 });
  for (const bad of [null, [], {}, { personaId: "", userId: "u1", amount: 5 }, { personaId: "p1", userId: "u1", amount: 0 }, { personaId: "p1", userId: "u1", amount: 1.5 }, { personaId: "p1", amount: 5 }]) {
    assert.equal(grantCurrencyPayloadOf(bad), null, JSON.stringify(bad));
  }
});

test("pass：grantCurrency ⇒ credit(uid, CUR_GOLD, amount, eventId, world-event, persona 主体)；未知 kind 与非法载荷死信；more 随认领数", async () => {
  const ok = row("e1", MMO_EVENT_GRANT_CURRENCY, { personaId: "p1", userId: "u1", amount: 7 });
  const unknown = row("e2", "grantItem", { personaId: "p1" });
  const invalid = row("e3", MMO_EVENT_GRANT_CURRENCY, { personaId: "p1", userId: "u1", amount: -1 });
  const { tx, credits, dead } = fakeTx([ok, unknown, invalid]);
  const result = await worker.pass(tx, { kitId: "mmo", workerId: "worldEvents", sId: 1, now: 0, signal: new AbortController().signal });
  assert.deepEqual(result, { more: true });
  assert.deepEqual(credits, [["u1", 1, 7, "e1", "world-event", { kind: "persona", personaId: "p1" }]]);
  assert.deepEqual(dead, ["e2", "e3"]);
  const idle = fakeTx([]);
  assert.deepEqual(await worker.pass(idle.tx, { kitId: "mmo", workerId: "worldEvents", sId: 1, now: 0, signal: new AbortController().signal }), { more: false });
});

test("pass：lootClaimed ⇒ grantItemInTx（物品进 bag 下一空槽 + 回执 op_id = eventId）；载荷非法 ⇒ 死信", async () => {
  const claim = row("e9", MMO_EVENT_LOOT_CLAIMED, { actorEntityId: "char:c1", actorCharacterId: "c1", lootId: "loot:1", itemTemplateId: "slime-gel", count: 2 });
  const bad = row("e10", MMO_EVENT_LOOT_CLAIMED, { actorEntityId: "char:c1", lootId: "loot:1", itemTemplateId: "slime-gel", count: 2 });
  const { tx, dead, sql } = fakeTx([claim, bad]);
  assert.deepEqual(await worker.pass(tx, { kitId: "mmo", workerId: "worldEvents", sId: 1, now: 0, signal: new AbortController().signal }), { more: true });
  const inserts = sql.filter(([statement]) => statement.startsWith("INSERT"));
  assert.equal(inserts.length, 2);
  assert.deepEqual(inserts[0]![1].slice(2), ["slime-gel", "c1", "bag", 0, 2], "物品：模板 / 角色 / bag / 槽 0 / 数量 2（空背包 ⇒ 第一格）");
  assert.deepEqual(inserts[1]![1].slice(1, 4), ["e9", "c1", "lootClaimed"], "回执 op_id = eventId");
  assert.deepEqual(dead, ["e10"]);
});

test("pass：lootClaimed 的模板不在内容包 ⇒ MmoInventoryError ⇒ 死信（⛔ 整轮回滚）", async () => {
  const claim = row("e11", MMO_EVENT_LOOT_CLAIMED, { actorEntityId: "char:c1", actorCharacterId: "c1", lootId: "loot:1", itemTemplateId: "not-in-pack", count: 1 });
  const { tx, dead, sql } = fakeTx([claim]);
  assert.deepEqual(await worker.pass(tx, { kitId: "mmo", workerId: "worldEvents", sId: 1, now: 0, signal: new AbortController().signal }), { more: true });
  assert.deepEqual([dead, sql.filter(([statement]) => statement.startsWith("INSERT")).length], [["e11"], 0]);
});

test("pass：grantItem（MK4-B1 编排命令）⇒ inventory grantItem，回执 op_id = 载荷 opId（跨重启同一命令同一 opId）；packSuspended 审计行认领即 done；载荷坏 ⇒ 死信", async () => {
  assert.deepEqual(grantItemPayloadOf({ opId: "orch:greybox:3:0", toCharacterId: "c1", itemTemplateId: "slime-gel", count: 2, reason: "boss", packId: "greybox" }), { opId: "orch:greybox:3:0", toCharacterId: "c1", itemTemplateId: "slime-gel", count: 2 });
  assert.equal(grantItemPayloadOf({ opId: "x", toCharacterId: "c1", itemTemplateId: "slime-gel", count: 0 }), null);
  const grant = row("e20", MMO_EVENT_GRANT_ITEM, { opId: "orch:greybox:3:0", toCharacterId: "c1", itemTemplateId: "slime-gel", count: 2, reason: "boss", packId: "greybox" });
  const audit = row("e21", MMO_EVENT_PACK_SUSPENDED, { packId: "greybox", reason: "commands" });
  const bad = row("e22", MMO_EVENT_GRANT_ITEM, { toCharacterId: "c1", itemTemplateId: "slime-gel", count: 2 });
  const { tx, dead, sql } = fakeTx([grant, audit, bad]);
  assert.deepEqual(await worker.pass(tx, { kitId: "mmo", workerId: "worldEvents", sId: 1, now: 0, signal: new AbortController().signal }), { more: true });
  const inserts = sql.filter(([statement]) => statement.startsWith("INSERT"));
  assert.deepEqual([inserts.length, inserts[1]![1].slice(1, 4)], [2, ["orch:greybox:3:0", "c1", "grantItem"]], "物品 + 回执（op_id = 载荷 opId）");
  assert.deepEqual(dead, ["e22"], "审计行不死信、坏载荷死信");
});
