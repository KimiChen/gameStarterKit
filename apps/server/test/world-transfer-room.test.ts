/**
 * MMO MF8-B3 准入固定时序 + 交接编排（docs/MMO.md §5.4 MF8；SERVER.md §5 邀请码同形；壳单测：FakeControl / FakeTransfers / MemoryWorldTicketPort）：
 *  - 准入：同步公共拒绝 → 同步占位 → **异步 claim**（绑定 uid / persona / worldAddress / controlEpoch；一次性）→ 同步重验 → acquireControl →
 *    （交接则 activate 唯一一次）→ onAdmit → seat；claim 后任一步失败 ⇒ release（同凭据可重试）；seat 后重放 ⇒ 拒；
 *  - 交接：portal → request（一 persona 只一在途、冻结命令）→ prepare → 交接强制点 → 凭据 → Committed ⇒ mode 收到就绪、客户端收到 token、
 *    源房 "transferred" 离座（回收实体、归还旧控制权）→ 目标房按凭据准入：activate → 落座 → finalize；persona 快照随交接强制点带到目标；
 *  - Committed 前失败 ⇒ cancelled + 解冻 + mode 收到失败；目标 = 本分线拒；第二个会话拿同一 transferId 的新凭据 ⇒ activate already ⇒ 拒（双激活闸）。
 * 变异验证：WorldRoom 删 activate 的 `step.outcome === "already"` 判断 →「双激活闸」转红；claim 失败不 release →「失败后同凭据可重试」转红；
 * requestTransfer 不 setFrozen →「在途中命令被拒」转红；completeTransfer 不 evict →「源房离座」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import { C2S, ErrorCode, S2C, WorldPhase, type IErrorRes, type IWorldFixtureTransfer } from "@game/shared";
import { MemoryCheckpointPort, buildCheckpointEnvelope } from "../src/rooms/core/CheckpointPort";
import { WorldCheckpointer } from "../src/rooms/core/WorldCheckpoint";
import { MemoryWorldTicketPort, worldTicketHash } from "../src/rooms/core/WorldTicket";
import { WORLD_FIXTURE_CHECKPOINT_SCHEMA, type WorldFixturePersonaSnapshot } from "./fixtures/worldFixtureMode";
import {
    FakeControl, FakeLeases, FakeTransfers, assertCode, dispatch, fakeClient, fakeWorldTxRunner, harness, join, joinOptions, type FakeClient, type Harness,
} from "./world-room.test";

const P_A = "p_alice_0000000001";
const U_A = "u-alice";
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const errorsOf = (who: FakeClient): number[] => who.sent.filter(([type]) => type === S2C.Error).map(([, payload]) => (payload as IErrorRes).code);
const transferMessages = (who: FakeClient): IWorldFixtureTransfer[] => who.sent.filter(([type]) => type === S2C.WorldFixtureTransfer).map(([, payload]) => payload as IWorldFixtureTransfer);

/** 同一区的两条分线（m1 / m2）共享控制面、租约、凭据、交接持久面与 persona 检查点（kit 持久层）。 */
function cluster() {
    const control = new FakeControl();
    const leases = new FakeLeases(control.log);
    const port = new MemoryCheckpointPort();
    const capability = { kitId: "kfix", port, schema: WORLD_FIXTURE_CHECKPOINT_SCHEMA, eventTable: "k_kfix_event" };
    const events: Array<{ table: string; eventId: string; seq: number; kind: string; payload: unknown; checkpointRev: number }> = [];
    const fakeSql = () => ({ execute: async () => [{ info: "Rows matched: 0", affectedRows: 0 }], query: async () => [[]] }) as never;
    const tickets = new MemoryWorldTicketPort(() => 0); // 单测不测过期（int/world-ticket 测）
    const transfers = new FakeTransfers(tickets);
    let eventCounter = 0;
    control.seedPersona(P_A, U_A);
    const room = async (mapId: string): Promise<Harness> => {
        const checkpointer = new WorldCheckpointer(capability, 0, {
            withWorldTx: fakeWorldTxRunner(control, control.log, events) as never, sql: fakeSql, eventId: () => `wev_${String(++eventCounter).padStart(12, "0")}`,
        });
        const h = harness({
            control, leases, tickets, transfers, world: { emptyPolicy: "run", emptyAfterMs: 100_000, checkpointMs: 100_000 },
            modeOptions: { staticCount: 0, checkpoint: capability }, room: { checkpointer },
        });
        await h.room.onCreate(joinOptions({ mapId }));
        return h;
    };
    /** world.enter 同形：首次进世界凭据（绑定当前 controlEpoch）。 */
    const enterTicket = (mapId: string, controlEpoch: number) => tickets.issue({ sId: 0, uid: U_A, personaId: P_A, worldAddress: `s0/${mapId}/0`, controlEpoch, transferId: null, nowMs: 0 });
    return { control, leases, port, tickets, transfers, room, enterTicket };
}

