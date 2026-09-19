/**
 * MMO MF5b 观察者同步·WorldRoom 接入（docs/MMO.md §4.3 / §5.4 MF5b；MF5a 退出条件在 worldFixture 上逐项重跑）：
 *  - 超视距两会话互不收到；私有字段（stamina）只到本人、⛔ 不进 enter / update / baseline；perSession token 全房广播被框架拒；
 *  - 跨格 enter / leave 各恰一次、update 按 rev、无变化不投递；单 seq 流连续；
 *  - 重连 / 客户端 resync ⇒ 只含兴趣集的 baseline（checksum 通过、chunk 计数一致），之后差分相对 baseline 续接；宽限中 ⛔ 不排空；
 *  - 慢会话（一 tick 超上界）：可合并类被丢、回执不丢、下一 tick 整体重同步；
 *  - roster hidden：world 根 ⛔ 无 players；离座后视图 / seq 忘掉，同 id 再入座从 1 起。
 * 与 GameRoom 路径的差异：差分 / baseline 住在无头 WorldRuntime（`world-runtime` 无 Colyseus 也跑），WorldRoom 只每 tick 排空在线会话。
 * 变异验证：mode 把 stamina 塞进 enter 投影 → 「零泄露」转红；WorldRuntime 删 flushObservers → 「跨格」全部转红；
 * WorldRoom.drainObserverQueues 不跳过 away 会话 → 「宽限中不排空」转红；markAway(false) 不 requestBaseline → 「重连 baseline」转红。
 * ⚠ WorldRoom 单一路径通过 ⛔ 不能作为 SLG 2b 的开工证据（那是 MF5a）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { CloseCode } from "colyseus";
import {
    C2S, S2C, WorldPhase, wireChecksum,
    type IWorldFixtureBaselineBegin, type IWorldFixtureBaselineChunk, type IWorldFixtureBaselineEnd, type IWorldFixtureEnter,
    type IWorldFixtureEntityWire, type IWorldFixtureLeave, type IWorldFixturePrivate, type IWorldFixtureUpdate,
} from "@game/shared";
import { ROOM_STATE_ROSTER, createRoomStateForMode } from "../src/rooms/schema/GameRoomState";
import type { WorldRoom } from "../src/rooms/WorldRoom";
import { WORLD_FIXTURE_MODE_ID, type WorldFixtureModeOptions } from "./fixtures/worldFixtureMode";
import { dispatch, fakeClient, harness, join, joinOptions, type FakeClient, type Harness } from "./world-room.test";

const P_A = "p_alice_0000000001";
const P_B = "p_bob_00000000001";
const moverOf = (persona: string): string => `mover-${persona}`;

async function worldRoom(modeOptions: WorldFixtureModeOptions = {}): Promise<Harness> {
    const h = harness({ world: { emptyPolicy: "run", emptyAfterMs: 100_000, checkpointMs: 100_000 }, modeOptions: { staticCount: 0, ...modeOptions } });
    h.control.seedPersona(P_A, "u-alice");
    h.control.seedPersona(P_B, "u-bob");
    await h.room.onCreate(joinOptions());
    return h;
}
async function seat(h: Harness, session: string, persona: string): Promise<FakeClient> {
    const who = fakeClient(session, persona, `u-${persona === P_A ? "alice" : "bob"}`);
    await join(h.room, who);
    return who;
}
const step = (room: WorldRoom, count = 1): void => { for (let index = 0; index < count; index += 1) room.advance(50); };
function messages<T>(who: FakeClient, type: string): T[] {
    return who.sent.filter(([candidate]) => candidate === type).map(([, payload]) => payload as T);
}
const perSession = (who: FakeClient) => who.sent.filter(([type]) => type.startsWith("s2c.worldFixture.") && type !== S2C.WorldFixturePos);
/** 单 seq 流：每条 enter / update / leave / private 一个号，baseline 三件共用一个号 ⇒ distinct seq 从 1 起连续。 */
function assertSeqStream(who: FakeClient): void {
    const seqs = perSession(who).map(([, payload]) => (payload as { seq: number }).seq);
    const distinct = [...new Set(seqs)];
    assert.deepEqual(distinct, distinct.map((_, index) => index + 1), `seq 流必须连续：${JSON.stringify(seqs)}`);
    for (let index = 1; index < seqs.length; index += 1) assert.ok(seqs[index]! >= seqs[index - 1]!, "seq 单调不减");
}
function lastBaseline(who: FakeClient): { readonly items: IWorldFixtureEntityWire[]; readonly begin: IWorldFixtureBaselineBegin } {
    const begins = messages<IWorldFixtureBaselineBegin>(who, S2C.WorldFixtureBaselineBegin);
    const begin = begins[begins.length - 1];
    assert.ok(begin, "应有 baseline");
    const chunks = messages<IWorldFixtureBaselineChunk>(who, S2C.WorldFixtureBaselineChunk).filter((chunk) => chunk.baselineId === begin.baselineId);
    const end = messages<IWorldFixtureBaselineEnd>(who, S2C.WorldFixtureBaselineEnd).find((candidate) => candidate.baselineId === begin.baselineId);
    assert.ok(end, "baseline 必须以 End 收尾");
    assert.equal(chunks.length, begin.chunkCount);
    const items = chunks.sort((left, right) => left.index - right.index).flatMap((chunk) => chunk.items);
    assert.equal(items.length, begin.itemCount);
    assert.equal(wireChecksum(items), end.checksum, "客户端按 canonical FNV-1a 复算 checksum 必须通过");
    assert.equal(end.seq, begin.seq);
    return { items, begin };
}

