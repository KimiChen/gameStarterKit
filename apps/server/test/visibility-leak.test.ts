/**
 * MMO MF5a-B5 观察者同步·GameRoom 消费路径（docs/MMO.md §4.3 / §5.4 MF5a 退出条件；SQL 视图房夹具 viewFixture + 内存真源）：
 *  - 超视距两会话互不收到；私有字段只到本人、⛔ 不进 enter / update / baseline；
 *  - 跨格 enter / leave 各恰一次、update 按 rev；同一会话单 seq 流（distinct seq 连续）；
 *  - 重连 / 客户端 resync ⇒ 只含兴趣集的 baseline，checksum 通过；
 *  - 慢会话（一 tick 超上界）：可合并类被丢、回执不丢、下一 tick 整体重同步；
 *  - 满员第二房各自从真源恢复投影；空房销毁重建从真源重来。
 * 变异验证：mode 把私有字段塞进 enter 投影 → 「零泄露」转红；GameRoom 删 flushObservers → 全部转红；删重连 requestBaseline → 「重连 baseline」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
    C2S, ErrorCode, GAME_ROOM_PROTOCOL_VERSION, GAMEPLAY_CATALOG, GamePhase, S2C, wireChecksum,
    type IGameRoomJoinOptions, type IViewFixtureBaselineBegin, type IViewFixtureBaselineChunk, type IViewFixtureBaselineEnd,
    type IViewFixtureEnter, type IViewFixtureEntityWire, type IViewFixtureLeave, type IViewFixturePrivate, type IViewFixtureUpdate,
} from "@game/shared";
import { GameRoom } from "../src/rooms/GameRoom";
import { resolveRoomProfile } from "../src/rooms/core/RoomProfile";
import { MemoryViewSource, VIEW_FIXTURE_MODE_ID, createViewFixtureMode, type ViewFixtureModeOptions, type ViewRow } from "./fixtures/viewFixtureMode";

type SentMessage = readonly [string, unknown];
type FakeClient = {
    sessionId: string;
    auth: { userId: string; sId: number; mode: string; profile: string };
    sent: SentMessage[];
    send(type: string, payload: unknown): void;
};
function client(sessionId: string, userId = `u-${sessionId}`): FakeClient {
    const sent: SentMessage[] = [];
    return { sessionId, auth: { userId, sId: 0, mode: VIEW_FIXTURE_MODE_ID, profile: "dropIn" }, sent, send(type, payload) { sent.push([type, payload]); } };
}
const joinOptions = (): IGameRoomJoinOptions =>
    ({ v: GAME_ROOM_PROTOCOL_VERSION, sId: 0, mode: VIEW_FIXTURE_MODE_ID, modeVersion: GAMEPLAY_CATALOG.viewFixture.modeVersion, profile: "dropIn" });

const row = (id: string, x: number, y: number, ownerUid: string | null = null, note = ""): ViewRow => ({ id, x, y, rev: 0, ownerUid, note, noteRev: 0 });
const WORLD = (): MemoryViewSource => new MemoryViewSource([
    row("e1", 10, 10, "u-a", "secret-a"),
    row("e2", 900, 900, "u-b", "secret-b"),
    row("e3", 500, 500),
    row("e4", 30, 30),
]);

async function buildRoom(options: Omit<ViewFixtureModeOptions, "source"> & { readonly source: MemoryViewSource }, roomId = "view-room"): Promise<GameRoom> {
    const mode = createViewFixtureMode(options);
    const room = new GameRoom({ seed: 7, clock: () => 0, fixedStepMs: 50, mode, profile: resolveRoomProfile(VIEW_FIXTURE_MODE_ID, "dropIn") });
    const internals = room as unknown as { setSimulationInterval(cb: () => void, delay: number): void; lock(): Promise<void>; unlock(): Promise<void>; roomId: string };
    internals.setSimulationInterval = () => undefined;
    internals.lock = async () => undefined;
    internals.unlock = async () => undefined;
    internals.roomId = roomId;
    await room.onCreate(joinOptions());
    return room;
}
async function seat(room: GameRoom, sessionId: string): Promise<FakeClient> {
    const joiner = client(sessionId);
    (room.clients as unknown as FakeClient[]).push(joiner);
    await room.onJoin(joiner as never, joinOptions());
    return joiner;
}
function dispatch(room: GameRoom, type: string, sender: FakeClient, payload: unknown): void {
    (room.messages as unknown as { _: (c: unknown, t: string, p: unknown) => void })._(sender, type, payload);
}
function step(room: GameRoom, count = 1): void {
    for (let index = 0; index < count; index += 1) room.stepFixed();
}
function messages<T>(who: FakeClient, type: string): T[] {
    return who.sent.filter(([candidate]) => candidate === type).map(([, payload]) => payload as T);
}
const perSession = (who: FakeClient): SentMessage[] => who.sent.filter(([type]) => type.startsWith("s2c.viewFixture."));
/** 单 seq 流：每条 enter / update / leave / private 一个号，baseline 三件共用一个号 ⇒ distinct seq 必须从 1 起连续。 */
function assertSeqStream(who: FakeClient): void {
    const seqs = perSession(who).map(([, payload]) => (payload as { seq: number }).seq);
    const distinct = [...new Set(seqs)];
    assert.deepEqual(distinct, distinct.map((_, index) => index + 1), `seq 流必须连续：${JSON.stringify(seqs)}`);
    for (let index = 1; index < seqs.length; index += 1) assert.ok(seqs[index]! >= seqs[index - 1]!, "seq 单调不减");
}
/** 最近一次 baseline（Begin → Chunk* → End）拼出的条目，并校验 checksum / 计数。 */
function lastBaseline(who: FakeClient): { readonly items: IViewFixtureEntityWire[]; readonly begin: IViewFixtureBaselineBegin } {
    const begins = messages<IViewFixtureBaselineBegin>(who, S2C.ViewFixtureBaselineBegin);
    const begin = begins[begins.length - 1];
    assert.ok(begin, "应有 baseline");
    const chunks = messages<IViewFixtureBaselineChunk>(who, S2C.ViewFixtureBaselineChunk).filter((chunk) => chunk.baselineId === begin.baselineId);
    const end = messages<IViewFixtureBaselineEnd>(who, S2C.ViewFixtureBaselineEnd).find((candidate) => candidate.baselineId === begin.baselineId);
    assert.ok(end, "baseline 必须以 End 收尾");
    assert.equal(chunks.length, begin.chunkCount);
    const items = chunks.sort((left, right) => left.index - right.index).flatMap((chunk) => chunk.items);
    assert.equal(items.length, begin.itemCount);
    assert.equal(wireChecksum(items), end.checksum, "客户端按 canonical FNV-1a 复算 checksum 必须通过");
    assert.equal(end.seq, begin.seq);
    return { items, begin };
}