test("准入固定时序：claim 绑定与一次性、claim 后失败 release 同凭据可重试、seat 后重放拒、控制权 CAS 输后凭据随 epoch 作废", async () => {
    const c = cluster();
    const a = await c.room("m1");
    const t1 = c.enterTicket("m1", 0);
    await assert.rejects(join(a.room, fakeClient("s0", P_A, U_A, { ticketSha256: "f".repeat(64) })), assertCode(ErrorCode.WorldTicketInvalid), "未知凭据 ⇒ 拒");
    assert.equal(a.control.log.filter((entry) => entry.startsWith("control:")).length, 0, "凭据拒绝发生在控制权 CAS 之前");
    // claim 后、CAS 前失败（persona 检查点损坏 ⇒ ⑦ 拒）⇒ release ⇒ 同凭据可重试
    c.port.personas.set(`0:${P_A}`, buildCheckpointEnvelope({ rev: 1, eventOffset: 0, authorityEpoch: 1, controlEpoch: 0, schemaVersion: 1, snapshot: { x: 1, y: 2, stamina: 5 } }));
    c.port.personas.set(`0:${P_A}`, { ...c.port.personas.get(`0:${P_A}`)!, stateHash: "deadbeef" });
    await assert.rejects(join(a.room, fakeClient("s1", P_A, U_A, { ticketSha256: t1.ticketSha256 })), assertCode(ErrorCode.BadRequest), "检查点损坏 ⇒ 拒");
    assert.deepEqual(c.tickets.log.slice(-2), [`claim:${t1.ticketSha256.slice(0, 8)}:s1`, `release:${t1.ticketSha256.slice(0, 8)}:s1`], "claim 后失败 ⇒ release");
    c.port.personas.delete(`0:${P_A}`);
    const alice = fakeClient("sa", P_A, U_A, { ticketSha256: t1.ticketSha256 });
    await join(a.room, alice);
    assert.equal(a.room.seatedCount, 1);
    assert.equal(c.tickets.log.at(-1), `seat:${t1.ticketSha256.slice(0, 8)}:sa`, "落座 CAS");
    assert.equal(c.control.personas.get(P_A)?.controlEpoch, 1);
    // seat 后重放：拒，且不动在座者
    await assert.rejects(join(a.room, fakeClient("sa2", P_A, U_A, { ticketSha256: t1.ticketSha256 })), assertCode(ErrorCode.WorldTicketInvalid), "二次使用被拒");
    assert.equal(a.room.seatedCount, 1);
    assert.equal(a.room.seatedSessionIds()[0], "sa", "在座者不受影响（拒绝在顶号之前）");
    // 绑定 epoch：旧 epoch 的凭据在别处取控制权后作废
    const stale = c.enterTicket("m1", 0);
    await assert.rejects(join(a.room, fakeClient("sa3", P_A, U_A, { ticketSha256: stale.ticketSha256 })), assertCode(ErrorCode.WorldTicketInvalid), "绑定 controlEpoch 0 ≠ 存储 1 ⇒ mismatch");
    // 控制权 CAS 输（⑧）：凭据已 release，但 epoch 已被别处抬高 ⇒ 该凭据作废（需重新 enter）
    const t2 = c.enterTicket("m1", 1);
    c.control.beforeAcquireControl = (personaId) => { if (personaId === P_A) { c.control.personas.get(P_A)!.controlEpoch = 2; c.control.beforeAcquireControl = null; } };
    await assert.rejects(join(a.room, fakeClient("sa4", P_A, U_A, { ticketSha256: t2.ticketSha256 })), assertCode(ErrorCode.ControlConflict));
    assert.equal(c.tickets.log.at(-1), `release:${t2.ticketSha256.slice(0, 8)}:sa4`);
    await assert.rejects(join(a.room, fakeClient("sa5", P_A, U_A, { ticketSha256: t2.ticketSha256 })), assertCode(ErrorCode.WorldTicketInvalid), "epoch 已变 ⇒ mismatch");
    await a.room.onDispose();
});

