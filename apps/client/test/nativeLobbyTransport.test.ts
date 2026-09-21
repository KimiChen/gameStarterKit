import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LOBBY_TRANSPORT_VERSION,
  LobbyPush,
  UserRpc,
  serializeLobbyTransportFrame,
} from "../src/shared/index";
import {
  NativeLobbyTransport,
  type NativeWebSocket,
} from "../src/net/NativeLobbyTransport";
import { RpcError } from "../src/net/LobbyRpcError";
import { lobbyDataSync } from "../src/net/LobbyDataSync";

class FakeSocket implements NativeWebSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  onclose: ((event: { readonly code?: number }) => void) | null = null;
  readonly sent: string[] = [];

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

test("NativeLobbyTransport：显式原生通道完成 auth、RPC、push，并且不重放断线请求", async () => {
  const sockets: FakeSocket[] = [];
  const client = new NativeLobbyTransport(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  client.init("wss://lobby.example");
  const owner = client.joinOwned("opaque-token", { sId: 3 });
  const socket = sockets[0]!;
  socket.open();
  assert.deepEqual(JSON.parse(socket.sent[0]!), {
    v: LOBBY_TRANSPORT_VERSION,
    kind: "auth",
    token: "opaque-token",
    sId: 3,
  });
  socket.receive(
    serializeLobbyTransportFrame({
      v: LOBBY_TRANSPORT_VERSION,
      kind: "auth.ok",
      uid: "u-1",
      sId: 3,
    }),
  );
  await owner.ready;

  const notices: string[] = [];
  const off = client.onPush(LobbyPush.ServerNotice, (push) => {
    notices.push(push.text);
  });
  const pending = client.rpc(UserRpc.GetUserId, {});
  const request = JSON.parse(socket.sent[1]!);
  assert.equal(request.kind, "rpc");
  assert.equal(request.rpc.type, UserRpc.GetUserId);
  socket.receive(
    serializeLobbyTransportFrame({
      v: LOBBY_TRANSPORT_VERSION,
      kind: "reply",
      reply: { id: request.rpc.id, ok: true, data: { uid: "u-1" } },
    }),
  );
  assert.deepEqual(await pending, { uid: "u-1" });

  socket.receive(
    serializeLobbyTransportFrame({
      v: LOBBY_TRANSPORT_VERSION,
      kind: "push",
      push: { type: LobbyPush.ServerNotice, data: { text: "hello" } },
    }),
  );
  assert.deepEqual(notices, ["hello"]);
  off();

  const lost = client.rpc(UserRpc.GetUserId, {});
  socket.close(1006);
  await assert.rejects(
    lost,
    (error: unknown) => error instanceof RpcError && error.code === "CONN_LOST",
  );
  await assert.rejects(
    client.rpc(UserRpc.GetUserId, {}),
    (error: unknown) => error instanceof RpcError && error.code === "CONN_LOST",
  );
});

/**
 * 回归：join 控制信号只约束**这一次 join 尝试**，不约束连接寿命。
 *
 * 真实 Creator 预览实测过这个缺陷：登录页在进入大厅后会关闭自己的生命周期 context，
 * 若 abort 监听还挂在 signal 上，就会把刚建立的大厅连接一起拆掉——现象是「登录成功、
 * 首屏正常，但之后任何写请求都 CONN_LOST」，看起来像服务端拒绝，实际是客户端自伤。
 */
test("NativeLobbyTransport：join 落定后再 abort 控制信号，不得关掉已建立的大厅连接", async () => {
  const sockets: FakeSocket[] = [];
  const client = new NativeLobbyTransport(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  client.init("wss://lobby.example");
  const controller = new AbortController();
  const owner = client.joinOwned(
    "opaque-token",
    { sId: 3 },
    { signal: controller.signal },
  );
  const socket = sockets[0]!;
  socket.open();
  socket.receive(
    serializeLobbyTransportFrame({
      v: LOBBY_TRANSPORT_VERSION,
      kind: "auth.ok",
      uid: "u-1",
      sId: 3,
    }),
  );
  await owner.ready;

  // 等价于登录页 h.close() 触发的那个 abort：发生在 join 已经落定之后。
  controller.abort();

  assert.equal(socket.readyState, 1, "落定后的 abort 不得关闭大厅连接");
  assert.equal(client.getConnectionState().state, "ready");

  // 连接必须仍然可用：能发出 RPC 并收到回包（缺陷下这里会抛 CONN_LOST）。
  const pending = client.rpc(UserRpc.GetUserId, {});
  const request = JSON.parse(socket.sent[1]!);
  assert.equal(request.kind, "rpc");
  socket.receive(
    serializeLobbyTransportFrame({
      v: LOBBY_TRANSPORT_VERSION,
      kind: "reply",
      reply: { id: request.rpc.id, ok: true, data: { uid: "u-1" } },
    }),
  );
  assert.deepEqual(await pending, { uid: "u-1" });
  await owner.leave();
});

test("NativeLobbyTransport：join 未落定时的 abort 仍然取消本次 join 并关闭连接", async () => {
  const sockets: FakeSocket[] = [];
  const client = new NativeLobbyTransport(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  client.init("wss://lobby.example");
  const controller = new AbortController();
  const owner = client.joinOwned(
    "opaque-token",
    { sId: 3 },
    { signal: controller.signal },
  );
  const socket = sockets[0]!;
  socket.open();
  controller.abort();

  await assert.rejects(owner.ready, /join 已取消/);
  assert.equal(socket.readyState, 3, "未落定的 join 被取消后必须关闭连接");
});

test("NativeLobbyTransport：reply.sync 与服务端主动 sync 进入同一数据同步入口", async () => {
  lobbyDataSync.reset();
  const sockets: FakeSocket[] = [];
  const client = new NativeLobbyTransport(() => {
    const socket = new FakeSocket();
    sockets.push(socket);
    return socket;
  });
  const received: unknown[] = [];
  const off = lobbyDataSync.subscribe((sync) => received.push(sync));
  client.init("wss://lobby.example");
  const owner = client.joinOwned("opaque-token", { sId: 3 });
  const socket = sockets[0]!;
  socket.open();
  socket.receive(serializeLobbyTransportFrame({
    v: LOBBY_TRANSPORT_VERSION, kind: "auth.ok", uid: "u-1", sId: 3,
  }));
  await owner.ready;

  const active = { mods: { versions: { User: 1 }, User: { copper: 10 } } };
  socket.receive(serializeLobbyTransportFrame({
    v: LOBBY_TRANSPORT_VERSION, kind: "sync", sync: active,
  }));
  // 同版本主动包是幂等重放，不得第二次通知。
  socket.receive(serializeLobbyTransportFrame({
    v: LOBBY_TRANSPORT_VERSION, kind: "sync", sync: active,
  }));

  const pending = client.rpc(UserRpc.GetUserId, {});
  const request = JSON.parse(socket.sent[1]!);
  socket.receive(serializeLobbyTransportFrame({
    v: LOBBY_TRANSPORT_VERSION,
    kind: "reply",
    reply: {
      id: request.rpc.id,
      ok: true,
      data: { uid: "u-1" },
      sync: { mods: { versions: { User: 2 }, User: { copper: 20 } } },
    },
  }));
  await pending;
  assert.equal(received.length, 2);
  assert.deepEqual(lobbyDataSync.latest(), {
    mods: { versions: { User: 2 }, User: { copper: 20 } },
  });
  off();
  await owner.leave();
});
