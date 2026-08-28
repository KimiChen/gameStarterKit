import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type Redis from "ioredis";
import {
  AdmissionClosedError,
  beginShutdown,
  defaultLifecycle,
  LifecycleRegistry,
  resetAdmission,
  TaskTracker,
} from "../src/core/infra/lifecycle";
import { closeMysql, getPool } from "../src/core/infra/mysql";
import { clientFor, closeRedis } from "../src/core/infra/redisRoute";
import { startStreamConsumer } from "../src/core/infra/streamConsumer";

test("LifecycleRegistry：按逆序释放、重复 dispose 只执行一次，并继续处理失败资源", async () => {
  const registry = new LifecycleRegistry();
  const calls: string[] = [];
  registry.register("first", () => { calls.push("first"); });
  registry.register("second", async () => {
    calls.push("second");
    throw new Error("expected cleanup failure");
  });
  registry.register("third", () => { calls.push("third"); });

  await assert.rejects(registry.disposeAll(), AggregateError);
  assert.deepEqual(calls, ["third", "second", "first"]);
  assert.equal(registry.size, 0);
  await registry.disposeAll();
  assert.deepEqual(calls, ["third", "second", "first"]);
});

test("LifecycleRegistry：并发 dispose 共享同一个可等待结果，重复名称不产生双重释放", async () => {
  const registry = new LifecycleRegistry();
  let releases = 0;
  registry.register("resource", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    releases++;
  });
  registry.register("resource", () => { releases += 100; });

  const a = registry.disposeAll();
  const b = registry.disposeAll();
  assert.strictEqual(a, b);
  await Promise.all([a, b]);
  assert.equal(releases, 1);
});

test("LifecycleRegistry：空表开始释放后迟到注册也会被同一轮清理", async () => {
  const registry = new LifecycleRegistry();
  let releases = 0;
  const closing = registry.disposeAll();
  registry.register("late", () => { releases++; });
  await closing;
  assert.equal(releases, 1);
  assert.equal(registry.size, 0);
});

test("LifecycleRegistry：释放期间新增资源按全局逆序处理，并汇总迟到资源错误", async () => {
  const registry = new LifecycleRegistry();
  const calls: string[] = [];
  registry.register("old", () => { calls.push("old"); });
  registry.register("new", () => {
    calls.push("new");
    registry.register("late", () => {
      calls.push("late");
      throw new Error("late cleanup failure");
    });
  });

  await assert.rejects(registry.disposeAll(), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.errors.length, 1);
    return true;
  });
  assert.deepEqual(calls, ["new", "late", "old"]);
  assert.equal(registry.size, 0);
});

test("LifecycleRegistry：停服 Promise 完成后的 macrotask 注册也会立即释放", async () => {
  const registry = new LifecycleRegistry();
  let releases = 0;
  await registry.disposeAll();
  setTimeout(() => registry.register("late-macrotask", () => { releases++; }), 0);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.equal(releases, 1);
  assert.equal(registry.size, 0);
});

test("TaskTracker：等待在途任务并观察失败，不留下未处理 rejection", async () => {
  const tracker = new TaskTracker();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  void tracker.track("pending", pending);
  const draining = tracker.drain();
  assert.equal(tracker.size, 1);
  release();
  await draining;
  assert.equal(tracker.size, 0);
  await tracker.track("failed", Promise.reject(new Error("expected"))).catch(() => {});
  assert.equal(tracker.size, 0);
});

test("TaskTracker：drain 期间登记的迟到任务必须纳入同一轮等待", async () => {
  const tracker = new TaskTracker();
  let releaseFirst!: () => void;
  let releaseLate!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const late = new Promise<void>((resolve) => { releaseLate = resolve; });
  void tracker.track("first", first);

  const draining = tracker.drain();
  // Let drain take its first snapshot and block on `first` before admitting the
  // dependent task.  The late task must be visible to the same Promise.
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  void tracker.track("late", late);
  releaseFirst();

  let finished = false;
  void draining.then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false, "首个任务完成后仍必须等待 drain 期间登记的任务");
  releaseLate();
  await draining;
  assert.equal(tracker.size, 0);
});

