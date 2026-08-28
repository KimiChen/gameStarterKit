/**
 * core/http.ts 状态码守门：非 2xx 必须 reject——onload 只代表「收到了响应」，
 * 401/403/429/500 的 JSON 错误体若被当正常数据 resolve，业务层会拿着错误对象继续跑
 * （曾是真实 bug：HTTP 500 被当成功数据）。用假 XHR 注入各状态码验证。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { getPortalUrl, initHttp, initPortal, request, setToken } from "../src/core/http";
import { devLogin, wxLogin } from "../src/net/http/account";
import { fetchAreaList } from "../src/net/http/area";
import { ApiPath } from "../src/shared/index";

/** 可编程假 XHR：send 后同步触发 onload，按预设 status/body 回放 */
class FakeXhr {
  static nextStatus = 200;
  static nextBody = "{}";
  static lastMethod = "";
  static lastUrl = "";
  static lastBody: unknown;
  static lastHeaders: Record<string, string> = {};
  status = 0;
  responseText = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open(method: string, url: string): void {
    FakeXhr.lastMethod = method;
    FakeXhr.lastUrl = url;
    FakeXhr.lastHeaders = {};
  }
  setRequestHeader(key: string, value: string): void { FakeXhr.lastHeaders[key] = value; }
  send(body?: unknown): void {
    FakeXhr.lastBody = body;
    this.status = FakeXhr.nextStatus;
    this.responseText = FakeXhr.nextBody;
    queueMicrotask(() => this.onload?.());
  }
}

test("http：2xx resolve、非 2xx reject（错误 JSON 体不得伪装成功）", async () => {
  const orig = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
  try {
    FakeXhr.nextStatus = 200;
    FakeXhr.nextBody = `{"status":"ok","serverTime":1,"version":"3"}`;
    assert.deepEqual(await request("GET", ApiPath.Health), { status: "ok", serverTime: 1, version: "3" });

    for (const bad of [401, 403, 429, 500]) {
      FakeXhr.nextStatus = bad;
      FakeXhr.nextBody = `{"error":"boom"}`; // 合法 JSON 的错误体——正是曾被误吞的形态
      await assert.rejects(request("GET", ApiPath.Health), new RegExp(`HTTP ${bad}`),
        `${bad} 应 reject 而非把错误体当数据`);
    }

    FakeXhr.nextStatus = 200;
    FakeXhr.nextBody = "not-json";
    await assert.rejects(request("GET", ApiPath.Health), /解析失败/);
  } finally {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
  }
});

test("http：非 2xx 带出可判别的 status/code（业务层靠字段分流，⛔ 不靠正则抠 message）", async () => {
  const orig = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
  try {
    // WebPlatform v1 错误码必须原样带到业务层，调用方据此给出可重试提示。
    FakeXhr.nextStatus = 409;
    FakeXhr.nextBody = `{"code":"RATE_LIMITED","requestId":"req-1"}`;
    const e = await request("GET", ApiPath.Health).then(() => null, (x: unknown) => x) as { status?: number; code?: string };
    assert.equal(e.status, 409);
    assert.equal(e.code, "RATE_LIMITED", "WebPlatform v1 { code } 体必须解成 HttpError.code");

    FakeXhr.nextStatus = 401;
    FakeXhr.nextBody = `{"error":"AUTH_REQUIRED"}`;
    const legacy = await request("GET", ApiPath.Health).then(() => null, (x: unknown) => x) as { code?: string };
    assert.equal(legacy.code, "AUTH_REQUIRED", "游戏服现有 { error } 体仍需可判别");

    // 非 JSON / 无 error 字段的错误体 → code 空串，status 仍可用（⛔ 解析失败不得反过来吃掉错误）
    FakeXhr.nextStatus = 502;
    FakeXhr.nextBody = "<html>bad gateway</html>";
    const g = await request("GET", ApiPath.Health).then(() => null, (x: unknown) => x) as { status?: number; code?: string };
    assert.equal(g.status, 502);
    assert.equal(g.code, "");
  } finally {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
  }
});