test("交接编排：portal → Committed（mode 就绪 + 客户端收 token）→ 源房 transferred 离座 → 目标房 activate 唯一 → 落座 → finalize；快照随交接强制点带过去", async () => {
    const c = cluster();
    const a = await c.room("m1");
    const t1 = c.enterTicket("m1", 0);
    const alice = fakeClient("sa", P_A, U_A, { ticketSha256: t1.ticketSha256 });
    await join(a.room, alice);
    dispatch(a.room, C2S.WorldFixtureMove, alice, { dirX: 1, dirY: 0, seq: 1 });
    a.room.advance(500); // x 520
    dispatch(a.room, C2S.WorldFixtureMove, alice, { dirX: 0, dirY: 0, seq: 2 });
    a.room.advance(50);
    const xBefore = a.mode.__probe.moverOf("sa")!.x;
    dispatch(a.room, C2S.WorldFixturePortal, alice, { toMap: "m2" });
    a.room.advance(50); // 命令在下一步被消费 ⇒ context.transfer.request
    await settle();
    const rows = [...c.transfers.rows.values()];
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.deepEqual([row.state, row.personaId, row.fromInstance, row.toMap, row.toInstance, row.controlEpoch, row.active], ["committed", P_A, "wi_m1_0", "m2", "wi_m2_0", 1, true]);
    assert.deepEqual(c.transfers.log, [`requested:${row.transferId}`, `prepared:${row.transferId}`, `committed:${row.transferId}`], "每步持久推进");
    assert.ok(a.mode.__probe.log.includes(`transfer:sa:ready:m2`), "Committed 后 mode 收到就绪");
    assert.equal(a.room.seatedCount, 1, "离座在下一轮（先让 mode 发 token）");
    assert.ok(a.control.log.some((entry) => entry.startsWith("checkpoint_rev:wi_m1_0:")), "交接强制点已落盘");
    assert.equal((c.port.personas.get(`0:${P_A}`)?.snapshot as WorldFixturePersonaSnapshot).x, xBefore, "persona 快照 = 交接时位置");
    assert.equal(a.timers.fire(), 1, "completeTransfer 计时器");
    const ready = transferMessages(alice);
    assert.equal(ready.length, 1, "客户端恰收一次交接就绪");
    assert.deepEqual([ready[0]!.transferId, ready[0]!.worldAddress, worldTicketHash(ready[0]!.ticket)], [row.transferId, "s0/m2/0", row.ticketSha256], "token 携带的凭据 = 状态机登记的 sha");
    assert.equal(a.room.seatedCount, 0, "源房离座");
    assert.ok(a.mode.__probe.log.includes("leave:sa:transferred"), "回收实体（reason transferred）");
    assert.equal(alice.closed, CloseCode.CONSENTED);
    assert.equal(c.control.personas.get(P_A)?.worldAddress, null, "旧控制权归还（epoch 不动）");
    assert.equal(c.control.personas.get(P_A)?.controlEpoch, 1);
    // 目标房：按凭据准入 ⇒ activate（唯一）→ 落座 → finalize；位置从交接强制点回灌
    const b = await c.room("m2");
    const alice2 = fakeClient("sb", P_A, U_A, { ticketSha256: worldTicketHash(ready[0]!.ticket), mapId: "m2" });
    await join(b.room, alice2);
    await settle();
    assert.equal(b.room.seatedCount, 1);
    assert.ok(b.mode.__probe.log.includes("enter:sb:restored"), "persona 检查点回灌");
    assert.equal(b.mode.__probe.moverOf("sb")?.x, xBefore, "位置跟着交接走（0 回退）");
    assert.deepEqual([c.transfers.rows.get(row.transferId)?.state, c.transfers.rows.get(row.transferId)?.active, c.transfers.rows.get(row.transferId)?.controlEpoch], ["finalized", false, 2]);
    assert.equal(c.control.personas.get(P_A)?.worldAddress, "s0/m2/0");
    // 同一凭据二次使用 ⇒ 拒；伪造「同 transferId 的新凭据」⇒ activate already 且 epoch 不符 ⇒ 双激活闸
    await assert.rejects(join(b.room, fakeClient("sb2", P_A, U_A, { ticketSha256: worldTicketHash(ready[0]!.ticket), mapId: "m2" })), assertCode(ErrorCode.WorldTicketInvalid));
    const forged = c.tickets.issue({ sId: 0, uid: U_A, personaId: P_A, worldAddress: "s0/m2/0", controlEpoch: 2, transferId: row.transferId, nowMs: 0 });
    await assert.rejects(join(b.room, fakeClient("sb3", P_A, U_A, { ticketSha256: forged.ticketSha256, mapId: "m2" })), assertCode(ErrorCode.ControlConflict), "双激活闸：activate already 且不是本会话的 epoch");
    assert.equal(b.room.seatedCount, 1, "已入座者仍在：已消费的交接在取控制权之前就拒（⛔ 顶号）");
    assert.equal(c.control.personas.get(P_A)?.controlEpoch, 2, "控制权 epoch 未被伪造凭据抬高");
    await a.room.onDispose();
    await b.room.onDispose();
});

