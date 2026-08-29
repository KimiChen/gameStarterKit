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
    const owner = client.joinGame();
    await owner.ready;

    const received: unknown[] = [];
    client.onMessage(fake.room as never, S2C.Pong, (payload) => received.push(payload));
    fake.emit(S2C.Pong, { clientTime: 1, serverTime: 2, extra: true });
    assert.equal(received.length, 0, "非法 S2C 不得触发 callback");
    fake.emit(S2C.Pong, { clientTime: 1, serverTime: 2 });
    assert.deepEqual(received, [{ clientTime: 1, serverTime: 2 }]);

    client.move(2, 0);
    client.castSkill(Number.NaN);
    client.chat("   ");
    assert.equal(fake.sent.length, 0, "越界/NaN/空白 C2S 不得发包");
    client.move(1, 0);
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
    const owner = client.joinGame();
    await owner.ready;

    assert.doesNotThrow(() => {
      client.move(1, 0);
      client.ping();
      client.castSkill(1);
      client.chat("hello");
    }, "fire-and-forget C2S API 不得把 adapter 的同步异常抛给调用方");
    assert.deepEqual(client.desiredMove, { dirX: 1, dirY: 0, seq: 1 });
    assert.equal(fake.sent.length, 0, "同步失败的 send 不得记为已发包");
    assert.equal(warnings.length, 4);
    assert.ok(warnings.every((args) => !String(args[0]).includes("adapter rejected")),
      "发送失败日志不得回显 adapter/packet 错误内容");

    failSend = false;
    client.reconcileInput();
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
    getStateCallbacks: () => callbacks,
  };
  try {
    const client = new RoomClient();
    const $ = client.state$(fake.room as never);
    let called = 0;
    $(state).players.onAdd(() => { called++; });
    assert.equal(called, 1, "合法 MapSchema-like state 应触发 immediate callback");
    state.tick = Number.NaN;
    addCallback?.({ id: "game-session", name: "A", x: 0, y: 0, hp: 10, maxHp: 10, alive: true }, "game-session");
    assert.equal(called, 1, "坏状态快照后的 deferred callback 必须丢弃");
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
    const owner = client.joinGame();
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
  (globalThis as { Colyseus?: unknown }).Colyseus = { getStateCallbacks: () => callbacks };
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const client = new RoomClient();
    const guarded = client.state$(fake.room as never);
    assert.doesNotThrow(() => guarded(state).players.onAdd(() => { throw new Error("ignored"); }));
    assert.doesNotThrow(() => guarded(state).players.onRemove(() => Promise.reject(new Error("async"))));
    assert.doesNotThrow(() => deferredCallback?.(state.players.get("game-session"), "game-session"));
    await flushMicrotasks();
    assert.deepEqual(unhandled, []);
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
