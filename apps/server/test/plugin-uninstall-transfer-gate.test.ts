/**
 * 卸载 kit 的交接闸（tools/plugin/transferGate.ts；docs/MMO.md MF8-B7）单测：假 MySQL 连接按剧本作答，⛔ 不连真库；
 * 真库形态（world_transfer ⋈ persona.kit_id、active_key IS NOT NULL）在 test/int/world-transfer-flow.test.ts 末段核对。
 * 变异验证：countInFlightTransfers 改成恒 0 → 「带在途交接卸载被拒」转红；删「连不上库即拒」的 catch → 「连不上库 fail-closed」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { IN_FLIGHT_TRANSFERS_SQL, assertKitTransfersDrained, countInFlightTransfers } from "../tools/plugin/transferGate";
import type { WorkerGateSqlConnection } from "../tools/plugin/workerGate";

function fakeConn(script: { inFlight?: Record<string, number>; fail?: boolean } = {}) {
  const conn = {
    calls: [] as Array<{ sql: string; params: unknown[] | undefined }>,
    ended: 0,
    async query(sql: string, params?: unknown[]): Promise<[unknown, unknown]> {
      conn.calls.push({ sql, params });
      if (script.fail) throw new Error("ER_NO_SUCH_TABLE");
      if (sql === IN_FLIGHT_TRANSFERS_SQL) return [[{ n: script.inFlight?.[String(params?.[0])] ?? 0 }], []];
      throw new Error(`fake: 未知 SQL ${sql}`);
    },
    async end(): Promise<void> { conn.ended += 1; },
  };
  return conn as WorkerGateSqlConnection & typeof conn;
}

test("在途交接按 persona.kit_id 归属到 kit：0 条放行（连接归还）、>0 拒（⛔ bypass）、连不上库 / 查询失败 fail-closed、kit id 形状闸", async () => {
  assert.match(IN_FLIGHT_TRANSFERS_SQL, /JOIN persona p ON p\.server_id = t\.server_id AND p\.persona_id = t\.persona_id/u, "按 persona.kit_id 归属");
  assert.match(IN_FLIGHT_TRANSFERS_SQL, /t\.active_key IS NOT NULL/u, "在途 = active_key 非 NULL（终态置 NULL）");
  const clean = fakeConn({ inFlight: { arena: 0, mmo: 2 } });
  const log: string[] = [];
  assert.equal(await assertKitTransfersDrained({ kitId: "arena", connect: async () => clean, log: (line) => log.push(line) }), 0);
  assert.deepEqual(clean.calls.map((call) => call.params), [["arena"]]);
  assert.equal(clean.ended, 1, "连接归还");
  assert.ok(log[0]?.includes("无在途交接"));
  const busy = fakeConn({ inFlight: { mmo: 2 } });
  await assert.rejects(assertKitTransfersDrained({ kitId: "mmo", connect: async () => busy }), /2 条该 kit persona 的在途交接/u, "带在途交接卸载被拒");
  assert.equal(busy.ended, 1, "拒绝路径也归还连接");
  assert.equal(await countInFlightTransfers(busy, "mmo"), 2);
  await assert.rejects(assertKitTransfersDrained({ kitId: "mmo", connect: async () => { throw new Error("ECONNREFUSED"); } }), /连不上 MySQL/u, "连不上库 fail-closed");
  await assert.rejects(assertKitTransfersDrained({ kitId: "mmo", connect: async () => fakeConn({ fail: true }) }), /在途查询失败/u, "查询失败 fail-closed");
  await assert.rejects(assertKitTransfersDrained({ kitId: "Bad Kit", connect: async () => clean }), /kit id 非法/u);
  await assert.rejects(countInFlightTransfers({ query: async () => [[{ n: "many" }], []] }, "mmo"), /计数返回异常/u);
});