test("TaskTracker：close/drain 完成后迟到 rejection 只观察、不重新进入 tracker", async () => {
  const tracker = new TaskTracker();
  const logs: unknown[][] = [];
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    tracker.close();
    await tracker.drain();
    const late = tracker.track("late-after-close", Promise.reject(new Error("late failure")));
    assert.equal(tracker.size, 0);
    await late.catch(() => {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(logs.length, 1, "迟到 rejection 必须被观察并记录一次");
    assert.equal(tracker.size, 0);
  } finally {
    console.error = originalError;
  }
});

test("StreamConsumer：阻塞 stop 期间重启的 consumer 仍登记到 shutdown registry", async () => {
  // Ensure this test does not inherit a registration from another lifecycle
  // probe in the same process.
  await defaultLifecycle.disposeAll();

  let releaseRead!: () => void;
  const readReleased = new Promise<void>((resolve) => { releaseRead = resolve; });
  const disconnected: string[] = [];
  let duplicateSeq = 0;
  const base = {
    duplicate(): Redis {
      const id = `sub-${++duplicateSeq}`;
      let release!: () => void;
      const read = new Promise<null>((resolve) => { release = () => resolve(null); });
      // Keep the first read pending until the test explicitly releases it, so
      // the second start overlaps the first stop.  Later reads end on disconnect.
      if (id === "sub-1") { void readReleased.then(() => release()); }
      const sub = {
        xread: async () => await read,
        xtrim: async () => 0,
        disconnect: () => {
          if (!disconnected.includes(id)) { disconnected.push(id); }
          if (id !== "sub-1") { release(); }
        },
      };
      return sub as unknown as Redis;
    },
  };
  const first = startStreamConsumer("lifecycle-race", () => base as unknown as Redis, "stream:test", () => {});
  // Let the async consumer install its duplicated connection before stopping.
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  const firstStop = first.stop();
  const second = startStreamConsumer("lifecycle-race", () => base as unknown as Redis, "stream:test", () => {});
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  // The first stop is still waiting; releasing it makes the registry proceed to
  // the second instance, whose cleanup must also be awaited and invoked.
  releaseRead();
  await firstStop;
  await defaultLifecycle.disposeAll();
  assert.deepEqual(disconnected.sort(), ["sub-1", "sub-2"]);
  assert.equal(defaultLifecycle.size, 0);

  // Keep the handle referenced so the test documents that both starts are real
  // consumers; its stop is idempotent after registry disposal.
  await second.stop();
});

test("StreamConsumer：同步 duplicate 异常进入重试，且不会产生 unhandledRejection", async () => {
  await defaultLifecycle.disposeAll();
  mock.timers.enable({ apis: ["setTimeout"] });

  let duplicateCalls = 0;
  let releaseRead!: () => void;
  let disconnects = 0;
  const base = {
    duplicate(): Redis {
      duplicateCalls++;
      if (duplicateCalls === 1) {
        throw new Error("duplicate unavailable");
      }
      const read = new Promise<null>((resolve) => { releaseRead = () => resolve(null); });
      return {
        xread: async () => await read,
        xtrim: async () => 0,
        disconnect: () => {
          disconnects++;
          releaseRead();
        },
      } as unknown as Redis;
    },
  };
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);

  try {
    const consumer = startStreamConsumer(
      "duplicate-retry",
      () => base as unknown as Redis,
      "stream:test",
      () => {},
      { trimMs: 0 },
    );
    // The first duplicate throws synchronously and schedules the one-second
    // retry. Advance it deterministically, then stop the pending XREAD.
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    mock.timers.tick(1000);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    assert.equal(duplicateCalls, 2);
    await consumer.stop();
    assert.equal(disconnects, 2, "stop 应打断 read，finally 再幂等断连");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(rejections, []);
  } finally {
    process.off("unhandledRejection", onRejection);
    mock.timers.reset();
    await defaultLifecycle.disposeAll();
  }
});

test("StreamConsumer：disconnect 同步异常仍建立幂等 stop，并注销生命周期登记", async () => {
  await defaultLifecycle.disposeAll();
  let disconnects = 0;
  const consumer = startStreamConsumer(
    "disconnect-throws",
    () => ({
      duplicate: () => ({
        xread: async () => await new Promise<null>(() => {}),
        xtrim: async () => 0,
        disconnect: () => {
          disconnects++;
          throw new Error("disconnect failed");
        },
      }) as unknown as Redis,
    }) as unknown as Redis,
    "stream:test",
    () => {},
    { trimMs: 0 },
  );
  await new Promise<void>((resolve) => queueMicrotask(resolve));

  const stopping = consumer.stop();
  await assert.rejects(stopping, (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    return true;
  });
  assert.equal(defaultLifecycle.size, 0, "断连异常也必须注销 stop 登记，避免停服重试泄漏");
  assert.equal(disconnects, 2, "stop 与 loop finally 各尝试一次，且两次都被观察");
  await assert.rejects(consumer.stop(), AggregateError, "重复 stop 应共享同一失败结果");
  await defaultLifecycle.disposeAll();
});

test("停服后存储入口不复活新连接，显式 reset 后可重建", async () => {
  // Start from an empty generation so this check never touches a local stack.
  await closeRedis();
  await closeMysql();
  beginShutdown();
  try {
    assert.throws(() => clientFor("late-storage"), AdmissionClosedError);
    assert.throws(() => getPool(), AdmissionClosedError);
  } finally {
    resetAdmission();
  }

  // The reset is an explicit embedded/test-process boundary.  A new pool can
  // be constructed, then closed again without leaving the process gated.
  const pool = getPool();
  assert.ok(pool);
  await closeMysql();
  await closeRedis();
});