test("WebPlatform Public：portal 必填且不回退；v1 登录/选服方法、字段与 Bearer 正确", async () => {
  const orig = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
  try {
    initHttp("http://game.invalid:2568");
    assert.throws(() => initPortal(""), /portalUrl 必填/, "空 Portal 必须启动失败，⛔ 不得跟随游戏服");
    assert.throws(() => getPortalUrl(), /尚未初始化/);
    assert.throws(() => initPortal("ws://portal.invalid"), /http\(s\)/);

    assert.throws(
      () => initPortal("https://portal.example.com///"),
      /portalUrl 必填/,
      "多重尾斜杠必须被拒绝，避免不同端点规范化规则分叉",
    );
    initPortal("https://portal.example.com/");
    assert.equal(getPortalUrl(), "https://portal.example.com", "单尾斜杠可规范化，不改写为游戏服地址");

    FakeXhr.nextStatus = 200;
    FakeXhr.nextBody = `{"userId":"u_1","accessToken":"opaque","isNewAccount":true}`;
    const login = await devLogin("dev_1", 107, "device-1");
    assert.deepEqual(login, { userId: "u_1", accessToken: "opaque", isNewAccount: true });
    assert.equal(FakeXhr.lastMethod, "POST");
    assert.equal(FakeXhr.lastUrl, "https://portal.example.com/v1/sessions/dev");
    assert.deepEqual(JSON.parse(String(FakeXhr.lastBody)), {
      devKey: "dev_1",
      serverId: 107,
      deviceId: "device-1",
    });

    FakeXhr.nextBody = `{"userId":"u_2","accessToken":"opaque2","isNewAccount":false}`;
    await wxLogin("wx-code", 7);
    assert.equal(FakeXhr.lastUrl, "https://portal.example.com/v1/sessions/wechat");
    assert.deepEqual(JSON.parse(String(FakeXhr.lastBody)), { code: "wx-code", serverId: 7 });

    setToken("opaque2");
    FakeXhr.nextBody = `{"isOps":false,"hash":"h","servers":[],"myServerIds":[]}`;
    await fetchAreaList();
    assert.equal(FakeXhr.lastMethod, "GET");
    assert.equal(FakeXhr.lastUrl, "https://portal.example.com/v1/areas");
    assert.equal(FakeXhr.lastBody, undefined, "GET /v1/areas 不发送旧版 token body");
    assert.equal(FakeXhr.lastHeaders.Authorization, "Bearer opaque2");
  } finally {
    setToken("");
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
  }
});

test("HTTP runtime contract：2xx 缺字段/多字段/非法 URL 与未登记 endpoint 均在发包前失败", async () => {
  const orig = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
  try {
    initHttp("http://game.invalid:2568");
    initPortal("https://portal.example.com");
    setToken("stale-token");

    FakeXhr.nextStatus = 200;
    FakeXhr.nextBody = `{"userId":"u1","accessToken":"t1"}`; // 缺 isNewAccount
    const missing = await devLogin("dev", 1).then(() => null, (e: unknown) => e) as { code?: string };
    assert.equal(missing.code, "INVALID_RESPONSE");
    assert.equal(FakeXhr.lastHeaders.Authorization, undefined, "登录请求不得携带旧 Bearer");

    FakeXhr.nextBody = `{"userId":"u1","accessToken":"t1","isNewAccount":false,"extra":1}`;
    const extra = await devLogin("dev", 1).then(() => null, (e: unknown) => e) as { code?: string };
    assert.equal(extra.code, "INVALID_RESPONSE");

    FakeXhr.nextBody = JSON.stringify({
      hash: "h1", isOps: false, myServerIds: [1],
      servers: [{ serverId: 1, name: "一区", status: "smooth", tag: "normal", openTime: 0,
        gameHttpUrl: "https://game.example.com:2568", gameWsUrl: "wss://game.example.com:2568" }],
    });
    const areas = await fetchAreaList();
    assert.equal(areas.servers[0]?.serverId, 1);

    FakeXhr.nextBody = JSON.stringify({
      hash: "h1", isOps: false, myServerIds: [],
      servers: [{ serverId: 1, name: "一区", status: "smooth", tag: "normal", openTime: 0,
        gameHttpUrl: "https://game.example.com/path", gameWsUrl: "wss://game.example.com:2568" }],
    });
    const badUrl = await fetchAreaList().then(() => null, (e: unknown) => e) as { code?: string };
    assert.equal(badUrl.code, "INVALID_RESPONSE");

    await assert.rejects(request("GET", "/unknown"), /未登记/);
    await assert.rejects(devLogin("", 1), /请求契约非法/);
    assert.throws(() => initHttp("https://game.example.com/game"), /origin/);
    assert.throws(() => initPortal("file:///tmp/portal"), /origin/);
  } finally {
    setToken("");
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
  }
});
