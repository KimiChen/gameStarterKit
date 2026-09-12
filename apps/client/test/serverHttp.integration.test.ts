/**
 * 客户端 HTTP 封装的真实服务端集成测试。
 *
 * 运行前先启动本地服务：npm run dev
 * 再运行：npm run test:client:server
 *
 * 测试刻意只为 Node 补齐 XMLHttpRequest transport；请求编排、契约校验、
 * token 处理与各端点 wrapper 都直接来自 apps/client/src。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { initHttp, initPortal, request, setToken } from "../src/core/http";
import { WebSocketClient } from "../src/net/WebSocketClient";
import { devLogin } from "../src/net/http/account";
import { fetchAreaList } from "../src/net/http/area";
import { fetchNotices } from "../src/net/http/notice";
import { ApiPath, UserRpc, type IClockNowRes, type IHealthRes, type IVersionRes } from "../src/shared/index";

const origin = (process.env.CLIENT_SERVER_ORIGIN ?? "").replace(/\/+$/, "");
const require = createRequire(import.meta.url);

// Cocos 中由「导入为插件」加载的锁定 UMD；Node 联调时装入同一份 SDK 并挂回同一全局名。
(globalThis as { Colyseus?: unknown }).Colyseus = require("../src/lib/colyseus/colyseus.js");

interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** Node 中的最小 XHR transport：保留客户端代码的真实 XHR 调用面，底层由 fetch 发到本地服务。 */
class FetchBackedXhr {
  static requests: RecordedRequest[] = [];

  status = 0;
  responseText = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  private method = "";
  private url = "";
  private headers: Record<string, string> = {};

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
    this.headers = {};
  }

  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  send(body?: unknown): void {
    FetchBackedXhr.requests.push({ method: this.method, url: this.url, headers: { ...this.headers } });
    void this.dispatch(typeof body === "string" ? body : undefined);
  }

  private async dispatch(body: string | undefined): Promise<void> {
    try {
      const response = await fetch(this.url, { method: this.method, headers: this.headers, body });
      this.status = response.status;
      this.responseText = await response.text();
      this.onload?.();
    } catch {
      this.onerror?.();
    }
  }
}

test("客户端 HTTP 封装可真实联调本地服务：登录、选区、健康、版本、对时与公告", { skip: origin === "" }, async () => {
  const previousXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FetchBackedXhr;
  FetchBackedXhr.requests = [];
  setToken("");

  try {
    initPortal(origin);
    initHttp(origin);

    const login = await devLogin("client_server_smoke", 0, "client-http-integration");
    assert.ok(login.userId.length > 0, "服务端必须签发用户身份");
    assert.ok(login.accessToken.length > 0, "服务端必须签发会话 token");
    setToken(login.accessToken);

    const areas = await fetchAreaList();
    const localArea = areas.servers.find((server) => server.serverId === 0);
    assert.deepEqual(localArea, {
      gameHttpUrl: origin,
      gameWsUrl: origin.replace(/^http/, "ws"),
      name: "本地开发服",
      openTime: 1,
      serverId: 0,
      status: "smooth",
      tag: "normal",
    });

    const health = await request<IHealthRes>("GET", ApiPath.Health);
    assert.equal(health.status, "ok");
    assert.ok(health.serverTime > 0);
    assert.match(health.version, /^g\d+ l\d+$/);

    const version = await request<IVersionRes>("GET", ApiPath.Version);
    assert.match(version.name, /-server$/);
    assert.ok(version.gameRoomProtocol > 0);
    assert.ok(version.lobbyProtocol > 0);

    const clock = await request<IClockNowRes>("GET", ApiPath.ClockNow);
    assert.ok(clock.serverTime > 0);

    const notices = await fetchNotices();
    assert.ok(notices.list.length > 0, "本地服务必须返回登录前公告");
    assert.ok(notices.list.every((notice) => notice.title.length > 0 && notice.content.length > 0));

    const areaRequest = FetchBackedXhr.requests.find((entry) => entry.url === `${origin}/v1/areas`);
    assert.equal(areaRequest?.headers.Authorization, `Bearer ${login.accessToken}`, "选区请求必须复用客户端保存的 token");
  } finally {
    setToken("");
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previousXhr;
  }
});

test("客户端 WebSocketClient 可真实联调本地 Lobby：认证、RPC 与主动离开", { skip: origin === "" }, async () => {
  const client = WebSocketClient.inst;
  const previousXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FetchBackedXhr;
  await client.leave();

  try {
    initPortal(origin);
    const login = await devLogin("client_server_ws_smoke", 0, "client-websocket-integration");
    client.init(origin);
    await client.join(login.accessToken, { sId: 0 });

    assert.equal(client.getConnectionState().state, "ready");
    const userId = await client.rpc(UserRpc.GetUserId, {});
    assert.equal(userId.uid, login.userId, "Lobby 必须从服务端 token 反查 uid，而非信任客户端上报");

    const info = await client.rpc(UserRpc.GetInfo, {});
    assert.equal(info.user.uid, login.userId);
    assert.ok(info.user.ver >= 0);
  } finally {
    await client.leave();
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = previousXhr;
  }
});
