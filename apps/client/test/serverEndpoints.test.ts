import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebPlatformAreaServer } from "../src/shared/index";
import { joinSelectedServerLobby } from "../src/logic/page/LoginLogic";
import { createBallMoveRoomAdapter, joinGameRoom } from "../src/net/rooms/GameRoomTransport";
import type { RoomClient } from "../src/net/RoomClient";
import {
  chooseServer, discoverServerEndpoints, getCurrentGameWsUrl, getCurrentLobbyWsUrl,
  getCurrentWorldWsUrl, setServerList,
} from "../src/net/serverSession";

const server = (serverId = 1): WebPlatformAreaServer => ({
  serverId, name: `区${serverId}`, status: "smooth", tag: "normal", openTime: 1,
  gameHttpUrl: `https://http-${serverId}.example`, gameWsUrl: `wss://fallback-${serverId}.example`,
});
const version = { name: "game-server", gameRoomProtocol: 8, lobbyProtocol: 1 };
const split = { ...version, lobbyWs: "wss://lobby.example", gameWs: "wss://game.example", worldWs: "wss://world.example" };
const urls = () => [getCurrentLobbyWsUrl(), getCurrentGameWsUrl(), getCurrentWorldWsUrl()];
const select = (...servers: WebPlatformAreaServer[]) => setServerList({ hash: "endpoints", isOps: false, myServerIds: [], servers });
function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => { resolve = done; });
  return { promise, resolve };
}

test("PS2：旧版version与各角色缺字段/空字段分别回落目录WS，不互相串用", async () => {
  const row = server(); select(row);
  assert.deepEqual(urls(), Array(3).fill(row.gameWsUrl));
  await discoverServerEndpoints(row, async () => version);
  assert.deepEqual(urls(), Array(3).fill(row.gameWsUrl));
  await discoverServerEndpoints(row, async () => ({ ...version, gameWs: split.gameWs, lobbyWs: "" }));
  assert.deepEqual(urls(), [row.gameWsUrl, split.gameWs, row.gameWsUrl]);
  const result = await discoverServerEndpoints(row, async () => split);
  assert.deepEqual(urls(), [split.lobbyWs, split.gameWs, split.worldWs]);
  (result as { worldWs: string }).worldWs = "wss://mutated.example";
  assert.equal(getCurrentWorldWsUrl(), split.worldWs, "调用方不得改内部发现结果");
});

test("PS2：换服/目录端点变更清缓存；同地址目录刷新保留发现；空目录拒连接", async () => {
  const a = server(1), b = server(2); select(a, b);
  await discoverServerEndpoints(a, async () => split);
  select({ ...a, name: "改名" }, b);
  assert.deepEqual(urls(), [split.lobbyWs, split.gameWs, split.worldWs]);
  chooseServer(b);
  assert.deepEqual(urls(), Array(3).fill(b.gameWsUrl));
  chooseServer(a);
  assert.deepEqual(urls(), Array(3).fill(a.gameWsUrl), "不得恢复别次选服的旧缓存");
  await discoverServerEndpoints(a, async () => split);
  select({ ...a, gameHttpUrl: "https://new-http.example" });
  assert.deepEqual(urls(), Array(3).fill(a.gameWsUrl));
  const changed = { ...a, gameHttpUrl: "https://new-http.example" };
  await discoverServerEndpoints(changed, async () => split);
  select({ ...changed, gameWsUrl: "wss://new-directory.example" });
  assert.deepEqual(urls(), Array(3).fill("wss://new-directory.example"));
  select();
  for (const read of [getCurrentLobbyWsUrl, getCurrentGameWsUrl, getCurrentWorldWsUrl]) assert.throws(read, /尚未选择区服/);
});

test("PS2：HTTP失败与坏地址明确拒绝，不能降级或污染已知端点", async () => {
  const row = server(); select(row);
  await discoverServerEndpoints(row, async () => split);
  await assert.rejects(discoverServerEndpoints(row, async () => { throw new Error("HTTP 503"); }), /HTTP 503/);
  for (const value of [null, "https://wrong.example", "wss://user@host.example", "wss://host.example/path", " wss://host.example", "wss://host.example:99999"]) {
    await assert.rejects(discoverServerEndpoints(row, async () => ({ ...version, worldWs: value })), /WIRE_/);
  }
  assert.deepEqual(urls(), [split.lobbyWs, split.gameWs, split.worldWs]);
});

test("PS2：选服A→B→A后旧version仍失效，目录刷新也隔离在途响应", async () => {
  const a = server(1), b = server(2); select(a, b);
  const gate = deferred();
  const pending = discoverServerEndpoints(a, () => gate.promise);
  chooseServer(b); chooseServer(a); gate.resolve(split);
  await assert.rejects(pending, /已失效/);
  assert.deepEqual(urls(), Array(3).fill(a.gameWsUrl));
  const refreshed = deferred();
  const stale = discoverServerEndpoints(a, () => refreshed.promise);
  select(a, b); refreshed.resolve(split);
  await assert.rejects(stale, /已失效/);
  assert.deepEqual(urls(), Array(3).fill(a.gameWsUrl));
});

test("PS2：后发发现优先，迟到请求不能覆盖；捕获后的调用方目录对象不能改fallback", async () => {
  const row = server(); select(row);
  const gate = deferred();
  const stale = discoverServerEndpoints(row, () => gate.promise);
  await discoverServerEndpoints(row, async () => split);
  gate.resolve(version); await assert.rejects(stale, /已失效/);
  assert.deepEqual(urls(), [split.lobbyWs, split.gameWs, split.worldWs]);
  const captured = server(); const pendingGate = deferred();
  const pending = discoverServerEndpoints(captured, () => pendingGate.promise);
  captured.gameWsUrl = "wss://mutated.example";
  pendingGate.resolve(version); await pending;
  assert.deepEqual(urls(), Array(3).fill(row.gameWsUrl));
});

test("PS2：Lobby接缝用lobbyWs，GameRoom接缝独立用gameWs并保留同区sId", async () => {
  const row = server(7); select(row);
  const endpoints = await discoverServerEndpoints(row, async () => split);
  const calls: unknown[] = [];
  await joinSelectedServerLobby({ ...row, lobbyWs: endpoints.lobbyWs }, "token", {
    init: (endpoint) => { calls.push(["lobby", endpoint]); },
    join: async (_token, options) => { calls.push(["lobby-sId", options.sId]); },
  });
  const fakeClient = {
    init: (endpoint: string) => { calls.push(["game", endpoint]); },
    joinGame: (_adapter: unknown, options: { sId: number }) => { calls.push(["game-sId", options.sId]); return {} as never; },
  } as unknown as RoomClient;
  joinGameRoom(fakeClient, createBallMoveRoomAdapter(), new AbortController().signal);
  assert.deepEqual(calls, [["lobby", split.lobbyWs], ["lobby-sId", 7], ["game", split.gameWs], ["game-sId", 7]]);
});
