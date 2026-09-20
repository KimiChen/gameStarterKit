/**
 * MMO MF7b-B6 回退窗口矩阵（docs/MMO.md §7.3「回退窗口」表逐行一条用例；无 Colyseus 传输、假世界事务 + MemoryCheckpointPort，
 * 真库上的对应行见 test/int/world-event-dedup.test.ts（① / ⑦ 的 opId 去重与门）与 test/int/world-crash-restart.test.ts（硬杀 → 恢复）：
 *  ① 已确认资产 0 回退：事件行只随检查点原子落库；落盘失败 ⇒ 事件放回缓冲、下一批仍带上（⛔ 丢）；
 *  ② 角色位置 / HP / MP / 冷却 ≤ 1 个角色检查点周期；登出强制点 ⇒ 0 回退；
 *  ③ NPC 存活 / 复活计时 / 未认领掉落 ≤ 1 个分线检查点周期；boss 死亡类强制点（requestCheckpoint）即时落盘；
 *  ④ 脚本 vars / timers：timer 存 dueTick，恢复后按 tick 差重排（分线 tick 不续，从 0 起）；
 *  ⑤ 战斗热状态（移动意图 / dir）无持久：恢复后清零；
 *  ⑥ 世界事件 offset 0 回退：eventOffset 与检查点原子关联，恢复后 seq 从 offset 续、⛔ 重用；
 *  ⑦ 脚本 durable 命令 0 重复：未随检查点落盘的事件随崩溃丢失、重放重新产生（新 seq / 新 event_id），已落盘的恰一次；
 *  ⑧ world_transfer 在途闸：表在 MF8 才建（MF8-B7 落地），本矩阵不占位。
 * 硬杀 = 直接 onDispose（⛔ drain 强制点、⛔ finalizeOffline），与 int 的 lease.stop() + 清 interval 同义。
 * 变异验证：WorldRuntime.rollbackCheckpoint 不放回事件 → ① 转红；fixture onRestore 不重排 timer → ④ 转红；
 * WorldRoom.finalLeave 不取强制点 → ②「登出 0 回退」转红；WorldRuntime.recover 不接 eventOffset → ⑥ 转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S, WorldPhase } from "@game/shared";
import { MemoryCheckpointPort } from "../src/rooms/core/CheckpointPort";
import { WorldCheckpointer } from "../src/rooms/core/WorldCheckpoint";
import { WORLD_FIXTURE_CHECKPOINT_SCHEMA, type WorldFixturePersonaSnapshot } from "./fixtures/worldFixtureMode";
import { FakeControl, FakeLeases, dispatch, fakeClient, fakeWorldTxRunner, harness, join, joinOptions, type Harness } from "./world-room.test";

const P_A = "p_alice_0000000001";
const INSTANCE = "wi_m1_0";
type RecordedEvent = { table: string; eventId: string; seq: number; kind: string; payload: unknown; checkpointRev: number };

/** 同一持久层（MemoryCheckpointPort + FakeControl + 事件表数组）上可反复「重启」的世界：build() 每次给一间新房。 */
function world() {
    const port = new MemoryCheckpointPort();
    const control = new FakeControl();
    const leases = new FakeLeases(control.log);
    const events: RecordedEvent[] = [];
    const capability = { kitId: "kfix", port, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: "k_kfix_event" };
    let eventCounter = 0;
    const fakeSql = () => ({ execute: async () => [{ info: "Rows matched: 0", affectedRows: 0 }], query: async () => [[]] }) as never;
    control.seedPersona(P_A, "u-alice");
    const build = (checkpointMs: number): Harness => {
        leases.held.clear();
        const checkpointer = new WorldCheckpointer(capability, 0, {
            withWorldTx: fakeWorldTxRunner(control, control.log, events) as never, sql: fakeSql, eventId: () => `wev_${String(++eventCounter).padStart(12, "0")}`,
        });
        return harness({
            control, leases, world: { emptyPolicy: "run", emptyAfterMs: 100_000, checkpointMs }, modeOptions: { staticCount: 2, checkpoint: capability },
            room: { checkpointer },
        });
    };
    return { port, control, events, build };
}
const personaSnapshot = (port: MemoryCheckpointPort): WorldFixturePersonaSnapshot => port.personas.get(`0:${P_A}`)!.snapshot as WorldFixturePersonaSnapshot;
/** 硬杀：⛔ drain / ⛔ 强制点，直接 dispose（onDispose 只 drain(0) + offline，不取检查点；finalizeOffline 才取）。 */
const hardKill = (h: Harness): Promise<void> => h.room.onDispose();
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

