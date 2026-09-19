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
import {
  C2S,
  ForceLogoutReason,
  GAMEPLAY_CATALOG,
  KICK_CLOSE_CODE,
  RoomName,
  S2C,
  WORLD_ROOM_PROTOCOL_VERSION,
} from "../src/shared/index";
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
