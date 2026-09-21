/** 锁定 Colyseus 0.17 的随机端口适配：真实 HTTP/SDK 都命中测试端口，身份替身不被重装。 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { Room, Server } from "colyseus";
import { Schema } from "@colyseus/schema";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { bootTestServer, fakeWebPlatformClient, testServerHttpEndpoint } from "./helpers";
import { installWebPlatformClientForTests, webPlatformClient } from "../../src/platform/webPlatformClient";

test("bootTestServer：随机真实端口用于 SDK/HTTP，保留显式身份故障注入", async () => {
  const app = express();
  const marker = `helper-${process.pid}`;
  app.get("/probe", (_req, res) => res.json({ marker }));
  const server = new Server({
    transport: new WebSocketTransport({ server: createServer(app) }), gracefullyShutdown: false, greet: false,
  });
  class ProbeRoom extends Room { onCreate(): void { this.setState(new Schema()); } }
  server.define("helper-port-probe", ProbeRoom);
  const injected = new Error("explicit-auth-fault");
  const restore = installWebPlatformClientForTests({ ...fakeWebPlatformClient, verify: async () => { throw injected; } });
  let testServer: Awaited<ReturnType<typeof bootTestServer>> | undefined;
  try {
    testServer = await bootTestServer(server);
    const endpoint = new URL(testServerHttpEndpoint(server));
    assert.ok(Number(endpoint.port) > 0);
    assert.notEqual(endpoint.port, "2568");
    const response = await testServer.http.get("/probe");
    assert.deepEqual(response.data, { marker }, "HTTP helper 必须访问独立测试 Server");
    const room = await testServer.sdk.create("helper-port-probe");
    assert.ok(testServer.getRoomById(room.roomId), "SDK 创建的房必须属于同一测试 Server");
    await room.leave(true);
    await assert.rejects(webPlatformClient.verify("sentinel", 0), (error: unknown) => error === injected,
      "监听适配不得覆盖用例的身份故障替身");
  } finally {
    try { await testServer?.shutdown(); } finally { restore(); }
  }
});
