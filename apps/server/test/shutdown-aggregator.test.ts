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

test("真实 Colyseus Server：活动 Room 在 before 与 after shutdown 之间完成排空", () => {
  const shutdownModuleUrl = new URL("../src/shutdown.ts", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import { Client } from "@colyseus/sdk";
    import { matchMaker, Room, Server } from "@colyseus/core";
    import { WebSocketTransport } from "@colyseus/ws-transport";
    const { installShutdownAggregator } = await import(${JSON.stringify(shutdownModuleUrl)});

    const events = [];
    let disposeCalls = 0;
    let releaseDispose;
    let markDisposeStarted;
    const disposeGate = new Promise((resolve) => { releaseDispose = resolve; });
    const disposeStarted = new Promise((resolve) => { markDisposeStarted = resolve; });

    class ShutdownProbeRoom extends Room {
      onCreate() {
        this.autoDispose = false;
        events.push("room-created");
      }

      onJoin() {
        events.push("room-joined");
      }

      onLeave() {
        events.push("room-left");
      }

      async onDispose() {
        disposeCalls++;
        events.push("room-dispose-start");
        markDisposeStarted();
        await disposeGate;
        events.push("room-dispose-done");
      }
    }

    const server = new Server({
      transport: new WebSocketTransport(),
      gracefullyShutdown: false,
      greet: false,
      devMode: false,
    });
    server.define("shutdown-probe", ShutdownProbeRoom);
    installShutdownAggregator(server, {
      beginShutdown: () => { events.push("before-start"); },
      clearCharacterReadyFlights: () => { events.push("before-clear-ready"); },
      stopBackgroundProducers: async () => {
        events.push("before-producers-start");
        await Promise.resolve();
        events.push("before-done");
      },
      finishShutdown: async () => {
        events.push("after-start");
        await Promise.resolve();
        events.push("after-done");
      },
    });

    await server.listen(0);
    const address = server.transport.server?.address();
    assert.ok(address && typeof address === "object", "transport must expose its bound port");
    const client = new Client("ws://127.0.0.1:" + address.port);
    const joinedRoom = await client.joinOrCreate("shutdown-probe");
    const activeRoom = matchMaker.getLocalRoomById(joinedRoom.roomId);
    assert.ok(activeRoom, "joined room must be registered in the real matchmaker");
    assert.equal(activeRoom.clients.length, 1, "room must have one active SDK client before shutdown");
    assert.equal(matchMaker.stats.local.roomCount, 1, "shutdown probe must not run with zero rooms");

    let shutdownSettled = false;
    const shutdown = server.gracefullyShutdown(false).finally(() => { shutdownSettled = true; });
    let disposeStartTimeout;
    await Promise.race([
      disposeStarted,
      new Promise((_, reject) => {
        disposeStartTimeout = setTimeout(() => reject(new Error("room dispose did not start")), 5_000);
      }),
    ]);
    clearTimeout(disposeStartTimeout);
    await new Promise((resolve) => setTimeout(resolve, 25));

    assert.equal(shutdownSettled, false, "server shutdown must await the blocked Room.onDispose");
    assert.equal(events.includes("after-start"), false, "onShutdown must not start before Room.onDispose resolves");
    assert.equal(disposeCalls, 1, "active room must enter onDispose exactly once");

    releaseDispose();
    await shutdown;

    const order = (name) => {
      const index = events.indexOf(name);
      assert.notEqual(index, -1, "missing lifecycle event: " + name);
      return index;
    };
    assert.ok(order("before-done") < order("room-dispose-start"));
    assert.ok(order("room-dispose-start") < order("room-dispose-done"));
    assert.ok(order("room-dispose-done") < order("after-start"));
    assert.equal(disposeCalls, 1);
    assert.equal(matchMaker.stats.local.roomCount, 0, "real matchmaker room count must drain to zero");
    assert.equal(matchMaker.getLocalRoomById(joinedRoom.roomId), undefined);
    assert.equal(server.transport.server?.address(), null, "transport must close after room drain");
    process.stdout.write(JSON.stringify({ events, disposeCalls }));
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
    env: { ...process.env, NODE_ENV: "test" },
  });
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout) as { events: string[]; disposeCalls: number };
  assert.equal(output.disposeCalls, 1);
  assert.ok(output.events.indexOf("before-done") < output.events.indexOf("room-dispose-start"));
  assert.ok(output.events.indexOf("room-dispose-done") < output.events.indexOf("after-start"));
});