test("Committed 前失败 ⇒ cancelled + 解冻 + mode 收到失败；在途中命令被拒；目标 = 本分线拒；重复 portal ⇒ 在途拒", async () => {
    const c = cluster();
    const a = await c.room("m1");
    const t1 = c.enterTicket("m1", 0);
    const alice = fakeClient("sa", P_A, U_A, { ticketSha256: t1.ticketSha256 });
    await join(a.room, alice);
    // prepare 失败 ⇒ cancelled + 解冻
    c.transfers.failAt.prepare = async () => { throw new Error("boom"); };
    dispatch(a.room, C2S.WorldFixturePortal, alice, { toMap: "m2" });
    a.room.advance(50);
    await settle();
    assert.equal([...c.transfers.rows.values()][0]?.state, "cancelled");
    assert.ok(a.mode.__probe.log.some((line) => line === "transfer:sa:failed:boom"));
    assert.equal(a.room.seatedCount, 1, "仍在座");
    delete c.transfers.failAt.prepare;
    dispatch(a.room, C2S.WorldFixtureMove, alice, { dirX: 1, dirY: 0, seq: 3 });
    a.room.advance(50);
    assert.deepEqual(errorsOf(alice), [], "解冻：命令照常");
    // 目标就是本分线 ⇒ 拒（不写状态机）
    dispatch(a.room, C2S.WorldFixturePortal, alice, { toMap: "m1" });
    a.room.advance(50);
    await settle();
    assert.equal(c.transfers.rows.size, 1, "未新增行");
    assert.ok(a.mode.__probe.log.some((line) => line.startsWith("transfer:sa:failed:") && line.includes("本分线")));
    // 在途：commit 挂起期间命令被拒；重复 portal 被拒（已冻结）
    let releaseCommit: (() => void) | null = null;
    c.transfers.failAt.commit = () => new Promise<never>((_resolve, reject) => { releaseCommit = () => reject(new Error("commit-aborted")); });
    dispatch(a.room, C2S.WorldFixturePortal, alice, { toMap: "m2" });
    a.room.advance(50);
    await settle();
    assert.equal([...c.transfers.rows.values()].at(-1)?.state, "prepared", "卡在 commit 前");
    dispatch(a.room, C2S.WorldFixtureMove, alice, { dirX: 0, dirY: 1, seq: 4 });
    a.room.advance(50);
    assert.deepEqual(errorsOf(alice), [ErrorCode.BadRequest], "在途中命令被拒（冻结）");
    dispatch(a.room, C2S.WorldFixturePortal, alice, { toMap: "m2" });
    a.room.advance(50);
    assert.deepEqual(errorsOf(alice), [ErrorCode.BadRequest, ErrorCode.BadRequest], "重复 portal 同样被冻结拒");
    releaseCommit!();
    await settle();
    assert.equal([...c.transfers.rows.values()].at(-1)?.state, "cancelled", "commit 失败 ⇒ cancelled");
    assert.equal(a.room.seatedCount, 1);
    assert.equal(a.room.phase, WorldPhase.Active);
    await a.room.onDispose();
});
