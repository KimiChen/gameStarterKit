/**
 * 卸载 kit 的分线闸（tools/plugin/instanceGate.ts；docs/MMO-PLAN.md MK4-B3）单测：假 MySQL 连接 + 假 coord Redis 按剧本作答，⛔ 不连真库；
 * 真库 / 真 Redis 形态（world_instance 行 ⋈ kWorldLease / kWorldInfo.mode）在 test/int/kit-instance-gate.test.ts 核对。
 *
 * 变异验证（改哪一行 → 哪条用例转红）：
 *  - inspectKitInstances 不查租约键（把 held 当恒 1）→ 「崩溃遗留 active 行 / offline 行不挡」转红；
 *  - 不查 mode 归属（running 收全部在租行）→ 「别的 kit 的分线不挡」转红；
 *  - 删「无法归属也拒」→ 「登记缺 mode fail-closed」转红；
 *  - 删「连不上库即拒」的 catch → 「连不上 MySQL / Redis fail-closed」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { kWorldInfo, kWorldLease } from "../src/core/infra/keys";
import type { ServerKitCatalogEntry } from "../src/kits/catalogTypes";
import {
  WORLD_INSTANCE_ROWS_SQL, WORLD_INSTANCE_SCAN_LIMIT, assertKitInstancesStopped, describeKitInstanceBacklog, inspectKitInstances, kitModeIdsOf,
  readWorldLineRows, worldLineAddress, type InstanceGateRedis,
} from "../tools/plugin/instanceGate";
import type { WorkerGateSqlConnection } from "../tools/plugin/workerGate";

interface Row { server_id: number; instance_id: string; map_id: string; line: number; state: string; holder: string }
const row = (instance_id: string, map_id: string, line: number, state: string, holder: string, server_id = 0): Row => ({ server_id, instance_id, map_id, line, state, holder });

function fakeConn(script: { rows?: unknown[]; fail?: boolean } = {}) {
  const conn = {
    calls: [] as string[],
    ended: 0,
    async query(sql: string): Promise<[unknown, unknown]> {
      conn.calls.push(sql);
      if (script.fail) throw new Error("ER_NO_SUCH_TABLE");
      if (sql === WORLD_INSTANCE_ROWS_SQL) return [script.rows ?? [], []];
      throw new Error(`fake: 未知 SQL ${sql}`);
    },
    async end(): Promise<void> { conn.ended += 1; },
  };
  return conn as WorkerGateSqlConnection & typeof conn;
}

/** 假 coord Redis：leases = 存在的租约键；modes = 登记 HASH 的 mode 字段（键 → mode）。 */
function fakeRedis(script: { leases?: string[]; modes?: Record<string, string>; fail?: boolean } = {}) {
  const held = new Set(script.leases ?? []);
  const redis = {
    calls: [] as string[],
    quits: 0,
    async exists(key: string): Promise<number> {
      redis.calls.push(`exists ${key}`);
      if (script.fail) throw new Error("READONLY You can't write against a read only replica");
      return held.has(key) ? 1 : 0;
    },
    async hget(key: string, field: string): Promise<string | null> {
      redis.calls.push(`hget ${key} ${field}`);
      const value = script.modes?.[key];
      return value === undefined ? null : value;
    },
    async quit(): Promise<string> { redis.quits += 1; return "OK"; },
  };
  return redis as InstanceGateRedis & typeof redis;
}

const kit = (id: string, modes: string[]): ServerKitCatalogEntry => ({
  id, version: "1.0.0", api: {}, modes: modes.map((mode) => ({ id: mode, constantName: mode })), domains: [], effects: [], sqlFiles: [], sqlTables: [], userKeys: [],
});
const MMO = kit("mmo", ["mmoWorld"]);
const ARENA = kit("arena", ["arenaCapture", "arenaDuel"]);

const A = row("wi_a", "greybox", 0, "active", "node-a");
const B = row("wi_b", "greybox", 1, "active", "node-b");
const C = row("wi_c", "greybox-east", 0, "offline", "");
const D = row("wi_d", "arenaMap", 0, "active", "node-c", 3);
const lease = (r: Row) => kWorldLease(r.server_id, r.instance_id);
const info = (r: Row) => kWorldInfo(r.server_id, r.instance_id);