test("§7.3 ② 角色位置 ≤ 1 个角色检查点周期、登出强制点 ⇒ 0 回退；⑤ 战斗热状态恢复后清零", async () => {
    const w = world();
    const h = w.build(500);
    await h.room.onCreate(joinOptions());
    const alice = fakeClient("sa", P_A, "u-alice");
    await join(h.room, alice);
    dispatch(h.room, C2S.WorldFixtureMove, alice, { dirX: 1, dirY: 0, seq: 1 });
    h.room.advance(200); // 4 步：x 508
    h.clock.now += 500;
    h.room.advance(50); // 到节拍 ⇒ 周期检查点：x 510
    await h.room.flushCheckpoints();
    assert.equal(h.room.checkpointRevision, 1);
    assert.equal(personaSnapshot(w.port).x, 510);
    h.room.advance(300); // 崩溃前又走 6 步（无检查点）：x 522
    assert.equal(h.mode.__probe.moverOf("sa")?.x, 522);
    await hardKill(h);
    const restarted = w.build(500);
    await restarted.room.onCreate(joinOptions());
    const alice2 = fakeClient("sa2", P_A, "u-alice");
    await join(restarted.room, alice2);
    const mover = restarted.mode.__probe.moverOf("sa2")!;
    assert.equal(mover.x, 510, "② 位置回退到最近一次角色检查点（≤ 1 周期：丢 6 步）");
    assert.deepEqual([mover.dirX, mover.dirY], [0, 0], "⑤ 移动意图（热状态）不持久：恢复后清零，不会沿旧方向继续跑");
    // 登出强制点：主动离开 ⇒ 离座前取批 ⇒ 0 回退
    dispatch(restarted.room, C2S.WorldFixtureMove, alice2, { dirX: 0, dirY: 1, seq: 2 });
    restarted.room.advance(150); // 3 步：y 506
    await restarted.room.onLeave(alice2 as never, CloseCode.CONSENTED);
    await restarted.room.flushCheckpoints();
    assert.equal(restarted.room.checkpointRevision, 2, "登出强制点单独成批");
    assert.deepEqual([personaSnapshot(w.port).x, personaSnapshot(w.port).y], [510, 506], "登出强制点：最后位置已落盘（0 回退）");
    await restarted.room.onDispose();
});

test("§7.3 ③ NPC / 未认领掉落 ≤ 1 个分线检查点周期；boss 死亡类强制点（requestCheckpoint）即时落盘", async () => {
    const w = world();
    const h = w.build(100_000); // 周期关掉：只看强制点
    await h.room.onCreate(joinOptions());
    h.mode.__probe.place("static-0", 100, 100);
    h.mode.__probe.place("static-1", 200, 200);
    h.room.signal("checkpoint", {}); // mode 侧 context.requestCheckpoint（boss 死亡 / 掉落认领同形）
    h.room.advance(50);
    await h.room.flushCheckpoints();
    assert.equal(h.room.checkpointRevision, 1, "强制点即时落盘（不等周期）");
    h.mode.__probe.place("static-0", 999, 999); // 强制点之后的变化：随崩溃丢失（≤ 1 周期）
    await hardKill(h);
    const restarted = w.build(100_000);
    await restarted.room.onCreate(joinOptions());
    const statics = [...restarted.mode.__probe.entities().values()].filter((entity) => entity.kind === "static").map((entity) => [entity.id, entity.x, entity.y]);
    assert.deepEqual(statics, [["static-0", 100, 100], ["static-1", 200, 200]], "分线状态回到强制点：强制点后的 999 丢失、强制点前的 100 / 200 保住");
    await restarted.room.onDispose();
});

test("§7.3 ④ 脚本 timers：存 dueTick，恢复后按 tick 差重排", async () => {
    const w = world();
    const h = w.build(100_000);
    await h.room.onCreate(joinOptions());
    h.room.advance(500); // tick 10
    h.mode.__probe.setTimer("respawn-boss", 25); // 距到期 15 步
    h.room.signal("checkpoint", {});
    h.room.advance(50); // tick 11 取批：快照 tick 11、dueTick 25 ⇒ 剩余 14
    await h.room.flushCheckpoints();
    assert.equal((w.port.instances.get(`0:${INSTANCE}`)?.snapshot as { tick: number; timers: Record<string, number> }).tick, 11);
    await hardKill(h);
    const restarted = w.build(100_000);
    await restarted.room.onCreate(joinOptions()); // 分线 tick ⛔ 续：新房从 0 起
    assert.equal(restarted.room.worldTick, 0);
    assert.deepEqual([...restarted.mode.__probe.timers()], [["respawn-boss", 14]], "dueTick 重排 = 当前 tick 0 + (25 − 11)，⛔ 沿用旧绝对 tick 25");
    await restarted.room.onDispose();
});

