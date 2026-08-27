import assert from "node:assert/strict";
import { test } from "node:test";
import type Redis from "ioredis";
import { defaultLifecycle, LifecycleRegistry } from "../src/core/infra/lifecycle";
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
      if (id === "sub-1") { readReleased.then(() => release()); }
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
