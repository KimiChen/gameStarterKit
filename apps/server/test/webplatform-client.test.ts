import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { after, test } from "node:test";

interface SeenRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

const seen: SeenRequest[] = [];
let retryHits = 0;

const mock = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  let body: unknown;
  try {
    body = raw === "" ? undefined : JSON.parse(raw) as unknown;
  } catch {
    body = raw;
  }
  seen.push({
    method: req.method ?? "",
    url: req.url ?? "",
    headers: req.headers,
    body,
  });

  const json = (status: number, value: unknown): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(value));
  };

  if (req.url === "/v1/internal/sessions/verify" && typeof body === "object" && body !== null) {
    const token = String((body as Record<string, unknown>).accessToken ?? "");
    if (token === "retry-token") {
      retryHits++;
      if (retryHits === 1) {
        res.statusCode = 503;
        res.end("busy");
        return;
      }
      json(200, { valid: true, userId: "retry-user", issuedAtMs: 102 });
      return;
    }
    if (token === "bad-schema") {
      json(200, { valid: true, userId: "schema-user", issuedAtMs: 103, extra: true });
      return;
    }
    if (token === "service-401") {
      json(401, { code: "INVALID_SERVICE_CREDENTIALS" });
      return;
    }
    if (token === "slow-token") {
      // client AbortSignal 会主动断开；不回包用于验证总请求预算与错误分类。
      return;
    }
    if (token === "invalid-token") {
      json(200, { valid: false, reason: "MISMATCH" });
      return;
    }
    json(200, { valid: true, userId: "http-user", issuedAtMs: 101 });
    return;
  }

  if (req.url?.startsWith("/v1/internal/characters/")) {
    if (req.method === "PUT") {
      json(200, { registered: true });
    } else if (req.method === "GET") {
      json(200, { exists: true });
    } else {
      json(405, {});
    }
    return;
  }

  json(404, {});
});

await new Promise<void>((resolve, reject) => {
  mock.once("error", reject);
  mock.listen(0, "127.0.0.1", () => resolve());
});
const address = mock.address();
if (!address || typeof address === "string") {
  throw new Error("WebPlatform mock 未取得 TCP 端口");
}

process.env.NODE_ENV = "test";
process.env.WEBPLATFORM_INTERNAL_URL = `http://127.0.0.1:${address.port}`;
process.env.WEBPLATFORM_SERVICE_ID = "game-server-test";
process.env.WEBPLATFORM_SERVICE_SECRET = "test-service-secret";
// ⚠ 与 webplatform-breaker-isolation.test.ts 的 fb777ce 同类，但**不能照抄那边的处方**：
// 那个文件里超时是无关变量，这里不是——「slow-token」用例（不回包）正是靠 REQUEST_TIMEOUT
// 触发来验证请求预算与错误分类，所以不能一味放大。
//
// 取值按两条约束平衡：① CONNECT 40ms 是对**本地已监听 socket** 建连的预算，进程一被调度走
// 就可能越过它，成功路径的用例因此假红——这是全文最脆的数字；② REQUEST 决定 slow-token
// 用例的等待成本——它是跨 attempt 的**总预算**（deadline 制：attempt 0 耗尽预算后，
// attempt 1 拿 remaining≤0 直接 break），等待 ≈ 1× 而非 2×。取 800/1000：建连余量 ×20、
// 成功往返余量 ×8，而 slow-token 由 ~0.12s 变 ~1s（实测整文件 ~1.6s），代价可接受。
// ⛔ 不要为了跑得快调回几十毫秒。
process.env.WEBPLATFORM_CONNECT_TIMEOUT_MS = "800";
process.env.WEBPLATFORM_REQUEST_TIMEOUT_MS = "1000";
process.env.WEBPLATFORM_BREAKER_FAILURES = "100";

const clientModule = await import("../src/platform/webPlatformClient");
const { toErrCode } = await import("../src/core/errors");
const {
  AuthRequiredError,
} = await import("../src/core/errors");

after(async () => {
  clientModule.closeWebPlatformClient();
  await new Promise<void>((resolve, reject) => {
    mock.close((error) => error ? reject(error) : resolve());
  });
});

