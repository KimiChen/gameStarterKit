/**
 * MMO MF10-B3 运维只读面（假依赖）：instances = world_instance 行 ⊕ WorldRegistry 登记（无登记 ⇒ null，⛔ 猜）；transfers 缺省只在途、
 * includeFinal 连终态；events = 各 kit role:"world-event" 表的 worldEventStats（按 kit 收窄）。响应经 shared HTTP contract validator 逐字段校验
 * （exact keys / 范围），请求 validator 拒未知键。
 * 变异验证：readAdminWorldEvents 删 kitId 过滤 →「按 kit 收窄」转红；readAdminWorldInstances 不合并登记 →「读出 seated / 节点地址」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GameHttpContractMap } from "@game/shared";
import { readAdminWorldEvents, readAdminWorldInstances, readAdminWorldTransfers, type AdminWorldReadDeps } from "../src/core/world/adminRead";
import { MemoryWorldRegistry } from "../src/rooms/core/WorldRegistry";

function fakeDeps() {
    const registry = new MemoryWorldRegistry(() => 1_000, 60_000);
    const calls: string[] = [];
    const deps: AdminWorldReadDeps = {
        listInstances: async (sId, mapId) => {
            calls.push(`instances:${sId}:${mapId ?? "*"}`);
            const rows = [
                { instanceId: "wi_a0", mapId: "m1", line: 0, state: "active", authorityEpoch: 3, holder: "node-a", checkpointRev: 12, writeSeq: 40 },
                { instanceId: "wi_a1", mapId: "m1", line: 1, state: "offline", authorityEpoch: 1, holder: "", checkpointRev: 2, writeSeq: 5 },
                { instanceId: "wi_b0", mapId: "m2", line: 0, state: "active", authorityEpoch: 1, holder: "node-b", checkpointRev: 0, writeSeq: 0 },
            ];
            return rows.filter((row) => mapId === undefined || row.mapId === mapId);
        },
        registry,
        listTransfers: async (sId, personaId, includeFinal) => {
            calls.push(`transfers:${sId}:${personaId ?? "*"}:${String(includeFinal)}`);
            const rows = [
                { transferId: "wt_1", personaId: "p_a", fromInstance: "wi_a0", toMap: "m2", toLine: 0, toInstance: "wi_b0", state: "committed", controlEpoch: 3, reserveExpiresAt: 5_000, active: true },
                { transferId: "wt_2", personaId: "p_b", fromInstance: "wi_a0", toMap: "m2", toLine: 0, toInstance: "wi_b0", state: "finalized", controlEpoch: 4, reserveExpiresAt: null, active: false },
            ];
            return rows.filter((row) => (includeFinal || row.active) && (personaId === undefined || row.personaId === personaId));
        },
        worldEventTables: () => [{ kitId: "kitfix", table: "k_kitfix_world_event" }, { kitId: "mmo", table: "k_mmo_world_event" }],
        eventStats: async (table, sId, instanceId) => {
            calls.push(`stats:${table}:${sId}:${instanceId ?? "*"}`);
            return table === "k_mmo_world_event" ? { pending: 7, done: 100, dead: 1, superseded: 0, executable: 5 } : { pending: 0, done: 3, dead: 0, superseded: 2, executable: 0 };
        },
    };
    return { deps, registry, calls };
}

test("instances：行 ⊕ 登记（seated / capacity / publicAddress / updatedAt；无登记 null）；按图收窄；响应过 contract validator", async () => {
    const f = fakeDeps();
    await f.registry.publish(0, "wi_a0", { seated: 42, capacity: 100, publicAddress: "wss://world-a.example.com", holder: "node-a" });
    const all = await readAdminWorldInstances(0, undefined, f.deps);
    assert.equal(all.instances.length, 3);
    assert.deepEqual([all.instances[0]!.seated, all.instances[0]!.capacity, all.instances[0]!.publicAddress, all.instances[0]!.updatedAt], [42, 100, "wss://world-a.example.com", 1_000], "读出 seated / 节点地址");
    assert.deepEqual([all.instances[1]!.seated, all.instances[1]!.capacity, all.instances[1]!.publicAddress, all.instances[1]!.updatedAt], [null, null, null, null], "无登记 ⇒ null，⛔ 猜 0");
    assert.deepEqual(GameHttpContractMap.AdminWorldInstances.response(all), all, "响应形态 exact");
    const m2 = await readAdminWorldInstances(0, "m2", f.deps);
    assert.deepEqual(m2.instances.map((row) => row.instanceId), ["wi_b0"]);
    assert.deepEqual(f.calls.filter((c) => c.startsWith("instances")), ["instances:0:*", "instances:0:m2"]);
    assert.throws(() => GameHttpContractMap.AdminWorldInstances.request({ sId: 0, extra: 1 }), "请求拒未知键");
    assert.deepEqual(GameHttpContractMap.AdminWorldInstances.request({ sId: 3, mapId: "m1" }), { sId: 3, mapId: "m1" });
});

test("transfers：缺省只列在途；includeFinal 连终态；按 persona 收窄；响应过 validator", async () => {
    const f = fakeDeps();
    const inflight = await readAdminWorldTransfers(0, undefined, false, f.deps);
    assert.deepEqual(inflight.transfers.map((row) => [row.transferId, row.state, row.active]), [["wt_1", "committed", true]]);
    const all = await readAdminWorldTransfers(0, undefined, true, f.deps);
    assert.equal(all.transfers.length, 2);
    assert.deepEqual(GameHttpContractMap.AdminWorldTransfers.response(all), all);
    const one = await readAdminWorldTransfers(0, "p_b", true, f.deps);
    assert.deepEqual(one.transfers.map((row) => row.transferId), ["wt_2"]);
    assert.deepEqual(GameHttpContractMap.AdminWorldTransfers.request({ sId: 0, includeFinal: true }), { sId: 0, includeFinal: true });
    assert.throws(() => GameHttpContractMap.AdminWorldTransfers.request({ sId: 0, includeFinal: "yes" }));
});

test("events：读出积压——各 kit 表的 pending / done / dead / superseded / executable；按 kit / 实例收窄", async () => {
    const f = fakeDeps();
    const all = await readAdminWorldEvents(0, undefined, undefined, f.deps);
    assert.deepEqual(all.tables, [
        { kitId: "kitfix", table: "k_kitfix_world_event", pending: 0, done: 3, dead: 0, superseded: 2, executable: 0 },
        { kitId: "mmo", table: "k_mmo_world_event", pending: 7, done: 100, dead: 1, superseded: 0, executable: 5 },
    ]);
    assert.deepEqual(GameHttpContractMap.AdminWorldEvents.response(all), all);
    const mmo = await readAdminWorldEvents(0, "mmo", "wi_b0", f.deps);
    assert.deepEqual(mmo.tables.map((row) => [row.kitId, row.pending]), [["mmo", 7]], "按 kit 收窄");
    assert.ok(f.calls.includes("stats:k_mmo_world_event:0:wi_b0"), "实例收窄透传到 stats");
    assert.deepEqual(GameHttpContractMap.AdminWorldEvents.request({ sId: 0, kitId: "mmo" }), { sId: 0, kitId: "mmo" });
    assert.throws(() => GameHttpContractMap.AdminWorldEvents.request({ sId: 70_000 }));
});