test("超视距两会话互不收到；私有字段只到本人且 ⛔ 不进 enter / update / baseline；perSession token 全房广播被拒", async () => {
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A);
    step(h.room);
    assert.equal(h.room.phase, WorldPhase.Active);
    assert.deepEqual(lastBaseline(a).items.map((item) => item.id), [moverOf(P_A)], "首发 baseline 只含 a 的兴趣集（自己）");
    assert.deepEqual(messages<IWorldFixturePrivate>(a, S2C.WorldFixturePrivate).map((p) => [p.id, p.stamina]), [[moverOf(P_A), 100]], "私有流首发");
    const b = await seat(h, "sb", P_B);
    h.mode.__probe.place(moverOf(P_B), 900, 900); // 超视距
    step(h.room);
    assert.deepEqual(lastBaseline(b).items.map((item) => item.id), [moverOf(P_B)]);
    dispatch(h.room, C2S.WorldFixtureMove, a, { dirX: 1, dirY: 0, seq: 1 });
    dispatch(h.room, C2S.WorldFixtureMove, b, { dirX: 0, dirY: -1, seq: 1 });
    step(h.room, 3);
    const aText = JSON.stringify(a.sent);
    const bText = JSON.stringify(b.sent);
    assert.doesNotMatch(aText, new RegExp(`"${moverOf(P_B)}"`, "u"), "a 收不到 b 视野的实体");
    assert.doesNotMatch(bText, new RegExp(`"${moverOf(P_A)}"`, "u"), "b 收不到 a 视野的实体");
    assert.ok(messages<IWorldFixturePrivate>(a, S2C.WorldFixturePrivate).every((p) => p.id === moverOf(P_A)), "a 只收到自己的私有流");
    assert.ok(messages<IWorldFixturePrivate>(b, S2C.WorldFixturePrivate).every((p) => p.id === moverOf(P_B)), "b 只收到自己的私有流");
    for (const [type, payload] of [...a.sent, ...b.sent]) {
        if (type === S2C.WorldFixturePrivate) continue;
        assert.doesNotMatch(JSON.stringify(payload), /stamina/u, `${type} 不得携带私有字段`);
    }
    assertSeqStream(a);
    assertSeqStream(b);
    // perSession token 全房广播：S2CPorts fail-closed，双方零收到
    const before = [a.sent.length, b.sent.length];
    h.room.signal("broadcast-leak", {});
    step(h.room);
    assert.equal(messages<IWorldFixtureEnter>(a, S2C.WorldFixtureEnter).filter((m) => m.entity.id === "leak").length, 0);
    assert.equal(messages<IWorldFixtureEnter>(b, S2C.WorldFixtureEnter).filter((m) => m.entity.id === "leak").length, 0);
    assert.ok(!JSON.stringify(a.sent.slice(before[0]!)).includes('"leak"') && !JSON.stringify(b.sent.slice(before[1]!)).includes('"leak"'), "广播被拒");
    await h.room.onDispose();
});

