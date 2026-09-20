/**
 * mmo kit worldEvents worker（apps/server/src/kits/mmo/workers/worldEvents.ts）：载荷闸纯函数 + 一轮 pass 的落地规则
 * （grantCurrency ⇒ credit(opId = eventId, persona 主体)；未知 kind / 非法载荷 ⇒ deadLetter；more = 本轮有认领）。假 KitWorkerTx 记录调用，⛔ 不连库。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { KitWorkerTx, KitWorldEventRow } from "../src/core/infra/kitApi";
import worker, { MMO_EVENT_GRANT_CURRENCY, MMO_WORLD_EVENT_TABLE, grantCurrencyPayloadOf } from "../src/kits/mmo/workers/worldEvents";

const row = (eventId: string, kind: string, payload: unknown): KitWorldEventRow => ({ eventId, instanceId: "i1", seq: 1, kind, payload, checkpointRev: 1, attempts: 1 });

function fakeTx(claimed: readonly KitWorldEventRow[]) {
  const credits: unknown[][] = [];
  const dead: string[] = [];
  const tx = {
    claimWorldEvents: async (table: string) => { assert.equal(table, MMO_WORLD_EVENT_TABLE); return claimed; },
    deadLetterWorldEvent: async (_table: string, eventId: string) => { dead.push(eventId); },
    releaseWorldEvent: async () => { throw new Error("MK0 不放回"); },
    credit: async (...args: unknown[]) => { credits.push(args); return 1; },
  } as unknown as KitWorkerTx;
  return { tx, credits, dead };
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
