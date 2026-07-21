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