test("WebPlatformClient：test delegate 可恢复，生产默认仍走真实 HTTP", async () => {
  let fakeCalls = 0;
  const restore = clientModule.installWebPlatformClientForTests({
    async verify() {
      fakeCalls++;
      return { userId: "fake-user", issuedAtMs: 1 };
    },
    async registerCharacter() {},
    async hasCharacter() { return false; },
  });
  assert.deepEqual(
    await clientModule.webPlatformClient.verify("anything", 1),
    { userId: "fake-user", issuedAtMs: 1 },
  );
  assert.equal(fakeCalls, 1);
  restore();
  restore(); // 幂等恢复

  const before = seen.length;
  assert.deepEqual(
    await clientModule.webPlatformClient.verify("header-token", 7),
    { userId: "http-user", issuedAtMs: 101 },
  );
  assert.equal(seen.length, before + 1, "恢复后 facade 重新走 HTTP 默认实现");

  process.env.NODE_ENV = "production";
  assert.throws(
    () => clientModule.installWebPlatformClientForTests({
      verify: async () => ({ userId: "x", issuedAtMs: 1 }),
      registerCharacter: async () => {},
      hasCharacter: async () => false,
    }),
    /生产环境禁止注入/,
  );
  process.env.NODE_ENV = "test";
});

test("WebPlatformClient：服务身份头、request-id、请求 body 与 character 路径正确", async () => {
  seen.length = 0;
  await clientModule.webPlatformClient.verify("header-token", 7);
  assert.equal(seen.length, 1);
  const verify = seen[0];
  assert.equal(verify.method, "POST");
  assert.equal(verify.url, "/v1/internal/sessions/verify");
  assert.deepEqual(verify.body, { accessToken: "header-token", serverId: 7 });
  assert.equal(verify.headers["x-service-id"], "game-server-test");
  assert.equal(verify.headers["x-service-secret"], "test-service-secret");
  assert.match(String(verify.headers["x-request-id"]), /^[0-9a-f-]{36}$/);

  await clientModule.webPlatformClient.registerCharacter("u /汉", 9);
  assert.equal(
    seen.at(-1)?.url,
    "/v1/internal/characters/u%20%2F%E6%B1%89/9",
    "userId 必须按单个 path segment 编码",
  );
  assert.equal(seen.at(-1)?.method, "PUT");
  assert.equal(await clientModule.webPlatformClient.hasCharacter("u /汉", 9), true);
  assert.equal(seen.at(-1)?.method, "GET");
});

test("WebPlatformClient：503 仅重试一次，且两次复用同一 request-id", async () => {
  seen.length = 0;
  retryHits = 0;
  assert.deepEqual(
    await clientModule.webPlatformClient.verify("retry-token", 2),
    { userId: "retry-user", issuedAtMs: 102 },
  );
  assert.equal(retryHits, 2);
  assert.equal(seen.length, 2);
  assert.equal(
    seen[0].headers["x-request-id"],
    seen[1].headers["x-request-id"],
    "一次逻辑调用的 retry 必须复用 request-id",
  );
});

test("WebPlatformClient：HTTP 200 响应仍做严格 schema 校验", async () => {
  await assert.rejects(
    clientModule.webPlatformClient.verify("bad-schema", 3),
    (error: unknown) =>
      error instanceof clientModule.WebPlatformContractError
      && toErrCode(error) === "INTERNAL",
  );
});

test("WebPlatformClient：只有 valid:false 是玩家鉴权失败", async () => {
  await assert.rejects(
    clientModule.webPlatformClient.verify("invalid-token", 3),
    (error: unknown) =>
      error instanceof AuthRequiredError
      && toErrCode(error) === "AUTH_REQUIRED",
  );
});

test("WebPlatformClient：401 与请求超时保持 INTERNAL，不谎报 token 无效", async () => {
  await assert.rejects(
    clientModule.webPlatformClient.verify("service-401", 4),
    (error: unknown) =>
      error instanceof clientModule.WebPlatformServiceError
      && toErrCode(error) === "INTERNAL",
  );
  await assert.rejects(
    clientModule.webPlatformClient.verify("slow-token", 4),
    (error: unknown) =>
      error instanceof clientModule.WebPlatformUnavailableError
      && toErrCode(error) === "INTERNAL",
  );
});
