/** 世界检查点故障回归：在途批前缀、交接强制点结果、跨分线接管后 fail-closed 重建。 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S, WorldPhase } from "@game/shared";
import { MemoryCheckpointPort } from "../src/rooms/core/CheckpointPort";
import { WorldCheckpointer } from "../src/rooms/core/WorldCheckpoint";
import { MemoryWorldTicketPort } from "../src/rooms/core/WorldTicket";
import { WORLD_LOST_CONTROL_CLOSE_CODE } from "../src/rooms/WorldRoom";
import { WORLD_FIXTURE_CHECKPOINT_SCHEMA, type WorldFixturePersonaSnapshot } from "./fixtures/worldFixtureMode";
import { FakeControl, FakeLeases, FakeTransfers, dispatch, fakeClient, fakeWorldTxRunner, harness, join, joinOptions, type Harness } from "./world-room.test";
const P_A = "p_alice_0000000001", P_B = "p_bob_00000000001", P_C = "p_carol_000000001";
const U_A = "u-alice", U_B = "u-bob", U_C = "u-carol";
type RecordedEvent = { table: string; eventId: string; seq: number; kind: string; payload: unknown; checkpointRev: number };
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
function deferred() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
}
function cluster() {
    const control = new FakeControl(), leases = new FakeLeases(control.log), port = new MemoryCheckpointPort();
    const events: RecordedEvent[] = [];
    const tickets = new MemoryWorldTicketPort(() => 0), transfers = new FakeTransfers(tickets, () => 1_000);
    const capability = { kitId: "kfix", port, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: "k_kfix_event" };
    const fakeSql = () => ({ execute: async () => [{ info: "Rows matched: 0", affectedRows: 0 }], query: async () => [[]] }) as never;
    let eventCounter = 0;
    control.seedPersona(P_A, U_A); control.seedPersona(P_B, U_B); control.seedPersona(P_C, U_C);
    const build = async (mapId = "m1", personaCheckpoint = true) => {
        const checkpointer = new WorldCheckpointer(capability, 0, {
            withWorldTx: fakeWorldTxRunner(control, control.log, events) as never,
            sql: fakeSql, eventId: () => `wev_${++eventCounter}`,
        });
        const h = harness({
            control, leases, tickets, transfers, capacity: 3,
            world: { emptyPolicy: "run", emptyAfterMs: 100_000, checkpointMs: 100_000 },
            modeOptions: { staticCount: 1, checkpoint: capability, personaCheckpoint },
            room: { checkpointer, publish: async () => 0, registerSignal: () => () => undefined },
        });
        await h.room.onCreate(joinOptions({ mapId }));
        return { ...h, checkpointer };
    };
    const enter = async (h: Harness, session: string, personaId = P_A, uid = U_A) => {
        const mapId = h.room.address.mapId;
        const ticket = tickets.issue({ sId: 0, uid, personaId, worldAddress: `s0/${mapId}/0`, controlEpoch: control.personas.get(personaId)!.controlEpoch, transferId: null, nowMs: 0 });
        const client = fakeClient(session, personaId, uid, { mapId, ticketSha256: ticket.ticketSha256 });
        await join(h.room, client);
        return client;
    };
    return { control, leases, port, events, transfers, build, enter };
}
function checkpoint(h: Harness): void { h.room.signal("checkpoint", {}); h.room.advance(50); }

for (const firstFails of [true, false]) {
    test(`在途检查点前批${firstFails ? "失败" : "成功"}：预先取得的后批保存完整事件且不重复，重启无缺口`, async () => {
        const c = cluster(), h = await c.build();
        await c.enter(h, "a");
        const gate = deferred(), started = deferred();
        const save = h.checkpointer.save.bind(h.checkpointer);
        let attempts = 0;
        h.checkpointer.save = async (id, batch) => { attempts += 1; if (attempts === 1) { started.resolve(); await gate.promise; } return save(id, batch); };
        h.room.signal("loot", { session: "a", amount: 3 });
        checkpoint(h);
        await started.promise;
        checkpoint(h); // 前批仍在库内：后批已经取得相同 eventOffset 的快照。
        if (firstFails) gate.reject(new Error("injected checkpoint failure")); else gate.resolve();
        await h.room.flushCheckpoints();
        assert.equal(h.room.checkpointRevision, 2);
        assert.equal(c.port.instances.get("0:wi_m1_0")?.eventOffset, 1);
        assert.deepEqual(c.events.map((event) => [event.seq, (event.payload as { amount: number }).amount]), [[1, 3]], "完整持久点覆盖 e1，而且只追加一次");
        await h.room.onDispose(); // 不走 drain 强制点：丢弃全部内存，再由同一持久层恢复。
        const restarted = await c.build();
        assert.equal(restarted.room.checkpointRevision, 2);
        checkpoint(restarted);
        await restarted.room.flushCheckpoints();
        assert.equal(c.port.instances.get("0:wi_m1_0")?.eventOffset, 1);
        assert.deepEqual(c.events.map((event) => event.seq), [1], "恢复后继续保存也不重发 e1");
        await restarted.room.onDispose();
    });
}
for (const personaCheckpoint of [true, false]) {
    test(`交接${personaCheckpoint ? "persona" : "全批"}强制点失败：取消交接、解冻、恢复存储后可再交接`, async () => {
        const c = cluster(), h = await c.build("m1", personaCheckpoint);
        const client = await c.enter(h, "a");
        const save = h.checkpointer.save.bind(h.checkpointer), savePersona = h.checkpointer.savePersona.bind(h.checkpointer);
        h.checkpointer.save = async () => { throw new Error("injected full checkpoint failure"); };
        h.checkpointer.savePersona = async () => { throw new Error("injected persona checkpoint failure"); };
        dispatch(h.room, C2S.WorldFixturePortal, client, { toMap: "m2" }); h.room.advance(50);
        await settle();
        assert.equal([...c.transfers.rows.values()][0]?.state, "cancelled");
        assert.equal(c.port.personas.size, 0);
        assert.ok(!h.mode.__probe.log.some((line) => line.startsWith("transfer:a:ready")));
        assert.equal(h.room.seatedCount, 1);
        dispatch(h.room, C2S.WorldFixtureMove, client, { dirX: 1, dirY: 0, seq: 1 });
        assert.equal(h.room.pendingCommands, 1, "失败后解冻，可以继续接收命令"); h.room.advance(50);
        h.checkpointer.save = save; h.checkpointer.savePersona = savePersona;
        dispatch(h.room, C2S.WorldFixturePortal, client, { toMap: "m2" }); h.room.advance(50);
        await settle();
        assert.deepEqual([...c.transfers.rows.values()].map((row) => row.state), ["cancelled", "committed"]);
        assert.equal(c.port.personas.size, 1, "第二次成功后才交出角色");
        assert.ok(h.mode.__probe.log.includes("transfer:a:ready:m2"));
        await h.room.onDispose();
    });
}

test("跨分线接管：旧分线停止全部排队写入并退出，从最后持久点重建后可以继续保存", async () => {
    const c = cluster(), a = await c.build("m1"), b = await c.build("m2");
    const alice = await c.enter(a, "a"), bob = await c.enter(a, "bob", P_B, U_B), carol = await c.enter(a, "carol", P_C, U_C);
    checkpoint(a); await a.room.flushCheckpoints();
    const durableLog = [...c.port.log], durableBob = c.port.personas.get(`0:${P_B}`)!.snapshot as WorldFixturePersonaSnapshot;
    const gate = deferred(), started = deferred(), save = a.checkpointer.save.bind(a.checkpointer);
    let saveCalls = 0, personaSaveCalls = 0;
    a.checkpointer.save = async (id, batch) => { saveCalls += 1; started.resolve(); await gate.promise; return save(id, batch); };
    a.checkpointer.savePersona = async () => { personaSaveCalls += 1; throw new Error("must not save queued persona"); };
    a.room.signal("loot", { session: "a", amount: 9 });
    dispatch(a.room, C2S.WorldFixtureMove, bob, { dirX: 1, dirY: 0, seq: 1 }); checkpoint(a);
    await started.promise;
    await c.enter(b, "new-a"); // 当前 epoch 普通票：新的合法控制者已在另一图。
    checkpoint(a); // 全批已排队，仍包含旧 epoch 的 alice。
    await a.room.onLeave(carol as never, CloseCode.CONSENTED); // persona 强制点也排在失败批之后。
    gate.resolve(); await a.room.flushCheckpoints(); await settle();
    assert.equal(a.room.phase, WorldPhase.Offline, "不再无限留在 Active 重试失败");
    assert.equal(a.room.isDisposed, true);
    assert.equal(alice.closed, WORLD_LOST_CONTROL_CLOSE_CODE);
    assert.notEqual(bob.closed, null, "其余玩家重新连接已持久状态，⛔ 删除守卫后保存脏世界");
    assert.equal(b.room.seatedCount, 1, "新控制者不受影响");
    assert.equal(saveCalls, 1, "后继全批和 drain 强制点都不能再写");
    assert.equal(personaSaveCalls, 0, "已排队的 persona 强制点也不能再写");
    assert.deepEqual(c.port.log, durableLog);
    assert.equal(c.events.length, 0, "失控来源不明的未耐久事件不得去掉守卫重放");
    const restarted = await c.build("m1");
    assert.equal(restarted.room.checkpointRevision, 1);
    const bob2 = await c.enter(restarted, "bob2", P_B, U_B);
    assert.equal(restarted.mode.__probe.moverOf("bob2")?.x, durableBob.x, "角色回到最后耐久快照");
    dispatch(restarted.room, C2S.WorldFixtureMove, bob2, { dirX: 1, dirY: 0, seq: 1 }); checkpoint(restarted);
    await restarted.room.flushCheckpoints();
    assert.equal(restarted.room.checkpointRevision, 2, "重建后可正常保存");
    assert.ok((c.port.personas.get(`0:${P_B}`)!.snapshot as WorldFixturePersonaSnapshot).x > durableBob.x);
    assert.equal(c.events.length, 0);
    await restarted.room.onDispose(); await b.room.onDispose();
});