test("超视距两会话互不收到；私有字段只到本人且 ⛔ 不进 enter / update / baseline", async () => {
    const source = WORLD();
    const room = await buildRoom({ source });
    const a = await seat(room, "a");
    step(room);
    assert.equal(room.state.phase, GamePhase.Playing);
    assert.deepEqual(lastBaseline(a).items.map((item) => item.id), ["e1", "e4"], "首发 baseline 只含 a 的兴趣集");
    assert.deepEqual(messages<IViewFixturePrivate>(a, S2C.ViewFixturePrivate).map((p) => [p.id, p.note]), [["e1", "secret-a"]]);

    const b = await seat(room, "b");
    dispatch(room, C2S.ViewFixtureLook, b, { x: 900, y: 900 });
    step(room);
    assert.deepEqual(lastBaseline(b).items.map((item) => item.id), ["e2"]);
    assert.deepEqual(messages<IViewFixturePrivate>(b, S2C.ViewFixturePrivate).map((p) => [p.id, p.note]), [["e2", "secret-b"]]);
    step(room, 3);

    const aText = JSON.stringify(a.sent);
    const bText = JSON.stringify(b.sent);
    // ⚠ id 必须带引号匹配：随机 matchId / baselineId 的十六进制里可能恰好含 "e2"
    assert.doesNotMatch(aText, /"e2"|secret-b/u, "a 收不到 b 视野的实体与 b 的私有字段");
    assert.doesNotMatch(bText, /"e1"|"e4"|secret-a/u, "b 收不到 a 视野的实体与 a 的私有字段");
    for (const [type, payload] of [...a.sent, ...b.sent]) {
        if (type === S2C.ViewFixturePrivate) continue;
        assert.doesNotMatch(JSON.stringify(payload), /note|secret/u, `${type} 不得携带私有字段`);
    }
    assertSeqStream(a);
    assertSeqStream(b);
    await room.onDispose();
});

