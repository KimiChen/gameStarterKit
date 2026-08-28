import assert from "node:assert/strict";
import { test } from "node:test";
import {
  installShutdownAggregator,
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
