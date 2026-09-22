import assert from "node:assert/strict";
import { test } from "node:test";
import { LOBBY_TRANSPORT_VERSION } from "../src/shared/index";
import { LobbyTransportHub } from "../src/net/LobbyTransportHub";
import { WebSocketClient } from "../src/net/WebSocketClient";

class FakeSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly code?: number }) => void) | null = null;
  readonly sent: string[] = [];

  constructor(readonly endpoint: string) {}
  send(data: string): void {
    this.sent.push(data);
  }
  close(code?: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  open(): void {
    this.onopen?.();
  }
  receive(data: string): void {
    this.onmessage?.({ data });
  }
}

test("LobbyTransportHub：默认保持 Colyseus，native 只使用显式端点而不读取 gameWsUrl", async () => {
  const hub = new LobbyTransportHub();
  assert.equal(hub.current, WebSocketClient.inst);
  assert.throws(
    () => hub.configure({ kind: "native-websocket" }),
    /配置字段无效/,
  );

  const previous = (globalThis as { WebSocket?: unknown }).WebSocket;
  const sockets: FakeSocket[] = [];
  (globalThis as { WebSocket?: unknown }).WebSocket = class extends FakeSocket {
    constructor(endpoint: string) {
      super(endpoint);
      sockets.push(this);
    }
  };
  try {
    hub.configure({
      kind: "native-websocket",
      endpoint: "wss://new-lobby.example",
    });
    const joined = hub.connect(
      { serverId: 9, gameWsUrl: "ws://old-colyseus.example" },
      "token",
    );
    const socket = sockets[0]!;
    assert.equal(socket.endpoint, "wss://new-lobby.example");
    socket.open();
    assert.deepEqual(JSON.parse(socket.sent[0]!), {
      v: LOBBY_TRANSPORT_VERSION,
      kind: "auth",
      token: "token",
      sId: 9,
    });
    socket.receive(
      JSON.stringify({
        v: LOBBY_TRANSPORT_VERSION,
        kind: "auth.ok",
        uid: "u",
        sId: 9,
      }),
    );
    await joined;
    await hub.current.leave();
    hub.configure({ kind: "colyseus" });
    assert.equal(hub.current, WebSocketClient.inst);
  } finally {
    (globalThis as { WebSocket?: unknown }).WebSocket = previous;
  }
});

test("LobbyTransportHub：非法配置被拒，且拒绝后当前通道与配置都不变", () => {
  const hub = new LobbyTransportHub();
  const baseline = hub.currentConfig;
  const rejected: readonly unknown[] = [
    undefined,
    null,
    "colyseus",
    [],
    {},
    { kind: "colyseus", endpoint: "wss://x" },
    { kind: "native-websocket" },
    { kind: "native-websocket", endpoint: "wss://x", extra: 1 },
    { kind: "native-websocket", endpoint: "http://x" },
    { kind: "native-websocket", endpoint: "wss://x/path" },
    { kind: "unknown" },
  ];
  for (const input of rejected) {
    assert.throws(
      () => hub.configure(input),
      `必须拒绝非法配置：${JSON.stringify(input)}`,
    );
    // 一次坏配置不得把默认旧通道换掉，也不得留下半个配置（否则客户端会连到不存在的端点）。
    assert.deepEqual(hub.currentConfig, baseline);
    assert.equal(hub.current, WebSocketClient.inst);
  }
});

test("LobbyTransportHub：已有连接时拒绝切换通道，释放后才允许切换", async () => {
  const hub = new LobbyTransportHub();
  const previous = (globalThis as { WebSocket?: unknown }).WebSocket;
  const sockets: FakeSocket[] = [];
  (globalThis as { WebSocket?: unknown }).WebSocket = class extends FakeSocket {
    constructor(endpoint: string) {
      super(endpoint);
      sockets.push(this);
    }
  };
  try {
    hub.configure({
      kind: "native-websocket",
      endpoint: "wss://new-lobby.example",
    });
    const joined = hub.connect(
      { serverId: 9, gameWsUrl: "ws://old-colyseus.example" },
      "token",
    );
    const socket = sockets[0]!;
    socket.open();
    socket.receive(
      JSON.stringify({
        v: LOBBY_TRANSPORT_VERSION,
        kind: "auth.ok",
        uid: "u",
        sId: 9,
      }),
    );
    await joined;
    assert.notEqual(hub.current.getConnectionState().state, "idle");

    // 有连接时切换必须被拒，且不得改动配置——否则旧 generation、pending RPC 与写请求会被留给新通道。
    assert.throws(() => hub.configure({ kind: "colyseus" }), /必须先释放当前连接/);
    assert.deepEqual(hub.currentConfig, {
      kind: "native-websocket",
      endpoint: "wss://new-lobby.example",
    });

    await hub.current.leave();
    assert.equal(hub.current.getConnectionState().state, "idle");
    hub.configure({ kind: "colyseus" });
    assert.equal(hub.current, WebSocketClient.inst);
  } finally {
    (globalThis as { WebSocket?: unknown }).WebSocket = previous;
  }
});
