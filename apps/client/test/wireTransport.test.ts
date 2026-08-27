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

type Handler = (...values: unknown[]) => void;

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

function makeGameRoom(state: unknown) {
  const handlers = new Map<string, Handler>();
  const sent: Array<{ type: string; data: unknown }> = [];
  let leaveCalls = 0;
  const room = {
    roomId: "game-room",
    sessionId: "game-session",
    state,
    reconnection: { enabled: true },
    send(type: string, data: unknown) { sent.push({ type, data }); },
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
