import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import { GameHttpContractMap, WireValidationError } from "@game/shared";
import {
  createGameEndpoint,
  validateGameHttpRequest,
  validateGameHttpResponse,
} from "../src/http/contract";

function assertStableWireError(run: () => unknown): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof WireValidationError);
    assert.doesNotMatch(error.message, /hostile/);
    return true;
  });
}

test("HTTP response adapter validates plain handler output before serialization", async () => {
  const endpoint = createGameEndpoint("Health", { method: "GET" }, async () => ({
    status: "ok",
    serverTime: 1,
    version: "1",
    extra: true,
  }));

  await assert.rejects(() => endpoint({}), /WIRE_KEYS/);
  assert.deepEqual(
    validateGameHttpResponse("Health", { status: "ok", serverTime: 1, version: "1" }),
    { status: "ok", serverTime: 1, version: "1" },
  );
});

test("HTTP response adapter validates ctx.json body and keeps Better-Call marker", async () => {
  const malformed = createGameEndpoint("ClockNow", { method: "GET" }, async (ctx) =>
    ctx.json({ serverTime: Number.NaN }));
  await assert.rejects(() => malformed({ asResponse: true }), /WIRE_INTEGER/);

  const endpoint = createGameEndpoint("ClockNow", { method: "GET" }, async (ctx) =>
    ctx.json({ serverTime: 42 }));

  const response = await endpoint({ asResponse: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { serverTime: 42 });
});

test("HTTP response adapter preserves a Better-Call Response override while validating JSON", async () => {
  const routerResponse = new Response("custom body", {
    status: 202,
    headers: { "x-contract-test": "ok" },
  });
  const endpoint = createGameEndpoint("ClockNow", { method: "GET" }, async (ctx) =>
    ctx.json({ serverTime: 42 }, routerResponse));

  const response = await endpoint({ asResponse: true });
  assert.equal(response, routerResponse, "Better-Call should return the supplied Response instance");
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("x-contract-test"), "ok");
  assert.equal(await response.text(), "custom body");

  const malformed = createGameEndpoint("ClockNow", { method: "GET" }, async (ctx) =>
    ctx.json({ serverTime: Number.NaN }, new Response("ignored", { status: 202 })));
  await assert.rejects(() => malformed({ asResponse: true }), /WIRE_INTEGER/);
});

test("HTTP response adapter preserves a cross-realm Response override", async () => {
  // A browser iframe/worker has a different Response prototype.  Construct a
  // Response-shaped object in a separate VM realm so this test does not rely
  // on the host realm's `instanceof` behavior.
  const foreignResponse = vm.runInNewContext(`(() => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("foreign body"));
        controller.close();
      },
    });
    return {
      body,
      headers: new Headers([["x-contract-test", "foreign"]]),
      status: 203,
      statusText: "Non-Authoritative Information",
      text() { return Promise.resolve("foreign body"); },
      [Symbol.toStringTag]: "Response",
    };
  })()`, { Headers, ReadableStream, TextEncoder });

  assert.equal(foreignResponse instanceof Response, false);
  const endpoint = createGameEndpoint("ClockNow", { method: "GET" }, async (ctx) =>
    ctx.json({ serverTime: 42 }, foreignResponse));

  const response = await endpoint({ asResponse: true });
  assert.equal(response.status, 203);
  assert.equal(response.statusText, "Non-Authoritative Information");
  assert.equal(response.headers.get("x-contract-test"), "foreign");
  assert.equal(await response.text(), "foreign body");
});

test("HTTP response adapter passes returned APIError through unchanged", async () => {
  const endpoint = createGameEndpoint("Health", { method: "GET" }, async (ctx) =>
    ctx.error(401, { code: "AUTH_REQUIRED" }));

  const result = await endpoint({});
  assert.equal(result.name, "APIError");
  assert.equal(result.statusCode, 401);
  assert.deepEqual(result.body, { code: "AUTH_REQUIRED" });
});

