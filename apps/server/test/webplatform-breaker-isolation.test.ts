/**
 * 熔断器按路由族隔离的定向反例。
 *
 * 共用一个熔断器时，character 路由族的故障会推开它，连带让 `onAuth` 的 session verify 一起被拒
 * ——故障面从「回访热档用户的角色复核」放大成「所有人无法登录」。本用例把 character 打到熔断，
 * 再断言 session **仍然可用**。
 *
 * 单独一个文件是必需的：`WEBPLATFORM_BREAKER_FAILURES` 在 client 模块加载期读一次，
 * 而 `webplatform-client.test.ts` 把它设成 100（等于关掉熔断）。`node --test` 每个文件一个
 * 子进程，所以这里能拥有自己的阈值与自己的模块实例。
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";

let characterHits = 0;
let sessionHits = 0;

const mock = createServer(async (req, res) => {
  for await (const chunk of req) { void chunk; }
  const url = req.url ?? "";
  if (url.startsWith("/v1/internal/sessions/verify")) {
    sessionHits++;
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ valid: true, userId: "session-user", issuedAtMs: 1 }));
    return;
  }
  // character 路由族：永远 503，用来把它自己的熔断器打开。
  characterHits++;
  res.statusCode = 503;
  res.end("character down");
});

const address = await new Promise<{ port: number }>((resolve) => {
  mock.listen(0, "127.0.0.1", () => resolve(mock.address() as { port: number }));
});

process.env.NODE_ENV = "test";
process.env.WEBPLATFORM_INTERNAL_URL = `http://127.0.0.1:${address.port}`;
process.env.WEBPLATFORM_SERVICE_ID = "game-server-test";
process.env.WEBPLATFORM_SERVICE_SECRET = "test-service-secret";
// ⚠ 超时值对本用例是**无关变量**：熔断由 mock 的 503 响应驱动，全文没有任何断言依赖超时发生
// （证据：**代码里**对这两个环境变量的出现只有下面两行赋值，没有任何读取或断言引用它们。
//   ⛔ 这里刻意不再写「跑某条 grep 得到 N 处命中」——同一个坑本仓已经栽过四次：
//   写死的命令要么匹配到注释自己（`grep -n 超时` / 宽 `grep -n TIMEOUT_MS`），
//   要么窄到证不了所主张的事（`grep -nE 'TIMEOUT_MS = "[0-9]+"'` 只能命中赋值行，
//   对 `process.env.XXX_TIMEOUT_MS` 这类非赋值引用 0 命中）。
//   更要命的是**计数会被注释自身改变**：上一版把命中数写成 3，而补上这段解释后就变成 5。
//   结论：注释里陈述事实，不内联一条会被自己扰动的计数命令。）
// 而 40ms/120ms 是文件里仅有的负载敏感数字——全量套件下
// 每个测试文件是独立进程，机器一忙进程被调度走，本地 socket 的 connect 回调就可能晚于 40ms 定时器，
// 于是 session verify 被打成超时、`sessionHits` 断言失败。放宽到不会误伤的量级；mock 是本地即时
// 响应，用例耗时不受影响。⛔ 不要为了「跑得快」再把它们调回几十毫秒。
process.env.WEBPLATFORM_CONNECT_TIMEOUT_MS = "2000";
process.env.WEBPLATFORM_REQUEST_TIMEOUT_MS = "5000";
// 阈值压到 1，且开启窗口足够长，保证后续调用一定撞在开启态上。
process.env.WEBPLATFORM_BREAKER_FAILURES = "1";
process.env.WEBPLATFORM_BREAKER_OPEN_MS = "60000";

const clientModule = await import("../src/platform/webPlatformClient");

after(async () => {
  clientModule.closeWebPlatformClient();
  await new Promise<void>((resolve, reject) => {
    mock.close((error) => error ? reject(error) : resolve());
  });
});

test("character 路由熔断不得波及 session verify", async () => {
  // 1. 把 character 族打到熔断开启。
  await assert.rejects(clientModule.webPlatformClient.hasCharacter("u1", 1));
  const hitsAfterOpen = characterHits;

  // 2. 熔断已开：后续 character 调用不再产生真实请求（这是「熔断器确实开了」的证据，
  //    否则下面 session 的绿灯可能只是因为熔断压根没触发）。
  await assert.rejects(clientModule.webPlatformClient.hasCharacter("u2", 1));
  assert.equal(
    characterHits,
    hitsAfterOpen,
    "character 熔断开启后不应再打真实请求——否则本用例没有真的进入熔断态",
  );

  // 3. 关键断言：session 族必须仍然可用。共用熔断器时这里会抛。
  const sessionBefore = sessionHits;
  const verified = await clientModule.webPlatformClient.verify("token", 1);
  assert.deepEqual(verified, { userId: "session-user", issuedAtMs: 1 });
  assert.equal(sessionHits, sessionBefore + 1, "session verify 必须真的打到了 WebPlatform");
});