test("§7.3 ⑥ 世界事件 offset 0 回退（seq 从 offset 续、⛔ 重用）；① / ⑦ 事件批随检查点原子、未落盘事件随崩溃丢失后重放重新产生、落盘失败放回缓冲", async () => {
    const w = world();
    const h = w.build(100_000);
    await h.room.onCreate(joinOptions());
    const alice = fakeClient("sa", P_A, "u-alice");
    await join(h.room, alice);
    h.room.signal("loot", { session: "sa", amount: 1 }); // seq 1
    h.room.signal("loot", { session: "sa", amount: 2 }); // seq 2
    h.room.signal("checkpoint", {});
    h.room.advance(50);
    await h.room.flushCheckpoints();
    assert.deepEqual(w.events.map((event) => [event.seq, event.checkpointRev]), [[1, 1], [2, 1]], "① 事件批随 rev 1 检查点同事务落库");
    assert.equal(w.port.instances.get(`0:${INSTANCE}`)?.eventOffset, 2, "⑥ eventOffset = 已落盘的最后 seq");
    h.room.signal("loot", { session: "sa", amount: 3 }); // seq 3：⛔ 未落盘
    assert.equal(w.events.length, 2, "未到检查点的事件 ⛔ 单独落库");
    await hardKill(h);
    const restarted = w.build(100_000);
    await restarted.room.onCreate(joinOptions());
    const alice2 = fakeClient("sa2", P_A, "u-alice");
    await join(restarted.room, alice2);
    restarted.room.signal("loot", { session: "sa2", amount: 3 }); // ⑦ 重放重新产生：seq 3（从 offset 2 续，⛔ 重用 1 / 2）
    restarted.room.signal("checkpoint", {});
    restarted.room.advance(50);
    await restarted.room.flushCheckpoints();
    assert.deepEqual(w.events.map((event) => [event.seq, event.checkpointRev, (event.payload as { amount: number }).amount]), [[1, 1, 1], [2, 1, 2], [3, 2, 3]], "⑦ 已落盘的恰一次；丢失的重新产生用新 seq");
    assert.equal(new Set(w.events.map((event) => event.eventId)).size, 3, "event_id 各不相同（worker 端 opId 去重的前提）");
    // ① 落盘失败（权威已失）⇒ 本批整体未落盘、事件放回缓冲 ⇒ 下一批仍带上（⛔ 丢）
    const epoch = restarted.room.address.authorityEpoch;
    w.control.instance(INSTANCE).authorityEpoch = epoch + 7;
    restarted.room.signal("loot", { session: "sa2", amount: 4 }); // seq 4
    restarted.room.signal("checkpoint", {});
    restarted.room.advance(50);
    await restarted.room.flushCheckpoints();
    assert.equal(w.events.length, 3, "权威已失 ⇒ 本批（含 seq 4）整体未落盘");
    assert.equal(restarted.room.checkpointRevision, 2, "rev 不推进");
    assert.equal(restarted.room.phase, WorldPhase.Draining, "权威已失 ⇒ Draining");
    // 观测放回：假回滚场景——权威恢复后 Draining → Offline 的强制点把放回的 seq 4 带上（生产里权威不会回来，此处只为验证缓冲未丢）
    w.control.instance(INSTANCE).authorityEpoch = epoch;
    assert.equal(restarted.timers.fire(), 1, "drain 宽限计时器");
    await restarted.room.flushCheckpoints();
    await settle();
    assert.deepEqual(w.events.slice(3).map((event) => [event.seq, event.checkpointRev, (event.payload as { amount: number }).amount]), [[4, 4, 4]], "① 放回缓冲的事件随下一批落库，seq / 内容不变；失败批的 rev 3 作废不复用（rev = max(已落库, 已发出) + 1）");
    assert.equal(restarted.room.phase, WorldPhase.Offline);
    assert.equal(restarted.room.isDisposed, true);
});