test("候选行读取：有界（> 4096 拒）、字段形状闸、地址形与 WorldDirectory.worldAddressOf 同形、kit mode 清单", async () => {
  assert.match(WORLD_INSTANCE_ROWS_SQL, /FROM world_instance ORDER BY server_id, map_id, line LIMIT 4097$/u, "多取一行判超界");
  assert.ok(!/WHERE/u.test(WORLD_INSTANCE_ROWS_SQL), "⛔ 不按 state / updated_at 过滤（崩溃遗留 active 行、sleep 空分线都靠租约判）");
  const rows = await readWorldLineRows(fakeConn({ rows: [A, D] }));
  assert.deepEqual(rows, [
    { sId: 0, instanceId: "wi_a", mapId: "greybox", line: 0, state: "active", holder: "node-a" },
    { sId: 3, instanceId: "wi_d", mapId: "arenaMap", line: 0, state: "active", holder: "node-c" },
  ]);
  assert.equal(worldLineAddress(rows[1]!), "s3/arenaMap/0");
  await assert.rejects(readWorldLineRows(fakeConn({ rows: Array.from({ length: WORLD_INSTANCE_SCAN_LIMIT + 1 }, (_, i) => row(`wi_${i}`, "m", i, "active", "")) })), /超过 4096/u);
  await assert.rejects(readWorldLineRows(fakeConn({ rows: [{ server_id: "x", instance_id: "wi", map_id: "m", line: 0 }] })), /字段异常/u);
  await assert.rejects(readWorldLineRows(fakeConn({ rows: [{ ...A, instance_id: "" }] })), /字段异常/u);
  await assert.rejects(readWorldLineRows({ query: async () => [{ n: 1 }, []] }), /形状异常/u);
  assert.deepEqual(kitModeIdsOf(ARENA), ["arenaCapture", "arenaDuel"]);
  assert.deepEqual(kitModeIdsOf(undefined), []);
});

test("归属 = 租约在 ∧ 登记 mode ∈ kit：崩溃遗留 active 行 / offline 行不挡；别的 kit 的分线不挡；登记缺 mode 记 unattributed", async () => {
  const redis = fakeRedis({ leases: [lease(A), lease(D)], modes: { [info(A)]: "mmoWorld", [info(D)]: "arenaCapture" } });
  const state = await inspectKitInstances(fakeConn({ rows: [A, B, C, D] }), redis, ["mmoWorld"]);
  assert.deepEqual(state.running.map((line) => `${worldLineAddress(line)} ${line.mode}`), ["s0/greybox/0 mmoWorld"], "只有 A：B 无租约（崩溃遗留 active 行）、C offline、D 是 arena 的");
  assert.deepEqual(state.unattributed, []);
  assert.equal(state.scanned, 4);
  assert.deepEqual(redis.calls, [
    `exists ${lease(A)}`, `hget ${info(A)} mode`, `exists ${lease(B)}`, `exists ${lease(C)}`, `exists ${lease(D)}`, `hget ${info(D)} mode`,
  ], "无租约的行不读登记；键形 = kWorldLease / kWorldInfo（项目前缀 + hash-tag）");
  const arena = await inspectKitInstances(fakeConn({ rows: [A, B, C, D] }), redis, ["arenaCapture", "arenaDuel"]);
  assert.deepEqual(arena.running.map(worldLineAddress), ["s3/arenaMap/0"]);
  // 登记缺 mode（recovering 未发布 / draining 已过期 / 旧发布方）与空串一样算无法归属
  const missing = fakeRedis({ leases: [lease(A), lease(B)], modes: { [info(B)]: "" } });
  const state2 = await inspectKitInstances(fakeConn({ rows: [A, B] }), missing, ["mmoWorld"]);
  assert.deepEqual(state2.running, []);
  assert.deepEqual(state2.unattributed.map((line) => `${worldLineAddress(line)} ${line.mode}`), ["s0/greybox/0 null", "s0/greybox/1 null"]);
  await assert.rejects(inspectKitInstances(fakeConn({ rows: [] }), redis, ["bad mode"]), /mode id 非法/u);
});

