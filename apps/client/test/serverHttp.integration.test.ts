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
import { test } from "node:test";
import { initHttp, initPortal, request, setToken } from "../src/core/http";
import { devLogin } from "../src/net/http/account";
import { fetchAreaList } from "../src/net/http/area";
import { fetchNotices } from "../src/net/http/notice";
import { ApiPath, type IClockNowRes, type IHealthRes, type IVersionRes } from "../src/shared/index";

const origin = (process.env.CLIENT_SERVER_ORIGIN ?? "").replace(/\/+$/, "");

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
