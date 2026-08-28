import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  createOrderedProducerStopper,
  installShutdownAggregator,
  runShutdownCleanup,
  type ShutdownAggregatorDependencies,
  type ShutdownHost,
} from "../src/shutdown";

type Callback = () => void | Promise<unknown>;

function fakeHost(): {
  host: ShutdownHost;
  before: Callback[];
  after: Callback[];
} {
  const before: Callback[] = [];
  const after: Callback[] = [];
  return {
    before,
    after,
    host: {
      onBeforeShutdown: (callback) => { before.push(callback); },
      onShutdown: (callback) => { after.push(callback); },
    },
  };
}

test("顶层 shutdown aggregator：只占用一对槽位并按停服顺序执行", async () => {
  const fake = fakeHost();
  const events: string[] = [];
  let releaseProducers!: () => void;
  const producersStopped = new Promise<void>((resolve) => { releaseProducers = resolve; });
  let finishCalls = 0;
  const deps: ShutdownAggregatorDependencies = {
    beginShutdown: () => { events.push("begin"); },
    clearCharacterReadyFlights: () => { events.push("clear-ready"); },
    stopBackgroundProducers: async () => {
      events.push("stop-producers:start");
      await producersStopped;
      events.push("stop-producers:done");
    },
    finishShutdown: async () => {
      finishCalls++;
      events.push("finish");
    },
  };

  installShutdownAggregator(fake.host, deps);
  assert.equal(fake.before.length, 1, "必须只注册一个 onBeforeShutdown");
  assert.equal(fake.after.length, 1, "必须只注册一个 onShutdown");

  const beforeResult = fake.before[0]!();
  assert.ok(beforeResult instanceof Promise);
  assert.deepEqual(events, ["begin", "clear-ready", "stop-producers:start"]);
  assert.equal(finishCalls, 0, "房间尚未释放时不得提前执行最终清理");

  releaseProducers();
  await beforeResult;
  assert.deepEqual(events, [
    "begin",
    "clear-ready",
    "stop-producers:start",
    "stop-producers:done",
  ]);

  const afterResult = fake.after[0]!();
  assert.ok(afterResult instanceof Promise);
  await afterResult;
  assert.equal(finishCalls, 1);
  assert.deepEqual(events, [
    "begin",
    "clear-ready",
    "stop-producers:start",
    "stop-producers:done",
    "finish",
  ]);
});

test("顶层 shutdown aggregator：before 回调先同步关闸且返回 producer drain", async () => {
  const fake = fakeHost();
  const events: string[] = [];
  let resolve!: () => void;
  const drain = new Promise<void>((r) => { resolve = r; });
  const deps: ShutdownAggregatorDependencies = {
    beginShutdown: () => { events.push("begin"); },
    clearCharacterReadyFlights: () => { events.push("clear"); },
    stopBackgroundProducers: () => {
      events.push("stop");
      return drain;
    },
    finishShutdown: async () => { events.push("finish"); },
  };
  installShutdownAggregator(fake.host, deps);

  const returned = fake.before[0]!();
  assert.strictEqual(returned, drain, "before 回调必须把 producer drain 交给 Colyseus await");
  assert.deepEqual(events, ["begin", "clear", "stop"]);
  resolve();
  await returned;
});

test("producer stopper：按入口声明顺序逐个停止、异常隔离且幂等", async () => {
  const events: string[] = [];
  const stop = createOrderedProducerStopper([
    { name: "infra-monitors", stop: async () => { events.push("infra:start"); events.push("infra:done"); } },
    { name: "stream-depth-alert", stop: async () => { events.push("stream"); throw new Error("stream down"); } },
    { name: "kick-consumer", stop: () => { events.push("kick"); } },
    { name: "character-repair", stop: () => { events.push("repair"); } },
    { name: "mailwake", stop: () => { events.push("mailwake"); } },
  ], (name) => { events.push(`${name}:error`); });

  const first = stop();
  const second = stop();
  assert.strictEqual(first, second, "重复调用必须共享同一个 drain Promise");
  await first;
  assert.deepEqual(events, [
    "infra:start", "infra:done",
    "stream", "stream-depth-alert:error",
    "kick", "repair", "mailwake",
  ]);
});

test("最终 cleanup：producer 完成后按 character-ready → tasks → resources 顺序执行", async () => {
  const events: string[] = [];
  await runShutdownCleanup(
    async () => { events.push("producers"); },
    [
      { name: "character-ready", work: () => { events.push("character-ready"); } },
      { name: "detached-tasks", work: async () => { events.push("detached-tasks"); throw new Error("ignored"); } },
      { name: "registered-resources", work: () => { events.push("registered-resources"); } },
    ],
    (name) => { events.push(`${name}:error`); },
  );
  assert.deepEqual(events, [
    "producers",
    "character-ready",
    "detached-tasks", "detached-tasks:error",
    "registered-resources",
  ]);
});

test("shutdown aggregator：同一 Server 禁止重复注册第二个 onBeforeShutdown", () => {
  const fake = fakeHost();
  const deps: ShutdownAggregatorDependencies = {
    beginShutdown: () => {},
    clearCharacterReadyFlights: () => {},
    stopBackgroundProducers: async () => {},
    finishShutdown: async () => {},
  };
  installShutdownAggregator(fake.host, deps);
  assert.throws(() => installShutdownAggregator(fake.host, deps), /已在该 Server 上注册/);
  assert.equal(fake.before.length, 1);
  assert.equal(fake.after.length, 1);
});

test("真实 Colyseus Server：listen 后 gracefullyShutdown(false) 关闭底层句柄并正常返回", () => {
  const script = `
    import { Server } from "@colyseus/core";
    import { WebSocketTransport } from "@colyseus/ws-transport";
    const server = new Server({
      transport: new WebSocketTransport(),
      gracefullyShutdown: false,
      greet: false,
    });
    await server.listen(0);
    const listening = server.transport.server?.address() !== null;
    await server.gracefullyShutdown(false);
    const closed = server.transport.server?.address() === null;
    process.stdout.write(JSON.stringify({ listening, closed }));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, NODE_ENV: "test" },
  });
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { listening: true, closed: true });
});