test("跨格：enter / leave 各恰一次、update 按 rev、无变化不投递；单 seq 流连续", async () => {
    const source = WORLD();
    const room = await buildRoom({ source });
    const a = await seat(room, "a");
    const b = await seat(room, "b");
    dispatch(room, C2S.ViewFixtureLook, b, { x: 900, y: 900 });
    step(room);
    const aBefore = a.sent.length;
    step(room, 2);
    assert.equal(a.sent.length, aBefore, "无变化 ⛔ 不投递");

    source.move("e3", 50, 50);
    step(room);
    assert.deepEqual(messages<IViewFixtureEnter>(a, S2C.ViewFixtureEnter).map((m) => [m.entity.id, m.entity.rev]), [["e3", 1]], "进入 a 视野：enter 恰一次");
    source.move("e3", 60, 60);
    step(room);
    assert.deepEqual(messages<IViewFixtureUpdate>(a, S2C.ViewFixtureUpdate).map((m) => [m.id, m.x, m.rev]), [["e3", 60, 2]], "rev 前进：update 恰一次");
    source.move("e3", 950, 950);
    step(room);
    assert.deepEqual(messages<IViewFixtureLeave>(a, S2C.ViewFixtureLeave).map((m) => m.id), ["e3"], "离开 a 视野：leave 恰一次");
    assert.deepEqual(messages<IViewFixtureEnter>(b, S2C.ViewFixtureEnter).map((m) => m.entity.id), ["e3"], "同 tick 进入 b 视野：enter 恰一次");
    step(room, 2);
    assert.equal(messages<IViewFixtureLeave>(a, S2C.ViewFixtureLeave).length, 1);
    assert.equal(messages<IViewFixtureEnter>(b, S2C.ViewFixtureEnter).length, 1);
    assertSeqStream(a);
    assertSeqStream(b);
    await room.onDispose();
});

test("重连与客户端 resync ⇒ 只含兴趣集的 baseline（checksum 通过、chunk 计数一致），之后差分相对 baseline 续接", async () => {
    const source = WORLD();
    const room = await buildRoom({ source });
    const a = await seat(room, "a");
    step(room);
    source.move("e3", 50, 50);
    step(room);
    assert.equal(messages<IViewFixtureBaselineBegin>(a, S2C.ViewFixtureBaselineBegin).length, 1);

    // 非主动断线进入宽限 → 重连成功 ⇒ 下一 tick 只发 baseline（⛔ 不重放一串 enter）
    let release!: () => void;
    (room as unknown as { allowReconnection(): Promise<void> }).allowReconnection = () => new Promise<void>((resolve) => { release = resolve; });
    const leaving = room.onLeave(a as never, 4001);
    await Promise.resolve();
    release();
    await leaving;
    const enterCountBefore = messages<IViewFixtureEnter>(a, S2C.ViewFixtureEnter).length;
    step(room);
    assert.equal(messages<IViewFixtureBaselineBegin>(a, S2C.ViewFixtureBaselineBegin).length, 2, "重连后一次 baseline");
    const reconnect = lastBaseline(a);
    assert.deepEqual(reconnect.items.map((item) => item.id), ["e1", "e3", "e4"], "只含当前兴趣集");
    assert.equal(reconnect.begin.chunkCount, 2, "chunkItems=2 ⇒ 3 条目分 2 块");
    assert.equal(messages<IViewFixtureEnter>(a, S2C.ViewFixtureEnter).length, enterCountBefore, "重连 ⛔ 不重放 enter");

    // 客户端主动 resync（c2s）⇒ 再一次 baseline；随后的差分相对它续接
    dispatch(room, C2S.ViewFixtureResync, a, {});
    step(room);
    assert.equal(messages<IViewFixtureBaselineBegin>(a, S2C.ViewFixtureBaselineBegin).length, 3);
    source.move("e3", 55, 55);
    step(room);
    const updates = messages<IViewFixtureUpdate>(a, S2C.ViewFixtureUpdate);
    assert.deepEqual(updates[updates.length - 1]?.id, "e3");
    assertSeqStream(a);
    await room.onDispose();
});