test("assertKitInstancesStopped：无运行中放行（连接归还）、运行中拒（⛔ bypass）、无法归属 fail-closed、kit 无 mode 跳过不连库、连不上 MySQL / Redis / 查询失败一律拒", async () => {
  const log: string[] = [];
  const clean = fakeConn({ rows: [A, B, C] });
  const idle = fakeRedis({ leases: [lease(B)], modes: { [info(B)]: "arenaDuel" } });
  const state = await assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => clean, connectRedis: async () => idle, log: (line) => log.push(line) });
  assert.deepEqual([state.running, state.unattributed, state.scanned], [[], [], 3]);
  assert.deepEqual([clean.ended, idle.quits], [1, 1], "MySQL / Redis 都归还");
  assert.match(log[0]!, /扫 3 行.*无运行中分线 ✔/u);

  const busyConn = fakeConn({ rows: [A, B, C] });
  const busy = fakeRedis({ leases: [lease(A), lease(B)], modes: { [info(A)]: "mmoWorld", [info(B)]: "mmoWorld" } });
  await assert.rejects(
    assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => busyConn, connectRedis: async () => busy }),
    /还有 2 条分线在该 kit 的 mode 下运行.*s0\/greybox\/0 holder=node-a mode=mmoWorld、s0\/greybox\/1 holder=node-b mode=mmoWorld.*无 bypass/u,
    "带运行中分线卸载被拒",
  );
  assert.deepEqual([busyConn.ended, busy.quits], [1, 1], "拒绝路径也归还连接");

  const orphan = fakeRedis({ leases: [lease(A)] });
  await assert.rejects(
    assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => fakeConn({ rows: [A] }), connectRedis: async () => orphan }),
    /1 条在租分线无法归属 mode.*s0\/greybox\/0 holder=node-a——fail-closed/u,
    "登记缺 mode fail-closed",
  );
  assert.equal(orphan.quits, 1);

  const skipped = await assertKitInstancesStopped({ kitId: "sqlonly", modeIds: [], connect: async () => { throw new Error("不该连"); }, log: (line) => log.push(line) });
  assert.deepEqual(skipped, { running: [], unattributed: [], scanned: 0 });
  assert.match(log.at(-1)!, /无 mode.*分线闸跳过/u);

  await assert.rejects(assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => { throw new Error("ECONNREFUSED"); } }), /连不上 MySQL/u, "连不上 MySQL fail-closed");
  const lonely = fakeConn({ rows: [] });
  await assert.rejects(assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => lonely, connectRedis: async () => { throw new Error("ECONNREFUSED 6379"); } }), /连不上 coord Redis/u, "连不上 Redis fail-closed");
  assert.equal(lonely.ended, 1, "Redis 连不上时 MySQL 连接也归还");
  await assert.rejects(assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => fakeConn({ fail: true }), connectRedis: async () => fakeRedis() }), /分线状态查询失败.*ER_NO_SUCH_TABLE/u);
  await assert.rejects(assertKitInstancesStopped({ kitId: "mmo", modeIds: ["mmoWorld"], connect: async () => fakeConn({ rows: [A] }), connectRedis: async () => fakeRedis({ fail: true }) }), /分线状态查询失败.*READONLY/u);
  await assert.rejects(assertKitInstancesStopped({ kitId: "Bad Kit", modeIds: ["mmoWorld"], connect: async () => clean }), /kit id 非法/u);
});

test("describeKitInstanceBacklog（check）：运行中 / 无法归属各一条提示；无 mode 的 kit 不连库；连不上库 / 查询失败只给「未核」", async () => {
  const conn = fakeConn({ rows: [A, B, D] });
  const redis = fakeRedis({ leases: [lease(A), lease(B), lease(D)], modes: { [info(A)]: "mmoWorld", [info(D)]: "arenaDuel" } });
  assert.deepEqual(await describeKitInstanceBacklog(["mmo", "arena", "nope"], [MMO, ARENA], async () => conn, async () => redis), [
    "⚠ kit \"mmo\" 有 1 条分线在运行（s0/greybox/0 holder=node-a mode=mmoWorld）：uninstall 会拒绝，先 drain / 停 world 进程",
    "⚠ kit \"arena\" 有 1 条分线在运行（s3/arenaMap/0 holder=node-c mode=arenaDuel）：uninstall 会拒绝，先 drain / 停 world 进程",
    "⚠ 有 1 条在租分线无法归属 mode（s0/greybox/1 holder=node-b）：kit 卸载会 fail-closed 拒绝",
  ]);
  assert.deepEqual([conn.ended, redis.quits], [1, 1]);
  assert.deepEqual(await describeKitInstanceBacklog(["nope"], [MMO], async () => { throw new Error("不该连"); }, async () => { throw new Error("不该连"); }), [], "目录无 mode 的 kit 不连库");
  assert.deepEqual(await describeKitInstanceBacklog(["mmo"], [MMO], async () => { throw new Error("ECONNREFUSED"); }, async () => fakeRedis()),
    ["⚠ 未核运行中分线（连不上 MySQL：ECONNREFUSED）——卸载 kit 时会再次核对并 fail-closed"]);
  const c2 = fakeConn({ rows: [] });
  assert.deepEqual(await describeKitInstanceBacklog(["mmo"], [MMO], async () => c2, async () => { throw new Error("ECONNREFUSED 6379"); }),
    ["⚠ 未核运行中分线（连不上 coord Redis：ECONNREFUSED 6379）——卸载 kit 时会再次核对并 fail-closed"]);
  assert.equal(c2.ended, 1);
  assert.deepEqual(await describeKitInstanceBacklog(["mmo"], [MMO], async () => fakeConn({ fail: true }), async () => fakeRedis()), ["⚠ 未核运行中分线（查询失败：ER_NO_SUCH_TABLE）"]);
});
