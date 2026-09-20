/**
 * /admin/notice（MMO MF6a-B5）单测：shared 契约（request / response exact）+ 端点密钥 fail-closed + 经总线发布（⛔ 不本地直投）。
 * 到达两节点同区在线的集成断言在 test/int/push-bus.test.ts。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { GameHttpContractMap } from "@game/shared";
import endpoint from "../src/http/admin/notice";
import { validateGameHttpRequest, validateGameHttpResponse } from "../src/http/contract";
import { _pushBusTestHooks, parsePushFields } from "../src/core/push/pushBus";

test("AdminNotice 契约：request exact（sId 0..65535、text 1..4096）；response exact（published 布尔）", () => {
  assert.deepEqual(validateGameHttpRequest("AdminNotice", { sId: 1, text: "维护公告" }), { sId: 1, text: "维护公告" });
  assert.throws(() => validateGameHttpRequest("AdminNotice", { sId: 1, text: "x", extra: 1 }), /WIRE_KEYS/u);
  assert.throws(() => validateGameHttpRequest("AdminNotice", { sId: 70000, text: "x" }), /WIRE_INTEGER/u);
  assert.throws(() => validateGameHttpRequest("AdminNotice", { sId: 1, text: "" }), /WIRE_STRING/u);
  assert.deepEqual(validateGameHttpResponse("AdminNotice", { published: true }), { published: true });
  assert.throws(() => validateGameHttpResponse("AdminNotice", { published: "yes" }), /HTTP_BOOLEAN/u);
  assert.equal(GameHttpContractMap.AdminNotice.method, "POST");
  assert.equal(GameHttpContractMap.AdminNotice.path, "/admin/notice");
  assert.strictEqual(endpoint.options.body, GameHttpContractMap.AdminNotice.requestSchema, "必须直接安装 shared 生成的 request schema");
});

test("AdminNotice 端点：未配置 / 错密钥 401（fail-closed）；正确密钥经总线发布 kind=realm", async () => {
  const captured: string[][] = [];
  _pushBusTestHooks.publish = { xadd: async (f) => { captured.push([...f]); }, now: () => 1_700_000_000_000 };
  const previous = process.env.ADMIN_API_SECRET;
  try {
    delete process.env.ADMIN_API_SECRET;
    await assert.rejects(
      endpoint({ body: { sId: 1, text: "x" }, headers: new Headers({ "x-admin-secret": "anything" }) } as never),
      (e: unknown) => e instanceof Error && /401|AUTH_REQUIRED/u.test(`${(e as { status?: unknown }).status ?? ""}${e.message}`),
      "未配置密钥即端点关闭",
    );
    process.env.ADMIN_API_SECRET = "s3cr3t";
    await assert.rejects(
      endpoint({ body: { sId: 1, text: "x" }, headers: new Headers({ "x-admin-secret": "wrong" }) } as never),
      (e: unknown) => e instanceof Error,
      "错密钥拒绝",
    );
    assert.deepEqual(captured, [], "被拒的请求不得发布");
    const res = await endpoint({ body: { sId: 3, text: "维护" }, headers: new Headers({ "x-admin-secret": "s3cr3t" }) } as never);
    assert.deepEqual(res, { published: true });
    assert.equal(captured.length, 1);
    const entry = parsePushFields(captured[0]);
    assert.deepEqual({ kind: entry?.kind, sId: entry?.sId, type: entry?.type, data: entry?.data }, { kind: "realm", sId: 3, type: "server.notice", data: { text: "维护" } });
  } finally {
    delete _pushBusTestHooks.publish;
    if (previous === undefined) delete process.env.ADMIN_API_SECRET; else process.env.ADMIN_API_SECRET = previous;
  }
});