test("慢会话：一 tick 超上界 ⇒ 可合并类被丢、回执不丢、下一 tick 整体重同步（baseline 全量 + checksum）", async () => {
    const source = new MemoryViewSource([
        row("p1", 10, 10, "u-a", "receipt-0"),
        ...Array.from({ length: 8 }, (_, index) => row(`q${index + 2}`, 20 + index, 20 + index)),
    ]);
    // 上界 8：baseline = Begin + 5 块 + End = 7 条不超限；一 tick 内 9 条 update 必超限
    const room = await buildRoom({ source, limits: { outboundQueueMaxMessages: 8 } });
    const a = await seat(room, "a");
    step(room);
    assert.equal(lastBaseline(a).items.length, 9);
    const updatesBefore = messages<IViewFixtureUpdate>(a, S2C.ViewFixtureUpdate).length;
    // 同一 tick：回执（私有流 noteRev 前进）+ 9 个实体各动一格
    source.note("p1", "receipt-1");
    for (const item of source.load()) source.move(item.id, item.x + 1, item.y);
    step(room);
    const receipts = messages<IViewFixturePrivate>(a, S2C.ViewFixturePrivate).map((p) => p.note);
    assert.deepEqual(receipts, ["receipt-0", "receipt-1"], "回执不丢");
    assert.ok(messages<IViewFixtureUpdate>(a, S2C.ViewFixtureUpdate).length - updatesBefore < 9, "超限：可合并的 update 被丢");
    assert.equal(messages<IViewFixtureBaselineBegin>(a, S2C.ViewFixtureBaselineBegin).length, 1, "超限当 tick 只打标记");
    step(room);
    assert.equal(messages<IViewFixtureBaselineBegin>(a, S2C.ViewFixtureBaselineBegin).length, 2, "下一 tick 整体重同步");
    const resync = lastBaseline(a);
    assert.equal(resync.items.length, 9);
    assert.ok(resync.items.every((item) => item.rev === 1), "baseline 是移动后的全量投影");
    // 超限丢弃的 update 带走了它们的 seq（客户端据此判失步 → 收 baseline 即复位）：流单调不减，且 baseline 的 seq 大于此前一切
    const seqs = perSession(a).map(([, payload]) => (payload as { seq: number }).seq);
    for (let index = 1; index < seqs.length; index += 1) assert.ok(seqs[index]! >= seqs[index - 1]!, "seq 单调不减");
    assert.ok(resync.begin.seq > Math.max(...seqs.filter((seq) => seq !== resync.begin.seq)), "重同步 baseline 的 seq 在流的最末");
    await room.onDispose();
});

test("满员第二房各自从真源恢复投影；空房销毁重建从真源重来", async () => {
    const source = WORLD();
    const roster = { min: 1, max: 1, autoStart: 1 };
    const room1 = await buildRoom({ source, roster }, "view-1");
    const a = await seat(room1, "a");
    step(room1);
    assert.deepEqual(lastBaseline(a).items.map((item) => item.id), ["e1", "e4"]);
    await assert.rejects(room1.onJoin(client("late") as never, joinOptions()), (error: unknown) => error instanceof Error && error.message.includes(String(ErrorCode.RoomFull)), "满员 ⇒ 第二房");

    const room2 = await buildRoom({ source, roster }, "view-2");
    const b = await seat(room2, "b");
    dispatch(room2, C2S.ViewFixtureLook, b, { x: 900, y: 900 });
    step(room2);
    assert.deepEqual(lastBaseline(b).items.map((item) => item.id), ["e2"], "第二房独立从真源恢复投影与兴趣集");

    await room1.onLeave(a as never, 4000);
    await room1.onDispose();
    source.move("e1", 15, 15);
    const room3 = await buildRoom({ source, roster }, "view-3");
    const a2 = await seat(room3, "a2");
    step(room3);
    assert.deepEqual(lastBaseline(a2).items.map((item) => [item.id, item.x, item.rev]), [["e1", 15, 1], ["e4", 30, 0]], "重建的房从真源拿到最新投影");
    await room2.onDispose();
    await room3.onDispose();
});
