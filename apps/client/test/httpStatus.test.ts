/**
 * core/http.ts 状态码守门：非 2xx 必须 reject——onload 只代表「收到了响应」，
 * 401/403/429/500 的 JSON 错误体若被当正常数据 resolve，业务层会拿着错误对象继续跑
 * （曾是真实 bug：HTTP 500 被当成功数据）。用假 XHR 注入各状态码验证。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { request } from "../src/core/http";

/** 可编程假 XHR：send 后同步触发 onload，按预设 status/body 回放 */
class FakeXhr {
  static nextStatus = 200;
  static nextBody = "{}";
  status = 0;
  responseText = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open(_m: string, _u: string): void { /* noop */ }
  setRequestHeader(_k: string, _v: string): void { /* noop */ }
  send(_body?: unknown): void {
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
    FakeXhr.nextBody = `{"code":0,"data":{"ok":1}}`;
    assert.deepEqual(await request("GET", "/x"), { code: 0, data: { ok: 1 } });

    for (const bad of [401, 403, 429, 500]) {
      FakeXhr.nextStatus = bad;
      FakeXhr.nextBody = `{"error":"boom"}`; // 合法 JSON 的错误体——正是曾被误吞的形态
      await assert.rejects(request("GET", "/x"), new RegExp(`HTTP ${bad}`),
        `${bad} 应 reject 而非把错误体当数据`);
    }

    FakeXhr.nextStatus = 200;
    FakeXhr.nextBody = "not-json";
    await assert.rejects(request("GET", "/x"), /解析失败/);
  } finally {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
  }
});

test("http：非 2xx 带出可判别的 status/code（业务层靠字段分流，⛔ 不靠正则抠 message）", async () => {
  const orig = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
  try {
    // 409 BUSY：LoginLogic 据此做单次退避重试并改文案（评审 [11]）——码必须原样带到业务层
    FakeXhr.nextStatus = 409;
    FakeXhr.nextBody = `{"error":"BUSY"}`;
    const e = await request("GET", "/x").then(() => null, (x: unknown) => x) as { status?: number; code?: string };
    assert.equal(e.status, 409);
    assert.equal(e.code, "BUSY", "端点 { error } 体必须解成 code 字段");

    // 非 JSON / 无 error 字段的错误体 → code 空串，status 仍可用（⛔ 解析失败不得反过来吃掉错误）
    FakeXhr.nextStatus = 502;
    FakeXhr.nextBody = "<html>bad gateway</html>";
    const g = await request("GET", "/x").then(() => null, (x: unknown) => x) as { status?: number; code?: string };
    assert.equal(g.status, 502);
    assert.equal(g.code, "");
  } finally {
    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
  }
});