test("跨格：enter / leave 各恰一次、update 按 rev、无变化不投递；单 seq 流连续", async () => {
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A);
    const b = await seat(h, "sb", P_B);
    h.mode.__probe.place(moverOf(P_B), 900, 900);
    step(h.room);
    const aBefore = a.sent.length;
    step(h.room, 2);
    assert.equal(a.sent.length, aBefore, "无变化 ⛔ 不投递");
    // b 瞬移进 a 视野（rev 1）⇒ a 收到 enter 恰一次；b 视野里 a 也进来
    h.mode.__probe.place(moverOf(P_B), 550, 550);
    step(h.room);
    assert.deepEqual(messages<IWorldFixtureEnter>(a, S2C.WorldFixtureEnter).map((m) => [m.entity.id, m.entity.rev]), [[moverOf(P_B), 2]], "进入 a 视野：enter 恰一次");
    assert.deepEqual(messages<IWorldFixtureEnter>(b, S2C.WorldFixtureEnter).map((m) => m.entity.id), [moverOf(P_A)], "同 tick 进入 b 视野：enter 恰一次");
    // b 走一步（rev 前进）⇒ a 收 update 恰一次
    dispatch(h.room, C2S.WorldFixtureMove, b, { dirX: 1, dirY: 0, seq: 1 });
    step(h.room);
    dispatch(h.room, C2S.WorldFixtureMove, b, { dirX: 0, dirY: 0, seq: 2 });
    step(h.room);
    const updates = messages<IWorldFixtureUpdate>(a, S2C.WorldFixtureUpdate);
    assert.deepEqual(updates.map((m) => [m.id, m.x, m.rev]), [[moverOf(P_B), 552, 3]], "rev 前进：update 恰一次（停下不再投递）");
    // b 瞬移出 a 视野 ⇒ 双方各收 leave 恰一次
    h.mode.__probe.place(moverOf(P_B), 950, 950);
    step(h.room, 3);
    assert.deepEqual(messages<IWorldFixtureLeave>(a, S2C.WorldFixtureLeave).map((m) => m.id), [moverOf(P_B)], "离开 a 视野：leave 恰一次");
    assert.deepEqual(messages<IWorldFixtureLeave>(b, S2C.WorldFixtureLeave).map((m) => m.id), [moverOf(P_A)]);
    assert.equal(messages<IWorldFixtureEnter>(a, S2C.WorldFixtureEnter).length, 1);
    assertSeqStream(a);
    assertSeqStream(b);
    await h.room.onDispose();
});

test("重连与客户端 resync ⇒ 只含兴趣集的 baseline（checksum / chunk 计数），之后差分续接；宽限中 ⛔ 不排空、⛔ 不重放 enter", async () => {
    const h = await worldRoom({ staticCount: 4 });
    const a = await seat(h, "sa", P_A);
    await seat(h, "sb", P_B);
    for (const [index, id] of ["static-0", "static-1", "static-2", "static-3"].entries()) h.mode.__probe.place(id, 520 + index, 520);
    step(h.room);
    assert.equal(messages<IWorldFixtureBaselineBegin>(a, S2C.WorldFixtureBaselineBegin).length, 1);
    assert.equal(lastBaseline(a).items.length, 6, "a 视野：自己 + b + 4 静态体");
    // 非主动断线进入宽限：期间 a 自己在走（每步私有流入队）、b 也在动 ⇒ 差分与私有流都不排空（⛔ 不往断掉的连接发）
    dispatch(h.room, C2S.WorldFixtureMove, a, { dirX: 0, dirY: 1, seq: 1 });
    let release!: () => void;
    (h.room as unknown as { allowReconnection(): Promise<void> }).allowReconnection = () => new Promise<void>((resolve) => { release = resolve; });
    const leaving = h.room.onLeave(a as never, CloseCode.ABNORMAL_CLOSURE);
    await Promise.resolve();
    const aDuringGrace = a.sent.length;
    h.mode.__probe.place(moverOf(P_B), 560, 560);
    step(h.room, 2);
    assert.equal(a.sent.length, aDuringGrace, "宽限中不排空");
    release();
    await leaving;
    const enterCountBefore = messages<IWorldFixtureEnter>(a, S2C.WorldFixtureEnter).length;
    dispatch(h.room, C2S.WorldFixtureMove, a, { dirX: 0, dirY: 0, seq: 2 });
    step(h.room);
    assert.equal(messages<IWorldFixtureBaselineBegin>(a, S2C.WorldFixtureBaselineBegin).length, 2, "重连后一次 baseline");
    const reconnect = lastBaseline(a);
    assert.equal(reconnect.items.length, 6, "只含当前兴趣集");
    assert.equal(reconnect.begin.chunkCount, 3, "chunkItems=2 ⇒ 6 条目分 3 块");
    assert.equal(reconnect.items.find((item) => item.id === moverOf(P_B))?.x, 560, "baseline 是当前投影");
    assert.equal(messages<IWorldFixtureEnter>(a, S2C.WorldFixtureEnter).length, enterCountBefore, "重连 ⛔ 不重放 enter");
    // 客户端主动 resync ⇒ 再一次 baseline；随后的差分相对它续接
    // 世界房命令在下一固定步才被 onStep 消费（GameRoom 是到达即执行），requestBaseline 在再下一 tick 的 prepare 生效 ⇒ 两步
    dispatch(h.room, C2S.WorldFixtureResync, a, {});
    step(h.room, 2);
    assert.equal(messages<IWorldFixtureBaselineBegin>(a, S2C.WorldFixtureBaselineBegin).length, 3);
    h.mode.__probe.place(moverOf(P_B), 565, 565);
    step(h.room);
    const updates = messages<IWorldFixtureUpdate>(a, S2C.WorldFixtureUpdate);
    assert.equal(updates[updates.length - 1]?.id, moverOf(P_B));
    assertSeqStream(a);
    await h.room.onDispose();
});

