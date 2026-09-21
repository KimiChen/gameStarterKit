/**
 * WorldRoomTransport（MMO MF4-B7）无头单测（假 Colyseus SDK，不走真实 ws）：
 *  1. 信封：v = WORLD_ROOM_PROTOCOL_VERSION、modeVersion 取 client catalog、profile 恒 world、token / sId 取会话；strategy 归一（mapId / line）；
 *     非 world 形态 mode（snake）/ 坏 mapId / 坏 ticket 在本地 fail-fast（⛔ 不上路）；
 *  2. join → client.joinOrCreate(RoomName.World, options)、auth.token 同步；SDK 离线队列被禁；在途 / 已持有时再 join 拒；
 *  3. 出站：只放行 core 与本 mode 的 C2S、payload exact 校验、掉线期间拒发且 ⛔ 不重放；重连后恢复；
 *  4. 入站：非法 S2C 帧丢弃、合法帧到回调；
 *  5. 离开分类：CONSENTED / WITH_ERROR(drained) / KICK_CLOSE_CODE[Replaced](replaced) / 其它(dropped)；主动 leave 后 current=false 且可再次 join。
 * 变异验证：send 删 owner 闸 → 「他 mode 消息拒发」转红；onDrop 不置 dropping → 「掉线拒发」转红；buildWorldJoinOptions 不校验 → 「坏 ticket 本地拒」转红。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { getToken, setToken } from "../src/core/http";
import { discoverServerEndpoints, setServerList } from "../src/net/serverSession";
import {
  C2S,
  ForceLogoutReason,
  GAMEPLAY_CATALOG,
  KICK_CLOSE_CODE,
  RoomName,
  S2C,
  WORLD_ROOM_PROTOCOL_VERSION,
  wireChecksum,
  type IWorldFixtureEnter,
  type IWorldFixtureEntityWire,
  type IWorldFixtureLeave,
  type IWorldFixtureUpdate,
} from "../src/shared/index";
import { ObserverReconciler } from "../src/logic/rooms/observer/ObserverReconciler";
import { normalizeWorldRoomStrategy, worldRoomModeVersion } from "../src/net/rooms/matchmaking";
import {
  SDK_CLOSE_CODE,
  WorldRoomTransport,
  buildWorldJoinOptions,
  worldLeaveKindOf,
  type WorldJoinRequest,
  type WorldRoomSdkClient,
} from "../src/net/rooms/WorldRoomTransport";

type Handler = (...values: unknown[]) => void;

function makeFakeRoom(name: string) {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ type: string; data: unknown }> = [];
  const callbacks: { drop?: Handler; reconnect?: Handler; leave?: Handler; error?: Handler } = {};
  const reconnection = { enabled: true, maxEnqueuedMessages: 10, enqueuedMessages: [] as Array<{ data: unknown }> };
  let connectionOpen = true;
  let leaveCalls = 0;
  let removeAllCalls = 0;
  const room = {
    roomId: name,
    sessionId: `${name}-session`,
    reconnection,
    connection: { get isOpen() { return connectionOpen; } },
    onDrop(cb: Handler) { callbacks.drop = cb; return () => {}; },
    onReconnect(cb: Handler) { callbacks.reconnect = cb; return () => {}; },
    onLeave(cb: Handler) { callbacks.leave = cb; return () => {}; },
    onError(cb: Handler) { callbacks.error = cb; return () => {}; },
    onMessage(type: string, cb: Handler) { handlers.set(type, cb); return () => { handlers.delete(type); }; },
    send(type: string, data: unknown) {
      if (connectionOpen) { sent.push({ type, data }); return; }
      reconnection.enqueuedMessages.push({ data: { type, data } });
    },
    leave() { leaveCalls++; return Promise.resolve(true); },
    removeAllListeners() { removeAllCalls++; },
  };
  return {
    room,
    sent,
    callbacks,
    emit(type: string, value: unknown) { handlers.get(type)?.(value); },
    setConnectionOpen(open: boolean) { connectionOpen = open; },
    get leaveCalls() { return leaveCalls; },
    get removeAllCalls() { return removeAllCalls; },
    get queued() { return reconnection.enqueuedMessages.length; },
  };
}

function makeClient(rooms: Array<ReturnType<typeof makeFakeRoom>>) {
  const calls: Array<{ roomName: string; options: unknown }> = [];
  const client: WorldRoomSdkClient = {
    auth: { token: "" },
    joinOrCreate: async (roomName, options) => {
      calls.push({ roomName, options });
      const next = rooms.shift();
      if (!next) throw new Error("no fake room");
      return next.room as never;
    },
  };
  return { client, calls };
}

const PERSONA = "p_alice_0000000001";
const TICKET = "t".repeat(32);
const request = (overrides: Partial<WorldJoinRequest> = {}): WorldJoinRequest =>
  ({ mode: "worldFixture", strategy: { mapId: "m1" }, personaId: PERSONA, ticket: TICKET, ...overrides });
const deps = { token: () => "opaque-token", sId: () => 3 };

test("PS2生产装配：首次world.enter空endpoint连worldWs，显式节点优先，随后空值仍回到发现的world", async () => {
  const row = { serverId: 3, name: "区3", status: "smooth" as const, tag: "normal" as const, openTime: 1,
    gameHttpUrl: "https://http.example", gameWsUrl: "wss://directory.example" };
  setServerList({ hash: "world-endpoints", isOps: false, myServerIds: [], servers: [row] });
  await discoverServerEndpoints(row, async () => ({ name: "game-server", gameRoomProtocol: 8, lobbyProtocol: 1,
    lobbyWs: "wss://lobby.example", gameWs: "wss://game.example", worldWs: "wss://world.example" }));
  const previousSdk = (globalThis as { Colyseus?: unknown }).Colyseus;
  const previousToken = getToken();
  const clients = new Map<string, ReturnType<typeof makeClient>>();
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: function (endpoint: string) {
      const fake = makeClient([makeFakeRoom(`${endpoint}-1`), makeFakeRoom(`${endpoint}-2`)]);
      clients.set(endpoint, fake); return fake.client;
    },
  };
  let transport: WorldRoomTransport | undefined;
  try {
    setToken("opaque-token"); transport = WorldRoomTransport.forCurrentServer();
    const ready = { transferId: null, mapId: "m1", line: 0, endpoint: "", ticket: TICKET };
    const first = await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready });
    assert.deepEqual([...clients.keys()], ["wss://world.example"]);
    assert.equal(clients.get("wss://world.example")?.calls[0].roomName, RoomName.World);
    await first.leave();
    const remote = await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready: { ...ready, endpoint: "wss://world-node.example" } });
    assert.equal(clients.get("wss://world-node.example")?.calls.length, 1);
    await remote.leave();
    await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready });
    assert.equal(clients.get("wss://world.example")?.calls.length, 2, "空endpoint须回到world默认，不能沿用别的world节点或game端点");
  } finally {
    await transport?.active?.leave();
    setToken(previousToken); (globalThis as { Colyseus?: unknown }).Colyseus = previousSdk;
    setServerList({ hash: "reset", isOps: false, myServerIds: [], servers: [] });
  }
});

test("信封：v / modeVersion / profile / token / sId 单源注入；strategy 归一；非 world mode、坏 mapId、坏 ticket 本地 fail-fast", () => {
  const options = buildWorldJoinOptions(request({ strategy: { mapId: "m1", line: 2 }, resumeSeq: 9 }), deps);
  assert.deepEqual(options, {
    v: WORLD_ROOM_PROTOCOL_VERSION, token: "opaque-token", sId: 3, mode: "worldFixture",
    modeVersion: GAMEPLAY_CATALOG.worldFixture.modeVersion, profile: "world", mapId: "m1", line: 2, personaId: PERSONA, ticket: TICKET, resumeSeq: 9,
  });
  assert.ok(!("line" in buildWorldJoinOptions(request(), deps)), "缺 line 不带键（服务端分配）");
  assert.deepEqual(normalizeWorldRoomStrategy({ kind: "world", mapId: "m1" }), { kind: "world", mapId: "m1" });
  assert.throws(() => normalizeWorldRoomStrategy({ kind: "join-or-create", roomName: "game" }), /kind 必须是 "world"/u);
  assert.throws(() => normalizeWorldRoomStrategy({ kind: "world", mapId: "bad map" }), /mapId/u);
  assert.throws(() => normalizeWorldRoomStrategy({ kind: "world", mapId: "m1", line: 70_000 }), /line/u);
  assert.equal(worldRoomModeVersion("worldFixture"), GAMEPLAY_CATALOG.worldFixture.modeVersion);
  assert.throws(() => worldRoomModeVersion("snake"), /不是 world 形态/u, "match 形态玩法 ⛔ 不能进世界房");
  assert.throws(() => buildWorldJoinOptions(request({ mode: "snake" }), deps), /不是 world 形态/u);
  assert.throws(() => buildWorldJoinOptions(request({ ticket: "short" }), deps), "ticket 形状本地拒");
  assert.throws(() => buildWorldJoinOptions(request({ personaId: "x" }), deps), "personaId 形状本地拒");
});

test("join：joinOrCreate(RoomName.World, 信封)、auth.token 同步、SDK 离线队列禁用；在途 / 已持有再 join 拒；leave 后可再进", async () => {
  const fakeA = makeFakeRoom("wa");
  const fakeB = makeFakeRoom("wb");
  const { client, calls } = makeClient([fakeA, fakeB]);
  const transport = new WorldRoomTransport({ client: () => client, ...deps });
  const handle = await transport.join(request());
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.roomName, RoomName.World);
  assert.equal((calls[0]!.options as { profile: string }).profile, "world");
  assert.equal(client.auth.token, "opaque-token");
  assert.equal(fakeA.room.reconnection.maxEnqueuedMessages, 0, "SDK 离线队列已禁");
  assert.deepEqual([handle.kind, handle.mode, handle.mapId, handle.line, handle.roomId, handle.current], ["world-room", "worldFixture", "m1", null, "wa", true]);
  assert.equal(transport.active, handle);
  await assert.rejects(transport.join(request()), /先 leave/u, "已持有世界房再 join 拒");
  await handle.leave();
  assert.equal(handle.left, true);
  assert.equal(handle.current, false);
  assert.equal(transport.active, null);
  assert.equal(fakeA.leaveCalls, 1);
  assert.equal(fakeA.removeAllCalls, 1);
  const second = await transport.join(request({ strategy: { mapId: "m2" } }));
  assert.equal(second.roomId, "wb");
  assert.equal(second.mapId, "m2");
});

test("出站：只放行 core 与本 mode 的 C2S、payload exact 校验、掉线期间拒发且 ⛔ 不重放、重连后恢复；入站非法帧丢弃", async () => {
  const fake = makeFakeRoom("wc");
  const { client } = makeClient([fake]);
  const transport = new WorldRoomTransport({ client: () => client, ...deps });
  const handle = await transport.join(request());
  assert.equal(handle.send(C2S.WorldFixtureMove, { dirX: 1, dirY: 0, seq: 1 }), true);
  assert.equal(handle.send(C2S.Ping, { clientTime: 1 }), true, "core 心跳放行");
  assert.equal(handle.send(C2S.Move, { dirX: 1, dirY: 0 }), false, "他 mode（ballMove）消息拒发");
  assert.equal(handle.send(C2S.WorldFixtureMove, { dirX: 2, dirY: 0, seq: 1 } as never), false, "坏 payload 本地拒");
  assert.deepEqual(fake.sent.map((entry) => entry.type), [C2S.WorldFixtureMove, C2S.Ping]);
  // 掉线：拒发、不入 SDK 队列
  fake.setConnectionOpen(false);
  fake.callbacks.drop?.(1006, "abnormal");
  assert.equal(handle.dropping, true);
  assert.equal(handle.current, false);
  assert.equal(handle.send(C2S.WorldFixtureMove, { dirX: 0, dirY: 1, seq: 2 }), false, "掉线拒发");
  assert.equal(fake.queued, 0, "⛔ 不进 SDK 离线队列（重连不重放）");
  fake.setConnectionOpen(true);
  fake.callbacks.reconnect?.();
  assert.equal(handle.current, true);
  assert.equal(handle.send(C2S.WorldFixtureMove, { dirX: 0, dirY: 1, seq: 3 }), true, "重连后恢复");
  assert.equal(fake.sent.length, 3);
  // 入站
  const received: unknown[] = [];
  const off = handle.onMessage(S2C.WorldFixturePos, (payload) => { received.push(payload); });
  fake.emit(S2C.WorldFixturePos, { entityId: "mover-1", x: 1, y: 2, seq: 3, tick: 4 });
  fake.emit(S2C.WorldFixturePos, { entityId: "mover-1", x: -1, y: 2, seq: 3, tick: 4 });
  fake.emit(S2C.WorldFixturePos, { entityId: "mover-1", x: 1, y: 2, seq: 3, tick: 4, extra: true });
  assert.deepEqual(received, [{ entityId: "mover-1", x: 1, y: 2, seq: 3, tick: 4 }], "非法帧丢弃");
  off();
  fake.emit(S2C.WorldFixturePos, { entityId: "mover-1", x: 5, y: 5, seq: 4, tick: 5 });
  assert.equal(received.length, 1, "解绑后不再收到");
});

test("离开分类：consented / drained（WITH_ERROR）/ replaced（顶号关闭码）/ dropped；服务端关闭后 handle 失效且 transport 释放", async () => {
  assert.equal(worldLeaveKindOf(SDK_CLOSE_CODE.CONSENTED), "consented");
  assert.equal(worldLeaveKindOf(SDK_CLOSE_CODE.WITH_ERROR), "drained");
  assert.equal(worldLeaveKindOf(KICK_CLOSE_CODE[ForceLogoutReason.Replaced]), "replaced");
  assert.equal(worldLeaveKindOf(1006), "dropped");
  assert.equal(worldLeaveKindOf(undefined), "dropped");
  const fake = makeFakeRoom("wd");
  const { client } = makeClient([fake]);
  const transport = new WorldRoomTransport({ client: () => client, ...deps });
  const handle = await transport.join(request());
  const seen: Array<[string, number | undefined]> = [];
  handle.onLeave((kind, code) => { seen.push([kind, code]); });
  fake.callbacks.leave?.(SDK_CLOSE_CODE.WITH_ERROR, "draining");
  assert.deepEqual(seen, [["drained", SDK_CLOSE_CODE.WITH_ERROR]]);
  assert.equal(handle.left, true);
  assert.equal(handle.current, false);
  assert.equal(transport.active, null, "服务端关闭 ⇒ transport 释放持有");
  assert.equal(handle.send(C2S.Ping, { clientTime: 1 }), false, "已离开拒发");
  await handle.leave();
  assert.equal(fake.leaveCalls, 0, "已离开的 handle 不再调 SDK leave");
  assert.equal(seen.length, 1, "onLeave 恰一次");
});

test("bindObserverStream（MF5b-B2）：worldFixture 六个 perSession S2C 经 wire 校验绑到 ObserverReconciler；私有流走 onMessage；解绑后不再投递；非法帧丢弃", async () => {
  const fake = makeFakeRoom("we");
  const { client } = makeClient([fake]);
  const transport = new WorldRoomTransport({ client: () => client, ...deps });
  const handle = await transport.join(request());
  const reconciler = new ObserverReconciler<IWorldFixtureEntityWire, IWorldFixtureEnter, IWorldFixtureUpdate, IWorldFixtureLeave>({
    entityOfItem: (item) => item as IWorldFixtureEntityWire,
    entityOfEnter: (payload) => payload.entity,
    entityOfUpdate: (previous, payload) => ({ id: payload.id, kind: previous?.kind ?? "static", x: payload.x, y: payload.y, rev: payload.rev }),
    idOfLeave: (payload) => payload.id,
  });
  const log: string[] = [];
  const off = handle.bindObserverStream({
    enter: S2C.WorldFixtureEnter, update: S2C.WorldFixtureUpdate, leave: S2C.WorldFixtureLeave,
    baselineBegin: S2C.WorldFixtureBaselineBegin, baselineChunk: S2C.WorldFixtureBaselineChunk, baselineEnd: S2C.WorldFixtureBaselineEnd,
  }, {
    enter: (p) => log.push(`enter:${reconciler.acceptEnter(p as IWorldFixtureEnter)}`),
    update: (p) => log.push(`update:${reconciler.acceptUpdate(p as IWorldFixtureUpdate)}`),
    leave: (p) => log.push(`leave:${reconciler.acceptLeave(p as IWorldFixtureLeave)}`),
    baselineBegin: (p) => log.push(`begin:${reconciler.acceptBaselineBegin(p as never)}`),
    baselineChunk: (p) => log.push(`chunk:${reconciler.acceptBaselineChunk(p as never)}`),
    baselineEnd: (p) => log.push(`end:${reconciler.acceptBaselineEnd(p as never)}`),
  });
  const privates: unknown[] = [];
  // 私有流与视野流共用单 seq 流：私有流也要喂给 reconciler 的 cursor（否则 enter 看到 seq 空洞 ⇒ resync）
  const offPrivate = handle.onMessage(S2C.WorldFixturePrivate, (payload) => { privates.push(payload); reconciler.acceptPrivate(payload); });
  const items: IWorldFixtureEntityWire[] = [{ id: "mover-a", kind: "mover", x: 500, y: 500, rev: 0 }, { id: "static-0", kind: "static", x: 520, y: 520, rev: 0 }];
  fake.emit(S2C.WorldFixtureBaselineBegin, { baselineId: "wi_1#1:baseline:s:1", seq: 1, tick: 3, chunkCount: 1, itemCount: 2 });
  fake.emit(S2C.WorldFixtureBaselineChunk, { baselineId: "wi_1#1:baseline:s:1", seq: 1, index: 0, items });
  fake.emit(S2C.WorldFixtureBaselineEnd, { baselineId: "wi_1#1:baseline:s:1", seq: 1, checksum: wireChecksum(items) });
  fake.emit(S2C.WorldFixturePrivate, { seq: 2, tick: 3, id: "mover-a", stamina: 100 });
  fake.emit(S2C.WorldFixtureEnter, { seq: 3, tick: 4, entity: { id: "mover-b", kind: "mover", x: 560, y: 560, rev: 2 } });
  fake.emit(S2C.WorldFixtureUpdate, { seq: 4, tick: 5, id: "mover-b", x: 562, y: 560, rev: 3 });
  fake.emit(S2C.WorldFixtureUpdate, { seq: 5, tick: 5, id: "mover-b", x: -1, y: 560, rev: 3 }); // 非法帧：丢弃
  fake.emit(S2C.WorldFixtureLeave, { seq: 5, tick: 6, id: "static-0" });
  assert.deepEqual(log, ["begin:applied", "chunk:applied", "end:applied", "enter:applied", "update:applied", "leave:applied"]);
  assert.deepEqual([...reconciler.snapshot().keys()].sort(), ["mover-a", "mover-b"]);
  assert.equal(reconciler.snapshot().get("mover-b")?.x, 562);
  assert.deepEqual(privates, [{ seq: 2, tick: 3, id: "mover-a", stamina: 100 }], "私有流走 onMessage");
  off();
  offPrivate();
  fake.emit(S2C.WorldFixtureEnter, { seq: 6, tick: 7, entity: { id: "mover-c", kind: "mover", x: 1, y: 1, rev: 0 } });
  assert.equal(log.length, 6, "解绑后不再投递");
});

// ── MMO MF8-B5：交接 strategy + transport.transfer（退源房 → 带凭据 join 目标 → 可换 endpoint）────────────────────────────

test("交接（MF8-B5）：transfer strategy 归一与信封（transferId 不上路）；transfer() 先退源房再带凭据 join 目标；endpoint 非空换 client；在途拒", async () => {
  assert.deepEqual(normalizeWorldRoomStrategy({ kind: "transfer", transferId: "wt_1", mapId: "m2", line: 1 }), { kind: "transfer", transferId: "wt_1", mapId: "m2", line: 1 });
  assert.deepEqual(normalizeWorldRoomStrategy({ kind: "transfer", transferId: "wt_1", mapId: "m2" }), { kind: "transfer", transferId: "wt_1", mapId: "m2" });
  assert.throws(() => normalizeWorldRoomStrategy({ kind: "transfer", mapId: "m2" }), /transferId/u);
  assert.throws(() => normalizeWorldRoomStrategy({ kind: "transfer", transferId: "bad id", mapId: "m2" }), /transferId/u);
  const options = buildWorldJoinOptions(request({ strategy: { kind: "transfer", transferId: "wt_1", mapId: "m2" }, ticket: "u".repeat(32) }), deps);
  assert.deepEqual([options.mapId, "line" in options, options.ticket, "transferId" in options], ["m2", false, "u".repeat(32), false], "信封只带目标分线 + 凭据");

  const src = makeFakeRoom("src");
  const dst = makeFakeRoom("dst");
  const far = makeFakeRoom("far");
  const main = makeClient([src, dst]);
  const remote = makeClient([far]);
  const endpoints: string[] = [];
  const transport = new WorldRoomTransport({ client: () => main.client, clientFor: (endpoint) => { endpoints.push(endpoint); return remote.client; }, ...deps });
  const source = await transport.join(request());
  assert.equal(source.transferId, null);
  const handle = await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready: { transferId: "wt_1", mapId: "m2", line: 0, endpoint: "", ticket: "u".repeat(32) } });
  assert.equal(src.leaveCalls, 1, "先退源房");
  assert.equal(source.left, true);
  assert.equal(main.calls.length, 2, "同 endpoint 沿用当前 client");
  const target = main.calls[1]!.options as { mapId: string; line: number; ticket: string; personaId: string };
  assert.deepEqual([target.mapId, target.line, target.ticket, target.personaId], ["m2", 0, "u".repeat(32), PERSONA]);
  assert.deepEqual([handle.mapId, handle.line, handle.transferId, handle.current, handle.roomId], ["m2", 0, "wt_1", true, "dst"]);
  assert.equal(transport.active, handle);
  assert.deepEqual(endpoints, [], "endpoint 空串 ⇒ 不换 client");
  // 跨 world 进程：endpoint 非空 ⇒ clientFor；上一句柄退出
  const handle2 = await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready: { transferId: "wt_2", mapId: "m3", line: 2, endpoint: "wss://world.example.com", ticket: "v".repeat(32) } });
  assert.deepEqual(endpoints, ["wss://world.example.com"]);
  assert.equal(remote.calls.length, 1);
  assert.equal((remote.calls[0]!.options as { mapId: string }).mapId, "m3");
  assert.deepEqual([handle.left, handle2.transferId, handle2.line, transport.active === handle2], [true, "wt_2", 2, true]);
  // enter 未解析到交接（transferId null）⇒ 普通进入信封
  await handle2.leave();
  const plain = makeFakeRoom("plain");
  main.client.joinOrCreate = async (roomName, opts) => { main.calls.push({ roomName, options: opts }); return plain.room as never; };
  const handle3 = await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready: { transferId: null, mapId: "m1", line: 0, endpoint: "", ticket: "w".repeat(32) } });
  assert.deepEqual([handle3.transferId, handle3.mapId], [null, "m1"]);
  // 在途拒：joinOrCreate 挂起时 transfer 抛
  let release: ((room: unknown) => void) | null = null;
  const pending = makeFakeRoom("pending");
  await handle3.leave();
  main.client.joinOrCreate = () => new Promise((resolve) => { release = resolve as (room: unknown) => void; });
  const joining = transport.join(request());
  await assert.rejects(transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready: { transferId: "wt_3", mapId: "m2", line: 0, endpoint: "", ticket: "x".repeat(32) } }), /正在进入/u);
  release!(pending.room);
  await joining;
});

test("MF11 R2-02：退源房 LEAVE 无回执（半开连接）⇒ 有界等待后照常进目标房", async () => {
  const stuck = makeFakeRoom("stuck");
  stuck.room.leave = () => new Promise<boolean>(() => { /* 永不回执 */ });
  const dst = makeFakeRoom("dst");
  const main = makeClient([stuck, dst]);
  const transport = new WorldRoomTransport({ client: () => main.client, leaveTimeoutMs: 50, ...deps });
  const source = await transport.join(request());
  const started = Date.now();
  const handle = await transport.transfer({ mode: "worldFixture", personaId: PERSONA, ready: { transferId: "wt_9", mapId: "m2", line: 0, endpoint: "", ticket: "u".repeat(32) } });
  assert.ok(Date.now() - started < 2_000, "不被卡死");
  assert.deepEqual([handle.mapId, handle.transferId, transport.active === handle], ["m2", "wt_9", true]);
  assert.equal(source.left, true, "本地收尾（finish）不等回执");
});
