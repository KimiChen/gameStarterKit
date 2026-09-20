/**
 * MMO MK1-B4 persona 级强制点（docs/MMO.md §12 MK0 偏差 ⑩ 收口；假世界事务 + MemoryCheckpointPort，无 Colyseus 传输）：
 *  - mode 实现 onPersonaCheckpoint ⇒ 离座只落该 persona 的快照：端口只多一条 persona 行、⛔ 分线快照、⛔ 其他 persona、⛔ 推进 checkpoint_rev；
 *    分线 rev 号被预留（下一全批 rev 跳号），persona 信封 rev 仍单调（MemoryCheckpointPort 同语义）；
 *  - 交接 prepare 同样只落该 persona（源房 Committed 前 persona 状态已耐久）；
 *  - mode 未实现 ⇒ 退化为全批强制点（既有 §7.3 ② 语义：world-rollback-windows）。
 * 变异验证：WorldRoom.finalLeave 不先试 forcePersonaCheckpoint → 「离座只落该 persona」转红；WorldRuntime.forcePersonaCheckpoint 不预留 rev → 「跳号」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S } from "@game/shared";
import { MemoryCheckpointPort } from "../src/rooms/core/CheckpointPort";
import { WorldCheckpointer } from "../src/rooms/core/WorldCheckpoint";
import { WORLD_FIXTURE_CHECKPOINT_SCHEMA, type WorldFixturePersonaSnapshot } from "./fixtures/worldFixtureMode";
import { FakeControl, FakeLeases, dispatch, fakeClient, fakeWorldTxRunner, harness, join, joinOptions, type Harness } from "./world-room.test";

const P_A = "p_alice_0000000001";
const P_B = "p_bob_00000000001";
type RecordedEvent = { table: string; eventId: string; seq: number; kind: string; payload: unknown; checkpointRev: number };

function world(personaCheckpoint: boolean) {
    const port = new MemoryCheckpointPort();
    const control = new FakeControl();
    const leases = new FakeLeases(control.log);
    const events: RecordedEvent[] = [];
    const capability = { kitId: "kfix", port, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: "k_kfix_event" };
    const fakeSql = () => ({ execute: async () => [{ info: "Rows matched: 0", affectedRows: 0 }], query: async () => [[]] }) as never;
    control.seedPersona(P_A, "u-alice");
    control.seedPersona(P_B, "u-bob");
    const build = (checkpointMs: number): Harness => {
        leases.held.clear();
        const checkpointer = new WorldCheckpointer(capability, 0, { withWorldTx: fakeWorldTxRunner(control, control.log, events) as never, sql: fakeSql, eventId: () => "wev_x" });
        // publish 置空：交接 Committed 后的跨房唤醒缺省走真 coord Redis（连接不关 ⇒ 测试进程不退出）
        return harness({ control, leases, world: { emptyPolicy: "run", emptyAfterMs: 100_000, checkpointMs }, modeOptions: { staticCount: 1, checkpoint: capability, personaCheckpoint }, room: { checkpointer, publish: async () => 0 } });
    };
    return { port, control, build };
}
const personaOf = (port: MemoryCheckpointPort, persona: string) => port.personas.get(`0:${persona}`) ?? null;
/** 端口日志去掉世界事务 writeSeq 后缀（`persona:<id>:<rev>@<writeSeq>`）。 */
const saved = (port: MemoryCheckpointPort): string[] => port.log.map((line) => line.replace(/@\d+$/u, ""));
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

test("离座只落该 persona：端口只多一条 persona 行、⛔ 分线快照 / 其他 persona / checkpoint_rev；分线 rev 预留 ⇒ 下一全批跳号；persona 信封 rev 单调", async () => {
    const w = world(true);
    const h = w.build(500);
    await h.room.onCreate(joinOptions());
    const alice = fakeClient("sa", P_A, "u-alice");
    const bob = fakeClient("sb", P_B, "u-bob");
    await join(h.room, alice);
    await join(h.room, bob);
    dispatch(h.room, C2S.WorldFixtureMove, alice, { dirX: 1, dirY: 0, seq: 1 });
    h.room.advance(200); // 4 步：x 508
    await h.room.onLeave(alice as never, CloseCode.CONSENTED);
    await h.room.flushCheckpoints();
    assert.deepEqual(saved(w.port), [`persona:${P_A}:1`], "只落 alice 一条；⛔ instance；⛔ bob");
    assert.equal(h.room.checkpointRevision, 0, "⛔ 推进 checkpoint_rev");
    assert.deepEqual([(personaOf(w.port, P_A)!.snapshot as WorldFixturePersonaSnapshot).x, personaOf(w.port, P_A)!.rev, personaOf(w.port, P_A)!.controlEpoch], [508, 1, 1]);
    assert.equal(h.mode.__probe.personaCheckpoints, 1);
    assert.equal(h.mode.__probe.checkpoints, 0, "⛔ 全批 onCheckpoint");
    // 周期全批：rev 跳过被预留的 1 ⇒ 2；bob 的 persona 与分线快照此时才落
    h.clock.now += 500;
    h.room.advance(50);
    await h.room.flushCheckpoints();
    assert.deepEqual(saved(w.port).slice(1), ["instance:wi_m1_0:2", `persona:${P_B}:2`]);
    assert.equal(h.room.checkpointRevision, 2);
    // bob 离座：persona rev 3（> 2，MemoryCheckpointPort 单调不抛）
    await h.room.onLeave(bob as never, CloseCode.CONSENTED);
    await h.room.flushCheckpoints();
    assert.equal(saved(w.port).at(-1), `persona:${P_B}:3`);
    assert.equal(h.room.checkpointRevision, 2, "persona 级强制点不动分线 rev");
    await h.room.onDispose();
});

test("交接 prepare 只落该 persona（源房 Committed 前 persona 已耐久）；mode 未实现 onPersonaCheckpoint ⇒ 离座退化为全批", async () => {
    const w = world(true);
    const h = w.build(100_000);
    await h.room.onCreate(joinOptions());
    const alice = fakeClient("sa", P_A, "u-alice");
    await join(h.room, alice);
    dispatch(h.room, C2S.WorldFixturePortal, alice, { toMap: "m2" });
    h.room.advance(50);
    await settle();
    await h.room.flushCheckpoints();
    assert.ok(w.port.log.some((line) => line.startsWith(`persona:${P_A}:`)), `交接强制点落 alice：${w.port.log.join(",")}`);
    assert.ok(!w.port.log.some((line) => line.startsWith("instance:")), "⛔ 分线快照");
    assert.ok(h.mode.__probe.log.some((line) => line.startsWith("transfer:sa:ready")), "交接照常 Committed");
    await h.room.onDispose();

    const legacy = world(false);
    const l = legacy.build(100_000);
    await l.room.onCreate(joinOptions());
    const carol = fakeClient("sc", P_A, "u-alice");
    await join(l.room, carol);
    await l.room.onLeave(carol as never, CloseCode.CONSENTED);
    await l.room.flushCheckpoints();
    assert.deepEqual(saved(legacy.port), ["instance:wi_m1_0:1", `persona:${P_A}:1`], "未实现 ⇒ 全批（分线 + persona）");
    assert.equal(l.room.checkpointRevision, 1);
    await l.room.onDispose();
});