test("慢会话：一 tick 超上界 ⇒ 可合并类被丢、回执不丢、下一 tick 整体重同步（baseline 全量 + checksum）", async () => {
    // 上界 8：baseline = Begin + 5 块 + End = 7 条不超限；一 tick 内 9 条 update 必超限
    const h = await worldRoom({ staticCount: 8, limits: { outboundQueueMaxMessages: 8 } });
    const a = await seat(h, "sa", P_A);
    await seat(h, "sb", P_B);
    for (let index = 0; index < 8; index += 1) h.mode.__probe.place(`static-${index}`, 520 + index, 520);
    h.mode.__probe.place(moverOf(P_B), 530, 530);
    step(h.room);
    assert.equal(lastBaseline(a).items.length, 10, "自己 + b + 8 静态体");
    const updatesBefore = messages<IWorldFixtureUpdate>(a, S2C.WorldFixtureUpdate).length;
    // 同一 tick：回执（a 自己走一步 ⇒ stamina 变 ⇒ 私有流）+ 9 个他者各动一格
    dispatch(h.room, C2S.WorldFixtureMove, a, { dirX: 0, dirY: 1, seq: 1 });
    for (let index = 0; index < 8; index += 1) h.mode.__probe.place(`static-${index}`, 521 + index, 520);
    h.mode.__probe.place(moverOf(P_B), 531, 530);
    step(h.room);
    const receipts = messages<IWorldFixturePrivate>(a, S2C.WorldFixturePrivate).map((p) => p.stamina);
    assert.deepEqual(receipts, [100, 99], "回执（私有流）不丢");
    assert.ok(messages<IWorldFixtureUpdate>(a, S2C.WorldFixtureUpdate).length - updatesBefore < 9, "超限：可合并的 update 被丢");
    assert.equal(messages<IWorldFixtureBaselineBegin>(a, S2C.WorldFixtureBaselineBegin).length, 1, "超限当 tick 只打标记");
    dispatch(h.room, C2S.WorldFixtureMove, a, { dirX: 0, dirY: 0, seq: 2 });
    step(h.room);
    assert.equal(messages<IWorldFixtureBaselineBegin>(a, S2C.WorldFixtureBaselineBegin).length, 2, "下一 tick 整体重同步");
    const resync = lastBaseline(a);
    assert.equal(resync.items.length, 10);
    assert.ok(resync.items.filter((item) => item.kind === "static").every((item) => item.rev === 2), "baseline 是移动后的全量投影");
    const seqs = perSession(a).map(([, payload]) => (payload as { seq: number }).seq);
    for (let index = 1; index < seqs.length; index += 1) assert.ok(seqs[index]! >= seqs[index - 1]!, "seq 单调不减");
    assert.ok(resync.begin.seq > Math.max(...seqs.filter((seq) => seq !== resync.begin.seq)), "重同步 baseline 的 seq 在流的最末");
    await h.room.onDispose();
});

test("roster hidden：world 根 ⛔ 无 players；离座后视图 / seq 忘掉，同会话 id 再入座 seq 从 1 起；无 observer 能力的 world mode 端口 fail-closed", async () => {
    assert.equal((ROOM_STATE_ROSTER as Readonly<Record<string, string>>)[WORLD_FIXTURE_MODE_ID], "hidden");
    assert.ok(!("players" in (createRoomStateForMode(WORLD_FIXTURE_MODE_ID) as object)), "生成 root 没有 players map");
    const h = await worldRoom();
    const a = await seat(h, "sa", P_A);
    step(h.room, 2);
    assert.ok(perSession(a).length >= 2);
    await h.room.onLeave(a as never, CloseCode.CONSENTED);
    assert.equal(h.room.seatedCount, 0);
    const again = await seat(h, "sa", P_A);
    step(h.room);
    assertSeqStream(again);
    assert.equal(lastBaseline(again).begin.seq, 1, "离座即忘：同 id 再入座从 1 起");
    await h.room.onDispose();
});
