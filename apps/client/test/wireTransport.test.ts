/**
 * Transport wire-contract tests. These use tiny Colyseus doubles so malformed
 * packets can be injected directly at the client boundary without a websocket.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  C2S,
  GamePhase,
  LOBBY_MSG_PUSH,
  LOBBY_MSG_RPC,
  LobbyPush,
  S2C,
  UserRpc,
} from "../src/shared/index";
import { RpcError, WebSocketClient } from "../src/net/WebSocketClient";
import { RoomClient } from "../src/net/RoomClient";
import { createBallMoveRoomAdapter, createIdleRoomAdapter } from "../src/net/rooms/GameRoomTransport";
import { markFaultPoint } from "./faultMatrix";

type Handler = (...values: unknown[]) => void;

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makeLobbyRoom() {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ type: string; data: unknown }> = [];
  let leaveCalls = 0;
  const room = {
    sessionId: "lobby-session",
    reconnection: { enabled: true },
    send(type: string, data: unknown) { sent.push({ type, data }); },
    onMessage(type: string, callback: Handler) {
      handlers.set(type, callback);
      return () => { if (handlers.get(type) === callback) handlers.delete(type); };
    },
    onStateChange(callback: () => void) { callback(); return () => {}; },
    onDrop(_callback: () => void) { return () => {}; },
    onReconnect(_callback: () => void) { return () => {}; },
    onLeave(_callback: (code?: number) => void) { return () => {}; },
    leave: async () => { leaveCalls++; return true; },
    removeAllListeners() { handlers.clear(); },
  };
  return {
    room,
    sent,
    emit(type: string, value: unknown) { handlers.get(type)?.(value); },
    get leaveCalls() { return leaveCalls; },
  };
}

async function setupLobby(fake: ReturnType<typeof makeLobbyRoom>): Promise<WebSocketClient> {
  const client = WebSocketClient.inst as unknown as {
    client: unknown;
    endpoint: string;
  };
  await WebSocketClient.inst.leave().catch(() => {});
  client.endpoint = "http://lobby.example";
  client.client = {
    auth: { token: "" },
    joinOrCreate: async () => fake.room,
  };
  await WebSocketClient.inst.join("opaque-token");
  return WebSocketClient.inst;
}

test("WebSocketClient：RPC/push 在业务回调前做 envelope、route shape 校验", async () => {
  const fake = makeLobbyRoom();
  const client = await setupLobby(fake);
  try {
    const callbacks: unknown[] = [];
    const off = client.onPush(LobbyPush.ServerNotice, (data) => callbacks.push(data));

    // Unknown fields are rejected before a packet is sent.
    const malformedRequest = client.rpc(UserRpc.GetUserId, { extra: true } as never)
      .then(() => null, (error: unknown) => error);
    const requestError = await malformedRequest;
    assert.ok(requestError instanceof RpcError);
    assert.equal(requestError.code, "INVALID_PAYLOAD");
    assert.equal(fake.sent.length, 0, "非法 RPC request 不得跨 wire");

    const pending = client.rpc(UserRpc.GetUserId, {});
    const id = (fake.sent[0]?.data as { id: string }).id;
    // Envelope is syntactically valid, but route response has an extra key.
    fake.emit(LOBBY_MSG_RPC, { id, ok: true, data: { uid: "u1", extra: 1 } });
    const responseError = await pending.then(() => null, (error: unknown) => error);
    assert.ok(responseError instanceof RpcError);
    assert.equal(responseError.code, "INVALID_PAYLOAD");

    // A malformed reply with a usable id rejects that exact pending request;
    // a malformed unknown-id packet is simply dropped.
    const pending2 = client.rpc(UserRpc.GetUserId, {});
    const id2 = (fake.sent[1]?.data as { id: string }).id;
    fake.emit(LOBBY_MSG_RPC, { id: id2, ok: true, err: { code: "INTERNAL", msg: "bad" } });
    const shapeError = await pending2.then(() => null, (error: unknown) => error);
    assert.ok(shapeError instanceof RpcError);
    assert.equal(shapeError.code, "INVALID_PAYLOAD");
    fake.emit(LOBBY_MSG_RPC, { id: "unknown", ok: true, err: { code: "INTERNAL", msg: "bad" } });

    fake.emit(LOBBY_MSG_PUSH, { type: LobbyPush.ServerNotice, data: { text: "ok", extra: true } });
    assert.equal(callbacks.length, 0, "非法 push 不得触发 callback");
    fake.emit(LOBBY_MSG_PUSH, { type: LobbyPush.ServerNotice, data: { text: "公告" } });
    assert.deepEqual(callbacks, [{ text: "公告" }]);
    off();
  } finally {
    await client.leave();
  }
});

function makeGameRoom(state: unknown, onSend?: (type: string, data: unknown) => void) {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ type: string; data: unknown }> = [];
  let leaveCalls = 0;
  const room = {
    roomId: "game-room",
    sessionId: "game-session",
    state,
    reconnection: { enabled: true },
    send(type: string, data: unknown) {
      if (onSend) { onSend(type, data); return; }
      sent.push({ type, data });
    },
    onMessage(type: string, callback: Handler) {
      handlers.set(type, callback);
      return () => { if (handlers.get(type) === callback) handlers.delete(type); };
    },
    onStateChange(callback: () => void) { callback(); return () => {}; },
    onDrop(_callback: () => void) { return () => {}; },
    onReconnect(_callback: () => void) { return () => {}; },
    onLeave(_callback: (code?: number, reason?: string) => void) { return () => {}; },
    onError(_callback: (code?: number, message?: string) => void) { return () => {}; },
    leave: async () => { leaveCalls++; return true; },
    removeAllListeners() { handlers.clear(); },
  };
  return {
    room,
    sent,
    emit(type: string, value: unknown) { handlers.get(type)?.(value); },
    get leaveCalls() { return leaveCalls; },
  };
}

function validState() {
  return {
    tick: 1,
    phase: GamePhase.Playing,
    matchId: "match-1",
    players: new Map([
      ["game-session", { id: "game-session", name: "A", x: 0, y: 0, hp: 10, maxHp: 10, alive: true }],
    ]),
  };
}

function validIdleState() {
  return {
    tick: 1,
    phase: GamePhase.Playing,
    matchId: "match-idle",
    pulseGoal: 3,
    winnerId: "",
    players: new Map([["game-session", { id: "game-session", name: "Idle", pulses: 0 }]]),
  };
}

test("RoomClient：idle slot 下与 mode 无关的公共 send API 被 C2S allowlist 拒绝", async () => {
  const fake = makeGameRoom(validIdleState());
  const oldColyseus = (globalThis as { Colyseus?: unknown }).Colyseus;
  class FakeClient {
    constructor(_endpoint: string) {}
    auth = { token: "" };
    async joinOrCreate() { return fake.room; }
  }
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: FakeClient,
    getStateCallbacks: () => undefined,
  };
  const oldWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])); };
  try {
    const client = new RoomClient();
    client.init("http://game.example");
    const adapter = createIdleRoomAdapter();
    const owner = client.joinGame(adapter, { token: "idle-token", sId: 8 });
    const room = await owner.ready;

    // 正对照：allowlist 内的消息照常跨 wire，证明这个 slot 本身处于可发送状态。
    const pulse = [{ type: C2S.IdlePulse, data: {} }];
    assert.equal(room.send(C2S.IdlePulse, {}), true);
    assert.deepEqual(fake.sent, pulse);

    // 反例：typed room 的 send 在编译期被 TOutbound 约束，但 RoomClient 上这几个
    // 与 mode 无关的公共 API 绕过了它，只有运行时 allowlist 能拦住。
    // 返回值本身就是公共契约：断言公共方法而非私有 sendFromSlot，私有方法可以被
    // 重命名或内联，而调用方唯一能触碰的是这三个公共出口。
    assert.equal(client.ping(), false, "idle gameplay 下 ping() 必须返回 false");
    assert.equal(client.castSkill(1, "game-session"), false, "idle gameplay 下 castSkill() 必须返回 false");
    assert.equal(client.chat("hello"), false, "idle gameplay 下 chat() 必须返回 false");
    assert.deepEqual(fake.sent, pulse, "idle gameplay 不允许的 C2S 不得产生任何 room.send");

    // `as any` 直呼内部发送面同样必须返回 false，而不是靠调用方的类型约束兜底。
    const internals = client as unknown as {
      slot: { room: unknown };
      sendFromSlot(slot: unknown, room: unknown, type: string, payload: unknown): boolean;
    };
    assert.equal(
      internals.sendFromSlot(internals.slot, internals.slot.room, C2S.Move, { dirX: 1, dirY: 0 }),
      false,
      "sendFromSlot 必须按 adapter.outbound 拒绝非 allowlist C2S",
    );
    assert.deepEqual(fake.sent, pulse, "被 allowlist 拒绝的消息不得跨 wire");
    assert.equal(warnings.length, 4, "每次拒绝都必须留下一条 allowlist 警告");
    assert.ok(warnings.every((line) => line.includes("不允许发送 C2S")), warnings.join(" | "));
    await owner.leave();
  } finally {
    console.warn = oldWarn;
    (globalThis as { Colyseus?: unknown }).Colyseus = oldColyseus;
  }
});

test("RoomClient：C2S/S2C 发送与回调均经过 runtime validator", async () => {
  const fake = makeGameRoom(validState());
  const oldColyseus = (globalThis as { Colyseus?: unknown }).Colyseus;
  class FakeClient {
    constructor(_endpoint: string) {}
    auth = { token: "" };
    async joinOrCreate() { return fake.room; }
  }
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: FakeClient,
    getStateCallbacks: () => undefined,
  };
  try {
    const client = new RoomClient();
    client.init("http://game.example");
    const adapter = createBallMoveRoomAdapter();
    const inputGeneration = adapter.beginInputLease();
    const owner = client.joinGame(adapter);
    const room = await owner.ready;

    const received: unknown[] = [];
    client.onMessage(fake.room as never, S2C.Pong, (payload) => received.push(payload));
    fake.emit(S2C.Pong, { clientTime: 1, serverTime: 2, extra: true });
    assert.equal(received.length, 0, "非法 S2C 不得触发 callback");
    fake.emit(S2C.Pong, { clientTime: 1, serverTime: 2 });
    assert.deepEqual(received, [{ clientTime: 1, serverTime: 2 }]);

    adapter.move(inputGeneration, room, 2, 0);
    client.castSkill(Number.NaN);
    client.chat("   ");
    assert.equal(fake.sent.length, 0, "越界/NaN/空白 C2S 不得发包");
    adapter.move(inputGeneration, room, 1, 0);
    client.chat("hello");
    assert.deepEqual(fake.sent.map((item) => item.type), [C2S.Move, C2S.Chat]);
    await owner.leave();
  } finally {
    (globalThis as { Colyseus?: unknown }).Colyseus = oldColyseus;
  }
});

test("RoomClient：room.send 同步异常不穿透，reconcile 不误记已发送 seq", async () => {
  let failSend = true;
  const fake = makeGameRoom(validState(), (type, data) => {
    if (failSend) throw new Error(`adapter rejected ${type} ${JSON.stringify(data)}`);
    fake.sent.push({ type, data });
  });
  const oldColyseus = (globalThis as { Colyseus?: unknown }).Colyseus;
  class FakeClient {
    constructor(_endpoint: string) {}
    auth = { token: "" };
    async joinOrCreate() { return fake.room; }
  }
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: FakeClient,
    getStateCallbacks: () => undefined,
  };
  const oldWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const client = new RoomClient();
    client.init("http://game.example");
    const adapter = createBallMoveRoomAdapter();
    const inputGeneration = adapter.beginInputLease();
    const owner = client.joinGame(adapter);
    const room = await owner.ready;

    assert.doesNotThrow(() => {
      adapter.move(inputGeneration, room, 1, 0);
      client.ping();
      client.castSkill(1);
      client.chat("hello");
    }, "fire-and-forget C2S API 不得把 adapter 的同步异常抛给调用方");
    assert.deepEqual(adapter.desiredMove, { dirX: 1, dirY: 0, seq: 1 });
    assert.equal(fake.sent.length, 0, "同步失败的 send 不得记为已发包");
    assert.equal(warnings.length, 4);
    assert.ok(warnings.every((args) => !String(args[0]).includes("adapter rejected")),
      "发送失败日志不得回显 adapter/packet 错误内容");

    failSend = false;
    adapter.reconcile?.(room, "reconnected");
    assert.deepEqual(fake.sent, [{ type: C2S.Move, data: { dirX: 1, dirY: 0 } }],
      "send 失败后 lastInputSeq 必须保持未确认，恢复时应重发最新 desired");
    markFaultPoint("transport-reconcile");
    await owner.leave();
  } finally {
    console.warn = oldWarn;
    (globalThis as { Colyseus?: unknown }).Colyseus = oldColyseus;
  }
});

test("RoomClient state$：MapSchema-like entries 可校验，坏快照不触发 deferred callback", async () => {
  const mapSchema = {
    entries() {
      return new Map([
        ["game-session", { id: "game-session", name: "A", x: 0, y: 0, hp: 10, maxHp: 10, alive: true }],
      ]).entries();
    },
  };
  const state: any = { tick: 1, phase: GamePhase.Playing, matchId: "match-1", players: mapSchema };
  const fake = makeGameRoom(state);
  const oldColyseus = (globalThis as { Colyseus?: unknown }).Colyseus;
  let addCallback: Handler | undefined;
  const playerCallbacks = {
    onChange(callback: Handler) { return () => { addCallback = callback; }; },
  };
  const callbacks = (instance: unknown) => instance === state
    ? { players: { onAdd(callback: Handler) { addCallback = callback; callback((mapSchema as any).entries().next().value[1], "game-session"); return () => {}; } } }
    : playerCallbacks;
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: class {
      constructor(_endpoint: string) {}
      auth = { token: "" };
      async joinOrCreate() { return fake.room; }
    },
    getStateCallbacks: () => callbacks,
  };
  try {
    const client = new RoomClient();
    client.init("http://game.example");
    const owner = client.joinGame(createBallMoveRoomAdapter());
    const room = await owner.ready;
    const $ = room.state$();
    let called = 0;
    $(state).players.onAdd(() => { called++; });
    assert.equal(called, 1, "合法 MapSchema-like state 应触发 immediate callback");
    state.tick = Number.NaN;
    addCallback?.({ id: "game-session", name: "A", x: 0, y: 0, hp: 10, maxHp: 10, alive: true }, "game-session");
    assert.equal(called, 1, "坏状态快照后的 deferred callback 必须丢弃");
    await owner.leave();
  } finally {
    (globalThis as { Colyseus?: unknown }).Colyseus = oldColyseus;
  }
});

test("RoomClient：S2C callback 的同步异常与 Promise rejection 都被观察", async () => {
  const fake = makeGameRoom(validState());
  const oldColyseus = (globalThis as { Colyseus?: unknown }).Colyseus;
  class FakeClient {
    constructor(_endpoint: string) {}
    auth = { token: "" };
    async joinOrCreate() { return fake.room; }
  }
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: FakeClient,
    getStateCallbacks: () => undefined,
  };
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const client = new RoomClient();
    client.init("http://game.example");
    const owner = client.joinGame(createBallMoveRoomAdapter());
    await owner.ready;
    let calls = 0;
    client.onMessage(fake.room as never, S2C.Pong, () => {
      calls++;
      if (calls === 1) throw new Error("sync callback failure");
      return Promise.reject(new Error("async callback failure"));
    });
    assert.doesNotThrow(() => fake.emit(S2C.Pong, { clientTime: 1, serverTime: 2 }));
    assert.doesNotThrow(() => fake.emit(S2C.Pong, { clientTime: 1, serverTime: 2 }));
    await flushMicrotasks();
    assert.equal(calls, 2);
    assert.deepEqual(unhandled, []);
    await owner.leave();
  } finally {
    process.off("unhandledRejection", onUnhandled);
    (globalThis as { Colyseus?: unknown }).Colyseus = oldColyseus;
  }
});

test("RoomClient state$：注册方法/回调异常均不穿透，也不产生 unhandled rejection", async () => {
  const state: any = validState();
  const fake = makeGameRoom(state);
  const oldColyseus = (globalThis as { Colyseus?: unknown }).Colyseus;
  let deferredCallback: ((player: unknown, id: string) => unknown) | undefined;
  const callbacks = (instance: unknown) => {
    if (instance !== state) return undefined;
    return {
      players: {
        onAdd(_callback: unknown) { throw new Error("registration failure"); },
        onRemove(callback: (player: unknown, id: string) => unknown) {
          deferredCallback = callback;
          return () => {};
        },
      },
    };
  };
  (globalThis as { Colyseus?: unknown }).Colyseus = {
    Client: class {
      constructor(_endpoint: string) {}
      auth = { token: "" };
      async joinOrCreate() { return fake.room; }
    },
    getStateCallbacks: () => callbacks,
  };
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const client = new RoomClient();
    client.init("http://game.example");
    const owner = client.joinGame(createBallMoveRoomAdapter());
    const room = await owner.ready;
    const guarded = room.state$();
    assert.doesNotThrow(() => guarded(state).players.onAdd(() => { throw new Error("ignored"); }));
    assert.doesNotThrow(() => guarded(state).players.onRemove(() => Promise.reject(new Error("async"))));
    assert.doesNotThrow(() => deferredCallback?.(state.players.get("game-session"), "game-session"));
    await flushMicrotasks();
    assert.deepEqual(unhandled, []);
    await owner.leave();
  } finally {
    process.off("unhandledRejection", onUnhandled);
    (globalThis as { Colyseus?: unknown }).Colyseus = oldColyseus;
  }
});

test("WebSocketClient：push handler 的同步异常与 Promise rejection 都被观察", async () => {
  const fake = makeLobbyRoom();
  const client = await setupLobby(fake);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    let calls = 0;
    client.onPush(LobbyPush.ServerNotice, () => {
      calls++;
      if (calls === 1) throw new Error("sync push failure");
      return Promise.reject(new Error("async push failure"));
    });
    assert.doesNotThrow(() => fake.emit(LOBBY_MSG_PUSH, {
      type: LobbyPush.ServerNotice,
      data: { text: "notice" },
    }));
    assert.doesNotThrow(() => fake.emit(LOBBY_MSG_PUSH, {
      type: LobbyPush.ServerNotice,
      data: { text: "notice" },
    }));
    await flushMicrotasks();
    assert.equal(calls, 2);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    await client.leave();
  }
});