test("HTTP response adapter contains hostile marker and APIError probes", () => {
  const hostileName = {};
  Object.defineProperty(hostileName, "name", {
    get(): never { throw new Error("hostile name getter"); },
  });
  assertStableWireError(() => validateGameHttpResponse("Health", hostileName));

  const hostileFlag = {};
  Object.defineProperty(hostileFlag, "_flag", {
    get(): never { throw new Error("hostile flag getter"); },
  });
  assertStableWireError(() => validateGameHttpResponse("Health", hostileFlag));

  const hostileBody = { _flag: "json" };
  Object.defineProperty(hostileBody, "body", {
    enumerable: true,
    get(): never { throw new Error("hostile body getter"); },
  });
  assertStableWireError(() => validateGameHttpResponse("Health", hostileBody));

  const hostileSpread = {
    _flag: "json",
    body: { status: "ok", serverTime: 1, version: "1" },
  };
  Object.defineProperty(hostileSpread, "extra", {
    enumerable: true,
    get(): never { throw new Error("hostile spread getter"); },
  });
  assert.deepEqual(validateGameHttpResponse("Health", hostileSpread), {
    _flag: "json",
    body: { status: "ok", serverTime: 1, version: "1" },
  });

  assertStableWireError(() => validateGameHttpResponse("Health", {
    name: "APIError",
    statusCode: 200,
    body: { arbitrary: true },
  }));
  const fakeError = Object.assign(new Error("fake"), {
    name: "APIError",
    statusCode: 200,
    body: { arbitrary: true },
  });
  assertStableWireError(() => validateGameHttpResponse("Health", fakeError));
});

test("HTTP endpoint executes the shared request contract before its handler", async () => {
  assert.deepEqual(validateGameHttpRequest("AdminKick", { uid: "u1" }), { uid: "u1" });

  let called = false;
  const endpoint = createGameEndpoint("AdminKick", {
    method: "POST",
  }, async () => {
    called = true;
    return { kicked: false };
  });
  assert.strictEqual(endpoint.options.body, GameHttpContractMap.AdminKick.requestSchema);

  await assert.rejects(
    () => endpoint({ body: { uid: "u1", extra: true } }),
    /WIRE_KEYS at request/,
  );
  assert.equal(called, false);
  assert.deepEqual(await endpoint({ body: { uid: "u1" } }), { kicked: false });
  assert.equal(called, true);
});

test("HTTP endpoint 对 GET 也执行 shared 请求契约：非空 body 必须在 handler 前被拒", async () => {
  let called = false;
  const endpoint = createGameEndpoint("Health", { method: "GET" }, async () => {
    called = true;
    return { status: "ok", serverTime: 1, version: "1" };
  });
  // Better-Call 禁止 GET 带 body schema，因此 GET 的请求侧唯一校验就是 endpoint 内部那次
  // validateGameHttpRequest（对 GET 即 shared 的 validateNoBody）；少了它 GET 会静默接受任意 body。
  assert.equal(endpoint.options.body, undefined);

  await assert.rejects(() => endpoint({ body: { x: 1 } }), /WIRE_KEYS at request/);
  assert.equal(called, false, "GET 的非法 body 必须在 handler 之前被拒");

  assert.deepEqual(await endpoint({}), { status: "ok", serverTime: 1, version: "1" });
  assert.equal(called, true);
});

test("HTTP endpoint 类型级禁止 endpoint options 另带 body schema", () => {
  // 编译期反例：`GameEndpointOptions` 的 `body?: never` 必须让下面这次调用报错。
  // 一旦该约束被移除（例如把 options 类型改回 EndpointOptions），@ts-expect-error 会因为
  // 「未报错」而让 `npm --workspace @game/server run typecheck` 变红。
  assert.throws(
    () => createGameEndpoint("AdminKick", {
      method: "POST",
      // @ts-expect-error endpoint options 不得另带 body schema：body 由 shared contract 单源生成
      body: GameHttpContractMap.AdminKick.requestSchema,
    }, async () => ({ kicked: false })),
    /body schema 由 shared contract 生成.*不得覆盖/,
  );
});

test("HTTP endpoint rejects route-local strip/coercion schemas instead of composing a second request source", async () => {
  const wideningSchema = {
    "~standard": {
      version: 1 as const,
      vendor: "test-widening-schema",
      validate: () => ({ value: { uid: "rewritten" } }),
    },
  };
  assert.throws(
    () => createGameEndpoint("AdminKick", {
      method: "POST",
      body: wideningSchema,
    } as never, async () => ({ kicked: false })),
    /body schema 由 shared contract 生成.*不得覆盖/,
  );

  const endpoint = createGameEndpoint("PayWxNotify", { method: "POST" }, async () => ({ code: "SUCCESS" }));
  assert.strictEqual(endpoint.options.body, GameHttpContractMap.PayWxNotify.requestSchema);

  await assert.rejects(
    () => endpoint({ body: { orderId: "o", wxTxnId: "w", amountFen: "1" } }),
    /WIRE_INTEGER at request.amountFen/,
  );
});
